import { MODE_LABEL, PROVIDER_LABEL, formatDateTime } from '@/lib/format'
import { runsToPlainText } from '@/lib/editor/inline'
import { inlinePlainText } from '@/lib/parsers/inlineScanner'
import type { ContentBlock } from '@/types/conversation'
import type { LocalDocument, MessageRole, NormalizedMessage } from '@/types/document'
import type { DocumentExportOptions } from '@/types/export'

/**
 * The reading of a stored document that every exporter shares.
 *
 * Five formats, one model: who spoke, in what order, what the turn is
 * worth calling, and what the file says about itself. If the Markdown and
 * the DOCX disagree about either the content or the outline, it is because
 * this file disagrees with itself — so the answers live here once.
 *
 * Nothing here rewrites a block. `exportView` decides which of the stored
 * blocks a page shows and in what order, and every format draws exactly
 * what it hands over: the filtering is a presentation choice the reader
 * makes in the settings rail, and the record in IndexedDB is never touched
 * by it — switch the traces back on and the same blocks are all still there.
 */

/** The speaker, as the document names them. `ROLE_LABEL` is the library's
 *  reader-facing wording; a document is addressed by who said it. */
export const SPEAKER_LABEL: Record<MessageRole, string> = {
  user: 'User',
  assistant: 'Assistant',
  system: 'System',
}

/** Sequence order, not array order: the stored order is a detail of the
 *  last write, and `sequence` is what the record says about itself. */
export function orderedMessages(document: LocalDocument): NormalizedMessage[] {
  return [...document.messages].sort((a, b) => a.sequence - b.sequence)
}

/** A turn's anchor. Same string in the preview, the HTML, the DOCX
 *  bookmarks and the Markdown links, so one jump lands in every format. */
export function turnAnchor(turn: number): string {
  return `pp-turn-${turn}`
}

export function headingAnchor(turn: number, blockIndex: number): string {
  return `pp-h-${turn}-${blockIndex}`
}

/** The elements a site wrote for its own machinery: what the model was
 *  thinking, what a tool returned, what the editing context held. None of
 *  them is something anybody said to anybody. */
const INTERNAL_ELEMENTS = [
  'thoughts',
  'reasoning_recap',
  'model_editable_context',
  'execution_output',
  'citable_code_output',
  'redacted_content',
] as const

/** The fence labels that mean "no language was named", so an empty one of
 *  them is an artifact of the page rather than a block of code. */
const UNNAMED_CODE = new Set(['unknown', 'text', 'plaintext', 'plain text', ''])

/** Whether a block is plumbing rather than part of the conversation. */
function isToolTrace(block: ContentBlock): boolean {
  if (block.kind === 'unsupported') {
    const named = (block.elementType ?? '').trim().toLowerCase()
    if (named.length > 0) return INTERNAL_ELEMENTS.includes(named as (typeof INTERNAL_ELEMENTS)[number])
    const reason = block.reason.toLowerCase()
    return INTERNAL_ELEMENTS.some((element) => reason.includes(element))
  }
  if (block.kind === 'code') {
    const language = (block.language ?? '').trim().toLowerCase()
    return block.code.trim().length === 0 && UNNAMED_CODE.has(language)
  }
  return false
}

/** One turn as a page shows it: who spoke, the number it is given here, and
 *  the blocks the current settings leave in view. */
export interface DisplayTurn {
  message: NormalizedMessage
  turn: number
  content: ContentBlock[]
}

/** What a document looks like under one set of settings, and how much of
 *  itself it is not showing. */
export interface ExportView {
  turns: DisplayTurn[]
  /** Turns left out entirely: a system turn, or a turn whose every block was a trace. */
  hiddenTurns: number
  /** Blocks left out of a turn that is otherwise still on the page. */
  hiddenBlocks: number
}

export function exportView(
  document: LocalDocument,
  options: Pick<DocumentExportOptions, 'hideSystemAndToolTraces'>,
): ExportView {
  const filter = options.hideSystemAndToolTraces
  const turns: DisplayTurn[] = []
  let hiddenTurns = 0
  let hiddenBlocks = 0

  for (const message of orderedMessages(document)) {
    if (!filter) {
      turns.push({ message, turn: turns.length + 1, content: message.content })
      continue
    }
    if (message.role === 'system') {
      hiddenTurns += 1
      continue
    }
    const content = message.content.filter((block) => !isToolTrace(block))
    hiddenBlocks += message.content.length - content.length
    // A turn the site filled with tool output and nothing else is a shell
    // around the plumbing, so the shell goes with it.
    if (content.length === 0 && message.content.length > 0) {
      hiddenTurns += 1
      continue
    }
    turns.push({ message, turn: turns.length + 1, content })
  }

  return { turns, hiddenTurns, hiddenBlocks }
}

/** True when the view is holding something back. */
export function tracesAreHidden(view: ExportView): boolean {
  return view.hiddenTurns + view.hiddenBlocks > 0
}

/** The one sentence that says traces were hidden, worded so it can be read
 *  out loud and so the reader is told where to put them back. */
export const TRACES_HIDDEN_NOTE =
  "Internal AI tool and reasoning traces hidden (toggle 'Include system & tool traces' in Export Settings to show)."

/** How much of a turn an outline line is allowed to say. */
const GIST_MAX = 56

/** The first words of a turn, for an outline line that says something. */
function gist(block: ContentBlock | undefined): string {
  if (!block) return ''
  if (block.kind === 'text') return inlinePlainText(block.text)
  if (block.kind === 'rich') return runsToPlainText(block.runs)
  if (block.kind === 'markdown') return inlinePlainText(block.source)
  if (block.kind === 'heading') return inlinePlainText(block.text)
  if (block.kind === 'code') return `${block.language ? `${block.language} ` : ''}code`
  if (block.kind === 'table') return 'table'
  if (block.kind === 'math') return block.expression
  if (block.kind === 'file') return block.name
  if (block.kind === 'image') return block.alt
  if (block.kind === 'list') return inlinePlainText(block.items[0] ?? '')
  if (block.kind === 'blockquote') return inlinePlainText(block.text)
  if (block.kind === 'link') return block.label
  return block.reason
}

/** The outline line for one turn, read off the blocks the view left in it. */
export function turnGist(content: ContentBlock[]): string {
  const first = content.find((block) => gist(block).trim().length > 0)
  const text = gist(first).replace(/\s+/g, ' ').trim()
  if (text.length === 0) return 'no text'
  return text.length > GIST_MAX ? `${text.slice(0, GIST_MAX).trimEnd()}…` : text
}

/** `Turn 3 · Assistant · 21 Nov, 14:02` — the outline line for a turn. */
export function turnLabel(message: NormalizedMessage, turn: number, content: ContentBlock[]): string {
  const when = message.timestamp ? formatDateTime(message.timestamp) : undefined
  return [`${SPEAKER_LABEL[message.role]} · turn ${turn}`, when, turnGist(content)]
    .filter((part): part is string => Boolean(part))
    .join(' — ')
}

export interface TocEntry {
  id: string
  label: string
  /** 1 is a turn, 2 is a heading inside that turn. */
  level: 1 | 2
}

/** How much an outline line is allowed to name a topic. */
const TOPIC_MAX = 72

/** The question a turn opens with, as its own line. A user turn is usually
 *  one request, and the first line of it is the topic. */
function promptTopic(content: ContentBlock[]): string {
  for (const block of content) {
    if (block.kind === 'code' || block.kind === 'unsupported') continue
    const firstLine = gist(block)
      .split('\n')
      .map((line) => line.replace(/^[#>\-*+\s]+/, '').trim())
      .find((line) => line.length > 0)
    if (firstLine) {
      return firstLine.length > TOPIC_MAX ? `${firstLine.slice(0, TOPIC_MAX).trimEnd()}…` : firstLine
    }
  }
  return ''
}

/** Every turn, with the headings inside it indented below. */
function turnByTurn(turns: DisplayTurn[]): TocEntry[] {
  const entries: TocEntry[] = []
  for (const { message, turn, content } of turns) {
    entries.push({ id: turnAnchor(turn), label: turnLabel(message, turn, content), level: 1 })
    content.forEach((block, blockIndex) => {
      if (block.kind === 'heading') {
        entries.push({
          id: headingAnchor(turn, blockIndex),
          label: inlinePlainText(block.text).replace(/\s+/g, ' ').trim(),
          level: 2,
        })
      }
    })
  }
  return entries
}

/**
 * The outline the contents page shows.
 *
 * `topics` names the shape of the thread — the questions asked and the
 * section headings written under them — so a long conversation opens on the
 * conversation rather than on six pages of turns. `all-turns` is the
 * complete outline, and it is what a thread with no headings and no user
 * turns falls back to, because an empty contents page is not an outline.
 */
export function tocFor(
  document: LocalDocument,
  options: DocumentExportOptions,
): TocEntry[] {
  if (!options.includeToc || options.tocStyle === 'none') return []
  const { turns } = exportView(document, options)
  if (options.tocStyle === 'all-turns' || turns.length === 0) return turnByTurn(turns)

  const entries: TocEntry[] = []
  for (const { message, turn, content } of turns) {
    if (message.role === 'user') {
      const topic = promptTopic(content)
      if (topic.length > 0) entries.push({ id: turnAnchor(turn), label: topic, level: 1 })
    }
    content.forEach((block, blockIndex) => {
      if (block.kind === 'heading' && block.level <= 2) {
        const label = inlinePlainText(block.text).replace(/\s+/g, ' ').trim()
        if (label.length > 0) {
          entries.push({ id: headingAnchor(turn, blockIndex), label, level: 2 })
        }
      }
    })
  }
  return entries.length > 0 ? entries : turnByTurn(turns)
}

/** What the file says about itself, in the order the headers read.
 *  Library bookkeeping — bytes, when the record was saved — is not part of
 *  a document's front matter, so it stays in the studio. */
export function metadataRows(
  document: LocalDocument,
  exportedAt: Date,
  options: DocumentExportOptions,
): { label: string; value: string }[] {
  const view = exportView(document, options)
  const total = document.messages.length
  const shown = view.turns.length
  return [
    { label: 'Source', value: PROVIDER_LABEL[document.provider] },
    { label: 'Document mode', value: MODE_LABEL[document.mode] },
    {
      label: 'Messages',
      value: shown === total ? String(total) : `${shown} of ${total}`,
    },
    { label: 'Exported', value: formatDateTime(exportedAt.toISOString()) },
  ]
}

/** The count that backs the "nothing was dropped" line, read off the blocks
 *  actually written out rather than trusting the stored figures. */
export function contentFootprint(document: LocalDocument, options: DocumentExportOptions): {
  messages: number
  blocks: number
  hiddenTurns: number
  hiddenBlocks: number
  kinds: { kind: ContentBlock['kind']; count: number }[]
} {
  const view = exportView(document, options)
  const counts = new Map<ContentBlock['kind'], number>()
  let blocks = 0
  for (const turn of view.turns) {
    for (const block of turn.content) {
      blocks += 1
      counts.set(block.kind, (counts.get(block.kind) ?? 0) + 1)
    }
  }
  const kinds = [...counts.entries()]
    .map(([kind, count]) => ({ kind, count }))
    .sort((a, b) => a.kind.localeCompare(b.kind))
  return {
    messages: view.turns.length,
    blocks,
    hiddenTurns: view.hiddenTurns,
    hiddenBlocks: view.hiddenBlocks,
    kinds,
  }
}

/** The preservation line, worded from the counts — and worded honestly when
 *  the view is holding traces back rather than writing them out. */
export function preservationStatement(
  document: LocalDocument,
  options: DocumentExportOptions,
): string {
  const { messages, blocks, hiddenTurns, hiddenBlocks } = contentFootprint(document, options)
  const written =
    `Exact conversation: ${messages} ${messages === 1 ? 'message' : 'messages'} and ` +
    `${blocks} content ${blocks === 1 ? 'block' : 'blocks'} written out in full.`
  if (hiddenTurns + hiddenBlocks === 0) {
    return `${written} Nothing here was summarised, paraphrased or dropped.`
  }
  const hidden = hiddenTurns + hiddenBlocks
  return (
    `${written} Nothing shown here was summarised or paraphrased, and ` +
    `${hidden} internal ${hidden === 1 ? 'trace is' : 'traces are'} hidden by this view and ` +
    'stay in the stored document, where switching them back on writes them out again.'
  )
}
