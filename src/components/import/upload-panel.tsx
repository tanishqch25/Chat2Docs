import * as React from 'react'
import { FileUp } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { ACCEPTED_EXTENSIONS } from '@/lib/parsers/parserRegistry'

interface UploadPanelProps {
  busy: boolean
  /** One line per file that could not be read, naming the file. */
  problems: string[]
  /** Things said about the files as a whole, such as which parts of an
   *  archive were read and which were already covered elsewhere. */
  notes: string[]
  onFiles: (files: File[]) => void
}

/**
 * Export-file import.
 *
 * The drop zone is a decoration over the same file input the button opens,
 * so there is one keyboard path and one picker rather than two of each. Which
 * provider a file came from is worked out from its contents once it is here,
 * so nothing on this panel asks the user to know the format they downloaded.
 */
function UploadPanel({ busy, problems, notes, onFiles }: UploadPanelProps) {
  const [dragging, setDragging] = React.useState(false)
  const input = React.useRef<HTMLInputElement>(null)

  const take = (list: FileList | null) => {
    if (list && list.length > 0) onFiles(Array.from(list))
  }

  return (
    <div className="flex flex-col gap-5">
      <div
        onDragOver={(event) => {
          event.preventDefault()
          if (!dragging) setDragging(true)
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          event.preventDefault()
          setDragging(false)
          take(event.dataTransfer.files)
        }}
        className={`flex flex-col items-center gap-4 rounded-card border border-dashed px-6 py-12 text-center transition-colors ${
          dragging ? 'border-signal-blue bg-badge-bg' : 'border-border bg-pebble'
        }`}
      >
        <FileUp aria-hidden className="size-7 text-slate-gray" />
        <p className="text-body-lg font-semibold text-foreground">
          {busy ? 'Reading the file…' : 'Drop an export here'}
        </p>
        <p className="max-w-[52ch] text-body-sm text-muted">
          The official ChatGPT, Claude or Gemini download, a single conversation exported as JSON,
          or the thread itself as Markdown, HTML or plain text. An archive with many conversations
          can be dropped in one go.
        </p>
        <input
          ref={input}
          type="file"
          multiple
          accept={ACCEPTED_EXTENSIONS.join(',')}
          className="sr-only"
          aria-label="Choose conversation export files"
          onChange={(event) => {
            take(event.target.files)
            // Cleared so dropping the same file again still fires a change.
            event.target.value = ''
          }}
        />
        <Button variant="outline" onClick={() => input.current?.click()} disabled={busy}>
          Choose a file
        </Button>
        <p className="text-caption text-muted">{ACCEPTED_EXTENSIONS.join(' · ')}</p>
      </div>

      {problems.length > 0 ? (
        <ul role="alert" className="flex flex-col gap-2">
          {problems.map((problem, index) => (
            <li
              key={index}
              className="rounded-product border border-border bg-input px-5 py-3 text-body-sm text-foreground"
            >
              {problem}
            </li>
          ))}
        </ul>
      ) : null}

      {notes.length > 0 ? (
        <ul
          role="status"
          className="flex flex-col gap-2 rounded-product border border-border bg-badge-bg px-5 py-4 text-caption text-deep-cobalt"
        >
          {notes.map((note, index) => (
            <li key={index}>{note}</li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}

export { UploadPanel }
