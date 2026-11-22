import type { ContentBlock } from '@/types/conversation'
import type { DocumentProvider, NormalizedMessage } from '@/types/document'
import type { ParsedConversationResult } from '@/types/import'

/**
 * The one place an import result is assembled.
 *
 * Every parser hands over its messages, title and warnings and gets back the
 * same envelope, so the counts the preview shows are counted the same way for
 * a pasted thread and a ChatGPT archive. Counting is derived, never trusted
 * from a source file — the same rule the document service follows for
 * `messageCount` and `sizeBytes`.
 */
function countKind(messages: NormalizedMessage[], kind: ContentBlock['kind']): number {
  return messages.reduce(
    (total, message) => total + message.content.filter((block) => block.kind === kind).length,
    0,
  )
}

export function buildResult(input: {
  title: string
  provider: DocumentProvider
  messages: NormalizedMessage[]
  warnings?: string[]
  sourceId?: string
  createdAt?: string
}): ParsedConversationResult {
  const warnings = summariseWarnings(input.warnings ?? [])
  return {
    title: input.title,
    provider: input.provider,
    messages: input.messages,
    warnings,
    sourceId: input.sourceId,
    createdAt: input.createdAt,
    stats: {
      totalMessages: input.messages.length,
      userMessages: input.messages.filter((message) => message.role === 'user').length,
      assistantMessages: input.messages.filter((message) => message.role === 'assistant').length,
      codeBlocks: countKind(input.messages, 'code'),
      tables: countKind(input.messages, 'table'),
      mathBlocks: countKind(input.messages, 'math'),
      warningsCount: warnings.length,
    },
  }
}

/**
 * One preservation note per kind of thing found, with how many.
 *
 * A long export repeats itself: a conversation with nine canvas turns would
 * otherwise fill the summary with nine lines saying the same thing, and the
 * list stops being readable. Notes are keyed by the sentence a parser chose
 * for them, so turns that genuinely differ stay separate, and the count in
 * the text keeps the total honest.
 */
export function summariseWarnings(notes: string[]): string[] {
  const order: string[] = []
  const counts = new Map<string, number>()
  for (const note of notes) {
    counts.set(note, (counts.get(note) ?? 0) + 1)
    if (!order.includes(note)) order.push(note)
  }
  return order.map((note) => {
    const count = counts.get(note) ?? 1
    return count > 1 ? `${note} (${count} times)` : note
  })
}

/** A parser either produces conversations or explains itself. Nothing in
 *  between: a half-read export must never reach the preview looking whole.
 *  `notes` is for things said about the file as a whole — which parts of an
 *  archive were read, which were already covered elsewhere. */
export type ParseResult =
  | { ok: true; results: ParsedConversationResult[]; notes?: string[] }
  | { ok: false; reason: string }

export const notParsed = (reason: string): ParseResult => ({ ok: false, reason })

/** Turn titles are derived from content, and a title is not content: the
 *  thread itself is stored whole whatever this decides. */
export function titleFrom(firstLine: string, fallback = 'Imported conversation'): string {
  const line = firstLine.replace(/^#+\s*/, '').replace(/\*\*/g, '').trim()
  if (!line) return fallback
  return line.length > 80 ? `${line.slice(0, 79)}…` : line
}
