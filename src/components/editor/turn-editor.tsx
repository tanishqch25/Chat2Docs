import * as React from 'react'
import type { Editor } from '@tiptap/react'
import { EditorContent, useEditor } from '@tiptap/react'

import { blocksToDoc } from '@/lib/editor/blockSerializer'
import { editorExtensions } from '@/lib/editor/extensions'
import { formatDateTime, ROLE_LABEL } from '@/lib/format'
import type { EditorTurn } from '@/types/editor'
import { MESSAGE_ROLES } from '@/types/document'
import type { MessageRole } from '@/types/document'

interface TurnEditorProps {
  turn: EditorTurn
  /** Position in the conversation, shown as the number beside the speaker. */
  position: number
  /** This turn's editor exists and can be read from. */
  onReady: (key: string, editor: Editor) => void
  /** This turn's editor is gone, so nothing may read from it again. */
  onRetire: (key: string) => void
  /** The reader is typing here — the toolbar follows and the save knows. */
  onActive: (key: string, editor: Editor) => void
  onChanged: () => void
  onRoleChange: (key: string, role: MessageRole) => void
  onRemove: (key: string) => void
}

const SPEAKER =
  'cursor-pointer appearance-none rounded-badge bg-badge-bg px-2.5 py-1 text-caption font-medium text-deep-cobalt'

/**
 * One turn of the conversation, as an editor.
 *
 * The split is the whole point of this component. Everything that makes a
 * turn *whose words these are* — the speaker, the moment, whatever the
 * import said about the node — is drawn here, in React, outside the editable
 * region. Only the content goes into TipTap. A conversation therefore cannot
 * be flattened into one run of prose by editing it: the roles are not in
 * that run to lose, and the save reads them from this header.
 *
 * One editor per turn is also what keeps undo honest. Ctrl+Z rewinds the
 * section it was pressed in, never the whole document — which is surprising
 * only until the alternative is imagined: an undo that quietly rewrote a
 * paragraph three turns up.
 */
function TurnEditor({
  turn,
  position,
  onReady,
  onRetire,
  onActive,
  onChanged,
  onRoleChange,
  onRemove,
}: TurnEditorProps) {
  // The stored blocks are read exactly once per turn, when the document
  // model is built. After that the words live in the editor, and a re-render
  // of this component must not put the old ones back.
  const content = React.useMemo(() => blocksToDoc(turn.blocks), [turn.blocks])

  const editor = useEditor({
    extensions: editorExtensions,
    content,
    autofocus: false,
    editorProps: {
      attributes: {
        class: 'pp-editor-prose',
        'aria-label': `${ROLE_LABEL[turn.role]}, section ${position}`,
      },
    },
    onUpdate: () => onChanged(),
    onFocus: () => onActive(turn.key, editor),
  })

  React.useEffect(() => {
    onReady(turn.key, editor)
    return () => onRetire(turn.key)
  }, [turn.key, editor, onReady, onRetire])

  const label = `Section ${position}, ${ROLE_LABEL[turn.role]}`

  return (
    <section id={`turn-${turn.key}`} aria-label={label} className="border-t border-border pt-6 first:border-t-0 first:pt-0">
      <header className="pp-chrome mb-3 flex flex-wrap items-center gap-x-3 gap-y-2">
        <span className="text-caption font-semibold tracking-[0.16em] text-slate-gray uppercase tabular-nums">
          {String(position).padStart(2, '0')}
        </span>
        <label className="relative inline-flex items-center">
          <span className="sr-only">Speaker for section {position}</span>
          <select
            value={turn.role}
            onChange={(event) => onRoleChange(turn.key, event.target.value as MessageRole)}
            className={SPEAKER}
          >
            {MESSAGE_ROLES.map((role) => (
              <option key={role} value={role}>
                {ROLE_LABEL[role]}
              </option>
            ))}
          </select>
          <svg
            aria-hidden
            viewBox="0 0 10 6"
            className="pointer-events-none absolute right-1.5 size-2.5 fill-current"
          >
            <path d="M0 0h10L5 6z" />
          </svg>
        </label>
        {turn.timestamp ? (
          <span className="text-caption text-muted">{formatDateTime(turn.timestamp)}</span>
        ) : (
          <span className="text-caption text-muted">No timestamp</span>
        )}
        <button
          type="button"
          onClick={() => onRemove(turn.key)}
          aria-label={`Remove ${label.toLowerCase()}`}
          className="ml-auto text-caption font-medium text-muted underline-offset-4 transition-colors hover:text-foreground hover:underline"
        >
          Remove section
        </button>
      </header>
      <EditorContent editor={editor} />
    </section>
  )
}

export { TurnEditor }
