import type { ContentBlock } from '@/types/conversation'

/**
 * The local document record.
 *
 * A document is a conversation that has been preserved, so the message
 * shape is the normalized one from the conversation model rather than a
 * second stringly-typed list: content stays a run of blocks, never a
 * flattened string. That is what lets Milestone 3 import adapters drop
 * parsed ChatGPT, Gemini or Claude exports into this same store without
 * a rewrite, and what keeps a code block from degrading every time a
 * document is saved back out.
 */

export const DOCUMENT_PROVIDERS = ['chatgpt', 'gemini', 'claude', 'generic'] as const

export type DocumentProvider = (typeof DOCUMENT_PROVIDERS)[number]

export const DOCUMENT_MODES = ['exact', 'study_notes', 'interview_prep', 'custom'] as const

export type DocumentMode = (typeof DOCUMENT_MODES)[number]

export const MESSAGE_ROLES = ['user', 'assistant', 'system'] as const

export type MessageRole = (typeof MESSAGE_ROLES)[number]

/** One turn of a conversation, in the order it happened. */
export interface NormalizedMessage {
  id: string
  role: MessageRole
  /** Blocks, not a string: see the note above. */
  content: ContentBlock[]
  /** Position in the conversation. Rendering sorts on this, not array order. */
  sequence: number
  timestamp?: string
  /** What an export said about this turn that is not content — the model
   *  slug, the source node id. Kept verbatim so preserving it never depends
   *  on PromptPaper having a field for it, and never rewritten on save. */
  metadata?: Record<string, unknown>
}

export interface LocalDocument {
  id: string
  title: string
  provider: DocumentProvider
  mode: DocumentMode
  messages: NormalizedMessage[]
  /** Derived, and recalculated on every write rather than trusted from a file. */
  messageCount: number
  /** UTF-8 bytes of the stored content, so the figure matches what is kept. */
  sizeBytes: number
  createdAt: string
  updatedAt: string
}

/** Bumped only when the record shape changes in a way an older app cannot read. */
export const DOCUMENT_SCHEMA_VERSION = 1

/** The whole library, as it is written to and read from a backup file. */
export interface BackupEnvelope {
  app: 'PromptPaper'
  schemaVersion: number
  exportedAt: string
  documentCount: number
  documents: LocalDocument[]
}
