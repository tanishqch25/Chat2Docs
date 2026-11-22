import type { ContentBlock } from '@/types/conversation'
import type { MessageRole } from '@/types/document'

/**
 * What the editor holds between the library and the screen.
 *
 * A turn is split in two on purpose. Its identity — which speaker said it,
 * when it happened, what the import said about it besides the words — is
 * plain React state, drawn in the chrome around the editable region. Its
 * content is a TipTap document, held by the editor instance and read out
 * only when the document is saved.
 *
 * That split is why a conversation cannot be flattened by editing it: the
 * role, the timestamp and the metadata are never inside the prose, so there
 * is no text in which they could be lost.
 */
export interface EditorTurn {
  /** The stored message's own identifier, so a save writes the same id back. */
  key: string
  role: MessageRole
  timestamp?: string
  /** Carried verbatim from the stored message and never rewritten. */
  metadata?: Record<string, unknown>
  /**
   * What the turn arrived with, in the order it arrived.
   *
   * Read once, when the turn's editor is created. After that the words live
   * in TipTap and this field is only the fallback for a save that happens
   * before the editor exists.
   */
  blocks: ContentBlock[]
}

export type SaveStatus = 'saved' | 'dirty' | 'saving'

export const SAVE_STATUS_LABEL: Record<SaveStatus, string> = {
  saved: 'All changes saved',
  dirty: 'Unsaved changes',
  saving: 'Saving…',
}
