import * as React from 'react'
import { useBlocker, useNavigate } from 'react-router-dom'
import type { Editor } from '@tiptap/react'
import { Plus } from 'lucide-react'

import { ConfirmDialog } from '@/components/documents/confirm-dialog'
import { EditorToolbar } from '@/components/editor/editor-toolbar'
import { EditorTopBar } from '@/components/editor/editor-top-bar'
import { TurnEditor } from '@/components/editor/turn-editor'
import { TurnNavigator } from '@/components/editor/turn-navigator'
import { Button } from '@/components/ui/button'
import { jsonToBlocks } from '@/lib/editor/blockSerializer'
import { documentToTurns, turnsToMessages } from '@/lib/editor/turns'
import { ROLE_LABEL } from '@/lib/format'
import type { DocumentsApi } from '@/hooks/useDocuments'
import type { DocumentContent } from '@/services/documentService'
import { newId } from '@/services/documentService'
import type { EditorTurn, SaveStatus } from '@/types/editor'
import type { LocalDocument, MessageRole } from '@/types/document'

interface EditorWorkspaceProps {
  document: LocalDocument
  library: DocumentsApi
}

/**
 * The editing surface for one saved document.
 *
 * Three things hold this together.
 *
 * The content lives in the editors, not in React state. Each section owns a
 * TipTap document and the words are read out of them only when the document
 * is written — so a keystroke does not re-render the page, and a save does
 * not depend on a component having remembered to report what it holds.
 *
 * A save writes the whole message list, built from the sections in order,
 * with the speakers and timestamps this component still keeps around the
 * editable regions. Blocks that a section never had cannot appear, and
 * blocks it still has cannot vanish: an attachment, a figure or a marker the
 * parser could not read comes back through the serializer as the same object
 * it arrived as.
 *
 * And nothing is written unless it is asked for. `Unsaved changes` is a
 * promise that the browser has not been told yet, which is why leaving here
 * while it shows asks a question instead of losing the work quietly.
 */
function EditorWorkspace({ document: record, library }: EditorWorkspaceProps) {
  const navigate = useNavigate()
  const [title, setTitle] = React.useState(record.title)
  const [turns, setTurns] = React.useState<EditorTurn[]>(() => documentToTurns(record))
  const [status, setStatus] = React.useState<SaveStatus>('saved')
  const [active, setActive] = React.useState<{ key: string; editor: Editor } | null>(null)
  const [pendingRemoval, setPendingRemoval] = React.useState<string | null>(null)

  /** Every live section editor, keyed by the identifier of its message. */
  const editors = React.useRef(new Map<string, Editor>())
  /** Whether the screen and the library disagree. A ref rather than state
   *  because a save has to be able to settle it before it navigates. */
  const dirty = React.useRef(false)
  const saving = React.useRef(false)

  const markDirty = React.useCallback(() => {
    dirty.current = true
    setStatus((current) => (current === 'dirty' ? current : 'dirty'))
  }, [])

  const handleReady = React.useCallback((key: string, editor: Editor) => {
    editors.current.set(key, editor)
    // TipTap builds each editor in its own effect, so the first section is not
    // necessarily known yet when this component mounts. Whoever finishes first
    // gets the toolbar: a bar that opens inert looks broken.
    setActive((current) =>
      current && editors.current.has(current.key) ? current : { key, editor },
    )
  }, [])

  const handleRetire = React.useCallback((key: string) => {
    editors.current.delete(key)
  }, [])

  const handleActive = React.useCallback((key: string, editor: Editor) => {
    setActive((current) => (current?.key === key ? current : { key, editor }))
  }, [])

  // The toolbar acts on a section before the reader has clicked into one, so
  // it opens on the first; a bar that starts inert looks broken.
  React.useEffect(() => {
    setActive((current) => {
      if (current && editors.current.has(current.key)) return current
      const [first] = turns
      if (!first) return null
      const editor = editors.current.get(first.key)
      return editor ? { key: first.key, editor } : current
    })
  }, [turns])

  const buildContent = React.useCallback(
    (): DocumentContent => ({
      title,
      messages: turnsToMessages(turns, (turn) => {
        const editor = editors.current.get(turn.key)
        // A section whose editor is gone keeps the blocks it arrived with,
        // so removing one section cannot silently empty another.
        return editor ? jsonToBlocks(editor.getJSON()) : turn.blocks
      }),
    }),
    [title, turns],
  )

  const save = React.useCallback(async (): Promise<boolean> => {
    if (!dirty.current) return true
    if (saving.current) return false
    saving.current = true
    setStatus('saving')
    try {
      const written = await library.saveContent(record.id, buildContent())
      if (!written) {
        // The library has said why, and the reason is already on screen.
        setStatus('dirty')
        return false
      }
      dirty.current = false
      setStatus('saved')
      return true
    } finally {
      saving.current = false
    }
  }, [buildContent, library, record.id])

  // Both ways out of the editor read the document as it stands, so each one
  // writes first when there is something unsaved — and stops if the browser
  // refused the write rather than exporting or copying a stale record.
  const duplicate = React.useCallback(async () => {
    if (!(await save())) return
    const copy = await library.duplicate(record.id)
    if (copy) navigate(`/editor/${copy.id}`)
  }, [library, navigate, record.id, save])

  const preview = React.useCallback(async () => {
    if (!(await save())) return
    navigate(`/export/${record.id}`)
  }, [navigate, record.id, save])

  const addTurn = React.useCallback(() => {
    setTurns((current) => [...current, { key: newId(), role: 'assistant', blocks: [] }])
    markDirty()
  }, [markDirty])

  const changeRole = React.useCallback(
    (key: string, role: MessageRole) => {
      setTurns((current) => current.map((turn) => (turn.key === key ? { ...turn, role } : turn)))
      markDirty()
    },
    [markDirty],
  )

  const removeTurn = React.useCallback(
    (key: string) => {
      setTurns((current) => current.filter((turn) => turn.key !== key))
      setPendingRemoval(null)
      markDirty()
    },
    [markDirty],
  )

  // Ctrl+S, or Cmd+S, from anywhere in the page — including inside a LaTeX
  // field, where the editor's own keymap never sees the keystroke.
  React.useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey)) return
      if (event.key.toLowerCase() !== 's') return
      event.preventDefault()
      void save()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [save])

  // Closing the tab is the other way work disappears, and the only way to
  // warn about it is to let the browser ask.
  React.useEffect(() => {
    if (status === 'saved') return
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault()
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [status])

  // A fragment jump is a scroll, not a departure, so it is not blocked.
  const blocker = useBlocker(
    React.useCallback(
      ({ currentLocation, nextLocation }) =>
        dirty.current && currentLocation.pathname !== nextLocation.pathname,
      [],
    ),
  )

  const removal = pendingRemoval ? turns.find((turn) => turn.key === pendingRemoval) : undefined

  return (
    <div className="flex flex-col gap-6">
      <EditorTopBar
        title={title}
        status={status}
        busy={status === 'saving'}
        documentId={record.id}
        onTitleChange={(value) => {
          setTitle(value)
          markDirty()
        }}
        onSave={() => void save()}
        onDuplicate={() => void duplicate()}
        onPreview={() => void preview()}
      />

      {library.problem ? (
        <div
          role="alert"
          className="flex flex-wrap items-center gap-4 rounded-product border border-border bg-input p-5"
        >
          <p className="min-w-0 flex-1 text-body text-foreground">{library.problem}</p>
          <Button variant="ghost" size="sm" onClick={library.dismissProblem}>
            Dismiss
          </Button>
        </div>
      ) : null}

      <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,300px)_minmax(0,1fr)] lg:gap-12">
        <aside className="order-last min-w-0 lg:order-first">
          <TurnNavigator document={record} turns={turns} activeKey={active?.key ?? null} />
        </aside>

        <section aria-label="Document, editable" className="flex min-w-0 flex-col">
          <div className="sticky top-[var(--nav-height)] z-30">
            {/* useEditorState binds to the editor it is given when it mounts, so
                a new section needs a fresh bar rather than a reused one. */}
            <EditorToolbar key={active?.key ?? 'idle'} editor={active?.editor ?? null} />
          </div>

          <div
            data-grid-avoid=""
            className="mt-6 flex flex-col gap-6 rounded-product border border-border bg-card p-5 shadow-card sm:p-8"
          >
            {turns.length === 0 ? (
              <p className="text-body text-muted">
                This document has no sections yet. Add one below; it is written to the library with
                the rest when you save.
              </p>
            ) : null}

            {turns.map((turn, index) => (
              <TurnEditor
                key={turn.key}
                turn={turn}
                position={index + 1}
                onReady={handleReady}
                onRetire={handleRetire}
                onActive={handleActive}
                onChanged={markDirty}
                onRoleChange={changeRole}
                onRemove={setPendingRemoval}
              />
            ))}

            <div className="border-t border-border pt-6">
              <Button variant="outline" onClick={addTurn}>
                <Plus aria-hidden className="size-4" /> Add section / turn
              </Button>
            </div>
          </div>
        </section>
      </div>

      {removal ? (
        <ConfirmDialog
          title="Remove this section?"
          description={
            <>
              Section {turns.indexOf(removal) + 1} ({ROLE_LABEL[removal.role]}). Removing it takes
              its words out of the document as soon as it is saved, and a section that is gone from
              the page has no undo.
            </>
          }
          confirmLabel="Remove section"
          busy={false}
          onConfirm={() => removeTurn(removal.key)}
          onCancel={() => setPendingRemoval(null)}
        />
      ) : null}

      {blocker.state === 'blocked' ? (
        <ConfirmDialog
          title="Leave with unsaved changes?"
          description={
            <>
              This page holds edits the browser has not been given yet. Leaving now discards them;
              the document in the library stays exactly as it was last saved.
            </>
          }
          confirmLabel="Leave anyway"
          cancelLabel="Stay"
          busy={false}
          onConfirm={() => blocker.state === 'blocked' && blocker.proceed()}
          onCancel={() => blocker.state === 'blocked' && blocker.reset()}
        />
      ) : null}
    </div>
  )
}

export { EditorWorkspace }
