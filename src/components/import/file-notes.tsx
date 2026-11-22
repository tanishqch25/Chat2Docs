interface FileNotesProps {
  /** Files that were dropped but produced no conversation to show. */
  problems: string[]
  /** What a file held besides conversations, said by the reader. */
  notes: string[]
}

/**
 * What the file itself reported, as opposed to what one conversation holds.
 *
 * An archive carries more than chats, and a multi-file drop can hold one the
 * reader could not open. Those sentences are shown by the upload panel to
 * begin with, but the panel is gone once the conversations are listed — and
 * a note that disappears when the screen changes is a silent drop of its own.
 */
function FileNotes({ problems, notes }: FileNotesProps) {
  if (problems.length === 0 && notes.length === 0) return null

  return (
    <div className="flex flex-col gap-4 rounded-product border border-border bg-input p-5">
      {problems.length > 0 ? (
        <ul
          role="alert"
          className="flex flex-col gap-1.5 pl-5 list-disc text-caption text-foreground"
        >
          {problems.map((problem) => (
            <li key={problem}>{problem}</li>
          ))}
        </ul>
      ) : null}
      {notes.length > 0 ? (
        <ul
          role="status"
          className="flex flex-col gap-1.5 pl-5 list-disc text-caption text-muted"
        >
          {notes.map((note) => (
            <li key={note}>{note}</li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}

export { FileNotes }
