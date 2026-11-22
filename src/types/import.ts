import type { DocumentProvider, NormalizedMessage } from '@/types/document'

/**
 * The envelope every import adapter returns.
 *
 * Parsers are provider-specific; this is not. The preview, the summary bar
 * and the save path read only these fields, so adding a format means adding
 * a parser rather than another branch in the workspace.
 */

export interface ParsedConversationStats {
  totalMessages: number
  userMessages: number
  assistantMessages: number
  codeBlocks: number
  tables: number
  mathBlocks: number
  warningsCount: number
}

export interface ParsedConversationResult {
  title: string
  provider: DocumentProvider
  messages: NormalizedMessage[]
  stats: ParsedConversationStats
  /** Anything the source carried that could not be rendered: unsupported
   *  elements, binary attachments, skipped empty nodes, heuristics used. */
  warnings: string[]
  /** Identifier for this conversation inside the file it came from — an
   *  export id, or a position when the file carries none. The picker keys on
   *  it so one thread of a hundred stays selectable after a re-sort. */
  sourceId?: string
  /** When the source says the conversation started, for the picker's label. */
  createdAt?: string
}
