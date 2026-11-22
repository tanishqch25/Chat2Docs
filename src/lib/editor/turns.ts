import type { EditorTurn } from '@/types/editor'
import type { ContentBlock } from '@/types/conversation'
import type { LocalDocument, NormalizedMessage } from '@/types/document'

/**
 * The two-way bridge between a stored document and the editor's turns.
 *
 * Both directions keep the fields the editor has no business deciding:
 * `sequence` is re-derived from position because removing a section moves
 * everything after it up, and `role`, `timestamp` and `metadata` travel
 * through untouched. Content is the one part that is rewritten, and only by
 * the serializer, which returns a block it did not change verbatim.
 */

/**
 * A document as the editor opens it.
 *
 * Sorting on `sequence` rather than trusting the array order is the same
 * rule every renderer follows — a file restored from a backup can list its
 * messages out of order, and the editor must not then invite someone to
 * save them that way.
 */
export function documentToTurns(document: LocalDocument): EditorTurn[] {
  return [...document.messages]
    .sort((a, b) => a.sequence - b.sequence)
    .map((message) => ({
      key: message.id,
      role: message.role,
      timestamp: message.timestamp,
      metadata: message.metadata,
      blocks: message.content,
    }))
}

/**
 * The turns, back into the messages the library stores.
 *
 * `blocksOf` is where the live editor documents come from; a turn whose
 * editor is not there any more keeps the blocks it arrived with rather than
 * writing an empty turn over it. A turn with nothing left in it is not a
 * message — the same rule the composer has always applied.
 */
export function turnsToMessages(
  turns: EditorTurn[],
  blocksOf: (turn: EditorTurn) => ContentBlock[],
): NormalizedMessage[] {
  const messages: NormalizedMessage[] = []
  for (const turn of turns) {
    const content = blocksOf(turn)
    if (content.length === 0) continue
    messages.push({
      id: turn.key,
      role: turn.role,
      content,
      sequence: messages.length,
      timestamp: turn.timestamp,
      metadata: turn.metadata,
    })
  }
  return messages
}
