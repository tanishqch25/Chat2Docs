import { buildResult } from '@/lib/parsers/envelope'
import { newId } from '@/services/documentService'
import type { DocumentProvider, MessageRole, NormalizedMessage } from '@/types/document'
import type { ImportCandidate } from '@/components/import/types'
import type { ParsedConversationResult, ParsedConversationStats } from '@/types/import'

/**
 * A conversation while it is being checked over.
 *
 * The parser's result is a claim about a file; this is working state on top
 * of it, and the difference that matters is `removed`. Messages taken out
 * here are kept rather than discarded so the summary can say so plainly —
 * an edit that quietly reduces the count would be the silent drop this
 * import is built to avoid.
 */

export interface ImportDraft {
  key: string
  title: string
  provider: DocumentProvider
  /** The turns as they now stand, in the order they will be saved. */
  messages: NormalizedMessage[]
  /** Turns removed on this screen, held verbatim. */
  removed: NormalizedMessage[]
  /** What the reader said about the file, unchanged. */
  warnings: string[]
  /** Which file this came from, when more than one was read. */
  source?: string
  createdAt?: string
}

const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? '' : 's'}`

/** One conversation from a file, given a key the picker can tick. */
export function candidateFromResult(
  result: ParsedConversationResult,
  source?: string,
): ImportCandidate {
  return { key: newId(), result, source }
}

/**
 * A chosen candidate, ready to be checked over. The key carries over from
 * the picker so React keeps the right card — and the right scroll of its
 * preview — when the list is edited around it.
 */
export function draftFromResult(candidate: ImportCandidate): ImportDraft {
  const { result } = candidate
  return {
    key: candidate.key,
    title: result.title,
    provider: result.provider,
    messages: result.messages,
    removed: [],
    warnings: result.warnings,
    source: candidate.source,
    createdAt: result.createdAt,
  }
}

export const setTitle = (draft: ImportDraft, title: string): ImportDraft => ({
  ...draft,
  title,
})

export const setRole = (
  draft: ImportDraft,
  index: number,
  role: MessageRole,
): ImportDraft => ({
  ...draft,
  messages: draft.messages.map((message, at) => (at === index ? { ...message, role } : message)),
})

/**
 * Join a turn to the one above it by putting its blocks after that one's.
 *
 * Nothing is merged at the text level: two blocks that arrive separately
 * stay separate and simply end up in the same message, which is what a
 * corrected boundary should look like without editing a word.
 */
export function mergeUp(draft: ImportDraft, index: number): ImportDraft {
  if (index === 0) return draft
  const above = draft.messages[index - 1]
  const here = draft.messages[index]
  if (!above || !here) return draft
  const merged: NormalizedMessage = { ...above, content: [...above.content, ...here.content] }
  const messages = draft.messages.slice()
  messages[index - 1] = merged
  messages.splice(index, 1)
  return { ...draft, messages }
}

export function removeAt(draft: ImportDraft, index: number): ImportDraft {
  const here = draft.messages[index]
  if (!here) return draft
  return {
    ...draft,
    messages: draft.messages.filter((_, at) => at !== index),
    removed: [...draft.removed, here],
  }
}

export interface DraftReport {
  stats: ParsedConversationStats
  warnings: string[]
}

/** The figures and notes for the summary bar, counted from the edited
 *  messages rather than from the file, so the bar follows every change. */
export function reportOf(draft: ImportDraft): DraftReport {
  const warnings =
    draft.removed.length === 0
      ? draft.warnings
      : [
          ...draft.warnings,
          `${plural(draft.removed.length, 'message')} removed here and ${
            draft.removed.length === 1 ? 'is' : 'are'
          } not saved. ${
            draft.removed.length === 1 ? 'Its' : 'Their'
          } text was not merged into another message.`,
        ]
  const report = buildResult({
    title: draft.title,
    provider: draft.provider,
    messages: draft.messages,
    warnings,
  })
  return { stats: report.stats, warnings: report.warnings }
}

/** An empty conversation is not a document, and saving one would put a blank
 *  record in the library. */
export const isSavable = (draft: ImportDraft): boolean =>
  draft.messages.length > 0 && draft.title.trim().length > 0
