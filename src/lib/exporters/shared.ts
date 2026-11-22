import { MODE_LABEL, PROVIDER_LABEL, formatBytes, formatDateTime } from '@/lib/format'
import { runsToPlainText } from '@/lib/editor/inline'
import type { ContentBlock } from '@/types/conversation'
import type { LocalDocument, MessageRole, NormalizedMessage } from '@/types/document'

/**
 * The reading of a stored document that every exporter shares.
 *
 * Five formats, one model: who spoke, in what order, what the turn is
 * worth calling, and what the file says about itself. If the Markdown and
 * the DOCX disagree about either the content or the outline, it is because
 * this file disagrees with itself — so the answers live here once.
 *
 * Nothing here rewrites a block. Text is taken as stored, and the only
 * arithmetic is counting.
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

/** How much of a turn an outline line is allowed to say. */
const GIST_MAX = 56

/** The first words of a turn, for an outline line that says something. */
function gist(block: ContentBlock | undefined): string {
  if (!block) return ''
  if (block.kind === 'text') return block.text
  if (block.kind === 'rich') return runsToPlainText(block.runs)
  if (block.kind === 'markdown') return block.source
  if (block.kind === 'heading') return block.text
  if (block.kind === 'code') return `${block.language ? `${block.language} ` : ''}code`
  if (block.kind === 'table') return 'table'
  if (block.kind === 'math') return block.expression
  if (block.kind === 'file') return block.name
  if (block.kind === 'image') return block.alt
  if (block.kind === 'list') return block.items[0] ?? ''
  if (block.kind === 'blockquote') return block.text
  if (block.kind === 'link') return block.label
  return block.reason
}

export function turnGist(message: NormalizedMessage): string {
  const first = message.content.find((block) => gist(block).trim().length > 0)
  const text = gist(first).replace(/\s+/g, ' ').trim()
  if (text.length === 0) return 'no text'
  return text.length > GIST_MAX ? `${text.slice(0, GIST_MAX).trimEnd()}…` : text
}

/** `Turn 3 · Assistant · 21 Nov, 14:02` — the outline line for a turn. */
export function turnLabel(message: NormalizedMessage, turn: number): string {
  const when = message.timestamp ? formatDateTime(message.timestamp) : undefined
  return [`${SPEAKER_LABEL[message.role]} · turn ${turn}`, when, turnGist(message)]
    .filter((part): part is string => Boolean(part))
    .join(' — ')
}

export interface TocEntry {
  id: string
  label: string
  /** 1 is a turn, 2 is a heading inside that turn. */
  level: 1 | 2
}

/**
 * The outline: every turn, with the headings inside it indented below.
 *
 * A thread with no headings still gets a usable table of contents, because
 * the turns themselves are the structure of a conversation.
 */
export function tocFor(document: LocalDocument): TocEntry[] {
  const entries: TocEntry[] = []
  orderedMessages(document).forEach((message, index) => {
    const turn = index + 1
    entries.push({ id: turnAnchor(turn), label: turnLabel(message, turn), level: 1 })
    message.content.forEach((block, blockIndex) => {
      if (block.kind === 'heading') {
        entries.push({
          id: headingAnchor(turn, blockIndex),
          label: block.text.replace(/\s+/g, ' ').trim(),
          level: 2,
        })
      }
    })
  })
  return entries
}

/** What the file says about itself, in the order the headers read. */
export function metadataRows(document: LocalDocument, exportedAt: Date): { label: string; value: string }[] {
  return [
    { label: 'Title', value: document.title },
    { label: 'Source', value: PROVIDER_LABEL[document.provider] },
    { label: 'Document mode', value: MODE_LABEL[document.mode] },
    { label: 'Messages', value: String(document.messageCount) },
    { label: 'Stored size', value: formatBytes(document.sizeBytes) },
    { label: 'Saved in this browser', value: formatDateTime(document.createdAt) },
    { label: 'Last edited', value: formatDateTime(document.updatedAt) },
    { label: 'Exported', value: formatDateTime(exportedAt.toISOString()) },
  ]
}

/** The count that backs the "nothing was dropped" line, read off the
 *  blocks themselves rather than trusting the stored figures. */
export function contentFootprint(document: LocalDocument): {
  messages: number
  blocks: number
  kinds: { kind: ContentBlock['kind']; count: number }[]
} {
  const counts = new Map<ContentBlock['kind'], number>()
  let blocks = 0
  for (const message of document.messages) {
    for (const block of message.content) {
      blocks += 1
      counts.set(block.kind, (counts.get(block.kind) ?? 0) + 1)
    }
  }
  const kinds = [...counts.entries()]
    .map(([kind, count]) => ({ kind, count }))
    .sort((a, b) => a.kind.localeCompare(b.kind))
  return { messages: document.messages.length, blocks, kinds }
}

/** The preservation line, worded from the counts. */
export function preservationStatement(document: LocalDocument): string {
  const { messages, blocks } = contentFootprint(document)
  return (
    `Exact conversation: ${messages} ${messages === 1 ? 'message' : 'messages'} and ` +
    `${blocks} content ${blocks === 1 ? 'block' : 'blocks'} written out in full. ` +
    'Nothing here was summarised, paraphrased or dropped.'
  )
}
