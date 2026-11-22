import type { ParsedConversationResult } from '@/types/import'

/**
 * A conversation that has been read out of a file and is waiting to be
 * chosen.
 *
 * The key is made by whoever collects the candidates rather than taken from
 * the export: a batch archive can hold two threads with the same title from
 * the same provider, and the picker needs something to tick that is not a
 * duplicate of anything else.
 */
export interface ImportCandidate {
  key: string
  result: ParsedConversationResult
  /** Which file it came from, when more than one was read. */
  source?: string
}
