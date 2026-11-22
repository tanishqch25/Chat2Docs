import * as React from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft, Copy, Eye, Sparkles } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { buttonVariants } from '@/components/ui/button-variants'
import { SAVE_STATUS_LABEL } from '@/types/editor'
import type { SaveStatus } from '@/types/editor'

interface EditorTopBarProps {
  title: string
  status: SaveStatus
  busy: boolean
  /** The transform works on a saved record, so it is addressed by identifier
   *  rather than by what is currently typed here. */
  documentId: string
  onTitleChange: (title: string) => void
  onSave: () => void
  onDuplicate: () => void
  onPreview: () => void
}

const SHORTCUT = /Mac|iPhone|iPad|iPod/.test(
  typeof navigator === 'undefined' ? '' : navigator.userAgent,
)
  ? '⌘S'
  : 'Ctrl+S'

/**
 * The document's name, how it is going, and the three ways out.
 *
 * The title is an input rather than a heading because it is editable — a
 * reader who has just rewritten a section usually wants to rename the
 * document in the same breath, and the library already let them name it once.
 *
 * The save state is written as a sentence, not a spinner, and it is a live
 * region: someone who tabs away to the toolbar and back should still be able
 * to find out whether the work is on disk. `Unsaved changes` is the honest
 * label for the one thing an editor can get wrong.
 */
function EditorTopBar({
  title,
  status,
  busy,
  documentId,
  onTitleChange,
  onSave,
  onDuplicate,
  onPreview,
}: EditorTopBarProps) {
  const heading = React.useId()

  return (
    <div className="flex flex-col gap-5">
      <Link
        to="/documents"
        className="inline-flex items-center gap-2 self-start text-caption font-medium text-muted transition-colors hover:text-foreground"
      >
        <ArrowLeft aria-hidden className="size-4" /> Local library
      </Link>

      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="flex min-w-0 flex-col gap-1">
          <h1 id={heading} className="sr-only">
            Editing this document
          </h1>
          <label htmlFor="pp-editor-title" className="sr-only">
            Document title
          </label>
          <input
            id="pp-editor-title"
            value={title}
            onChange={(event) => onTitleChange(event.target.value)}
            aria-labelledby={heading}
            placeholder="Untitled document"
            className="-mx-2 w-full min-w-0 rounded-input border border-transparent bg-transparent px-2 py-1 text-subheading font-semibold text-foreground transition-colors hover:border-border focus-visible:border-signal-blue"
          />
          <p
            role="status"
            aria-live="polite"
            className="px-2 text-caption font-medium text-muted"
          >
            {SAVE_STATUS_LABEL[status]}
            {status === 'dirty' ? ` · ${SHORTCUT} to save` : ''}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" onClick={onDuplicate} disabled={busy}>
            <Copy aria-hidden className="size-4" /> Duplicate copy
          </Button>
          <Link
            to={`/transform/${documentId}`}
            className={buttonVariants({ variant: 'ghost' })}
            aria-label="Open the AI document modes for this document"
          >
            <Sparkles aria-hidden className="size-4" /> AI modes
          </Link>
          <Button variant="dark" onClick={onPreview} disabled={busy}>
            <Eye aria-hidden className="size-4" /> Preview &amp; export
          </Button>
          <Button onClick={onSave} disabled={busy || status === 'saved'}>
            Save changes
          </Button>
        </div>
      </div>
    </div>
  )
}

export { EditorTopBar }
