import { runsToPlainText } from '@/lib/editor/inline'
import { MODE_LABEL, PROVIDER_LABEL, ROLE_LABEL } from '@/lib/format'
import type { ContentBlock } from '@/types/conversation'
import type { DocumentMode, DocumentProvider, LocalDocument, MessageRole } from '@/types/document'

/**
 * Full-text search over the local library.
 *
 * Pure TypeScript over the records it is handed: no index is stored, no
 * worker, no dependency. A library is a handful of documents the same
 * browser already holds in memory, so scanning it on keystroke is cheaper
 * than maintaining something that could drift from it — and a search that
 * reads the records themselves cannot report a document that was deleted.
 *
 * Matching is case-insensitive substring matching, and that is the whole
 * promise. A stemmer or a fuzzy score would sometimes find words the
 * conversation never contained, which in a product whose rule is that a
 * document is what its source said is a worse failure than missing a plural.
 */

/** Where a match came from, named the way the interface names it. */
export type SearchField =
  | 'Title'
  | 'Source'
  | 'Mode'
  | 'Turn'
  | 'Prose'
  | 'Heading'
  | 'List'
  | 'Quote'
  | 'Code'
  | 'Table'
  | 'Math'
  | 'Link'
  | 'File'
  | 'Image'
  | 'Kept'

/** What a reader was most likely looking for, in the order the palette lists it. */
const WEIGHT: Record<SearchField, number> = {
  Title: 100,
  Source: 62,
  Mode: 60,
  Heading: 56,
  Prose: 50,
  Code: 48,
  Math: 46,
  Table: 44,
  List: 42,
  Quote: 40,
  Link: 38,
  File: 36,
  Image: 34,
  Kept: 30,
  Turn: 20,
}

/** The three results a document may contribute. Without a cap one long
 *  thread fills the palette and the rest of the library cannot be seen. */
const PER_DOCUMENT = 3

/** Results with nothing typed. */
const RECENT = 6

/** How much room a snippet shows on each side of the phrase. */
const RADIUS = 44

const ELLIPSIS = '…'

/** Words are shown on one line. A code block keeps its meaning in the
 *  snippet while the newline it came from does not break the palette row. */
const oneLine = (value: string) => value.replace(/\s+/g, ' ')

/** Split around the phrase so the palette can mark it without HTML. */
export interface SearchSnippet {
  before: string
  match: string
  after: string
}

export interface SearchMatch {
  docId: string
  docTitle: string
  provider: DocumentProvider
  mode: DocumentMode
  /** For the "edited …" line, and the tie-break when two documents match
   *  the same field equally. */
  updatedAt: string
  matchedIn: SearchField
  /** Position in the conversation, or null for a match about the document
   *  itself rather than a turn of it. */
  turnIndex: number | null
  role: MessageRole | null
  snippet: SearchSnippet
}

interface Candidate {
  kind: SearchField
  text: string
  turnIndex: number | null
  role: MessageRole | null
}

/**
 * Every string in one block that a reader might name.
 *
 * The switch covers all thirteen kinds with no default, so a fourteenth kind
 * added to `ContentBlock` fails to compile here rather than quietly becoming
 * unsearchable — which is the one way this file can break the rule that
 * nothing in a stored document is out of reach of the search box.
 *
 * An image's `src` is deliberately absent. It is usually a data URI, and
 * matching inside base64 would return a "result" that is nothing a person
 * typed.
 */
function blockCandidates(block: ContentBlock): { kind: SearchField; text: string }[] {
  switch (block.kind) {
    case 'text':
      return [{ kind: 'Prose', text: block.text }]
    case 'markdown':
      return [{ kind: 'Prose', text: block.source }]
    case 'rich':
      // One candidate for the whole paragraph, marks removed: a phrase that
      // happens to start on a bold word is still one phrase.
      return [{ kind: 'Prose', text: runsToPlainText(block.runs) }]
    case 'heading':
      return [{ kind: 'Heading', text: block.text }]
    case 'list':
      return block.items.map((item) => ({ kind: 'List' as const, text: item }))
    case 'blockquote':
      return [{ kind: 'Quote', text: block.text }]
    case 'code': {
      const labels = [block.language, block.filename, block.caption].filter(
        (label): label is string => Boolean(label),
      )
      return [{ kind: 'Code', text: block.code }, ...labels.map((text) => ({ kind: 'Code' as const, text }))]
    }
    case 'table': {
      const cells = block.rows.flat()
      const labels = block.caption ? [block.caption] : []
      return [
        ...block.headers.map((header) => ({ kind: 'Table' as const, text: header })),
        ...cells.map((cell) => ({ kind: 'Table' as const, text: cell })),
        ...labels.map((text) => ({ kind: 'Table' as const, text })),
      ]
    }
    case 'math':
      return [{ kind: 'Math', text: block.expression }]
    case 'link':
      return [
        { kind: 'Link', text: block.label },
        { kind: 'Link', text: block.href },
      ]
    case 'image':
      return [{ kind: 'Image', text: block.alt }]
    case 'file': {
      const labels = [block.mimeType, block.note].filter(
        (label): label is string => Boolean(label),
      )
      return [{ kind: 'File', text: block.name }, ...labels.map((text) => ({ kind: 'File' as const, text }))]
    }
    case 'unsupported': {
      // The block PromptPaper could not interpret is still searchable by
      // what the export called it.
      const labels = block.elementType ? [block.elementType] : []
      return [{ kind: 'Kept', text: block.reason }, ...labels.map((text) => ({ kind: 'Kept' as const, text }))]
    }
  }
}

function documentCandidates(document: LocalDocument): Candidate[] {
  const outside = { turnIndex: null, role: null }
  const candidates: Candidate[] = [
    { kind: 'Title', text: document.title, ...outside },
    { kind: 'Source', text: PROVIDER_LABEL[document.provider], ...outside },
    { kind: 'Source', text: document.provider, ...outside },
    { kind: 'Mode', text: MODE_LABEL[document.mode], ...outside },
    { kind: 'Mode', text: document.mode, ...outside },
  ]

  const messages = [...document.messages].sort((a, b) => a.sequence - b.sequence)
  messages.forEach((message, turnIndex) => {
    // The slug and its label are both searched, so "assistant" and
    // "AI reply" find the same turn.
    const who = { turnIndex, role: message.role }
    candidates.push({ kind: 'Turn', text: ROLE_LABEL[message.role], ...who })
    candidates.push({ kind: 'Turn', text: message.role, ...who })
    if (message.timestamp) candidates.push({ kind: 'Turn', text: message.timestamp, ...who })
    for (const block of message.content) {
      for (const field of blockCandidates(block)) {
        candidates.push({ kind: field.kind, text: field.text, ...who })
      }
    }
  })

  return candidates
}

/** The window around a phrase, in the words the document actually used.
 *  Whitespace on the inner edges is kept, because it is the space between two
 *  words: trimming it is what makes a code snippet read "classTokenBucket".
 *  Only the outer edges are cut — those are the boundaries this function
 *  chose, not anything the conversation said. */
function snippetAround(text: string, at: number, needle: string): SearchSnippet {
  const from = Math.max(0, at - RADIUS)
  const to = Math.min(text.length, at + needle.length + RADIUS)
  return {
    before: `${from > 0 ? ELLIPSIS : ''}${oneLine(text.slice(from, at)).trimStart()}`,
    // Cut from the stored text, not from its lowercase copy, so what is
    // shown keeps the case the conversation used.
    match: oneLine(text.slice(at, at + needle.length)),
    after: `${oneLine(text.slice(at + needle.length, to)).trimEnd()}${to < text.length ? ELLIPSIS : ''}`,
  }
}

/** The best hits one document can give for this phrase, strongest field first. */
function matchDocument(document: LocalDocument, needle: string): SearchMatch[] {
  const found: SearchMatch[] = []

  for (const candidate of documentCandidates(document)) {
    if (!candidate.text) continue
    const at = candidate.text.toLowerCase().indexOf(needle)
    if (at < 0) continue
    found.push({
      docId: document.id,
      docTitle: document.title,
      provider: document.provider,
      mode: document.mode,
      updatedAt: document.updatedAt,
      matchedIn: candidate.kind,
      turnIndex: candidate.turnIndex,
      role: candidate.role,
      snippet: snippetAround(candidate.text, at, needle),
    })
  }

  return found
    .sort((a, b) => WEIGHT[b.matchedIn] - WEIGHT[a.matchedIn])
    .slice(0, PER_DOCUMENT)
}

/** Newest edited first, so a caller may pass any order it holds. */
function byRecentEdit(documents: LocalDocument[]): LocalDocument[] {
  return [...documents].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
}

function recentMatches(documents: LocalDocument[], count: number): SearchMatch[] {
  return documents.slice(0, count).map((document) => ({
    docId: document.id,
    docTitle: document.title,
    provider: document.provider,
    mode: document.mode,
    updatedAt: document.updatedAt,
    matchedIn: 'Title' as const,
    turnIndex: null,
    role: null,
    // Nothing was matched; the palette shows the document, not a quote.
    snippet: { before: '', match: '', after: '' },
  }))
}

/**
 * Search the library, ranked.
 *
 * With a phrase, results are ordered by the field that matched — a title
 * before a paragraph, a paragraph before a timestamp — and a document
 * contributes at most three rows. With nothing typed, the most recently
 * edited documents come back instead, so the palette is a quick-jump list
 * the moment it opens rather than an empty box waiting for words.
 */
export function searchDocuments(
  documents: LocalDocument[],
  query: string,
  limit = 20,
): SearchMatch[] {
  const recent = byRecentEdit(documents)
  const needle = query.trim().toLowerCase()
  if (!needle) return recentMatches(recent, Math.min(limit, RECENT))

  const matches: SearchMatch[] = []
  for (const document of recent) matches.push(...matchDocument(document, needle))

  return matches
    .sort(
      (a, b) =>
        WEIGHT[b.matchedIn] - WEIGHT[a.matchedIn] ||
        b.updatedAt.localeCompare(a.updatedAt) ||
        (a.turnIndex ?? -1) - (b.turnIndex ?? -1),
    )
    .slice(0, limit)
}
