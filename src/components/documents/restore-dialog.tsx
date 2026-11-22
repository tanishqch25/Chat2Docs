import * as React from 'react'

import { Button } from '@/components/ui/button'
import { Modal } from '@/components/ui/modal'
import type { BackupReport, RestoreStrategy } from '@/services/documentService'
import type { LocalDocument } from '@/types/document'

interface RestoreDialogProps {
  fileName: string
  report: BackupReport
  existingCount: number
  busy: boolean
  onCancel: () => void
  onConfirm: (documents: LocalDocument[], strategy: RestoreStrategy) => void
}

const CHOICES: { value: RestoreStrategy; label: string; detail: string }[] = [
  {
    value: 'merge',
    label: 'Merge with what is here',
    detail:
      'Documents that are not already in the library are added. Any identifier the file and the library share is taken from the file, since it is the copy you chose to restore.',
  },
  {
    value: 'replace',
    label: 'Replace the entire library',
    detail:
      'Everything currently stored in this browser is deleted first, then the file is written in full. There is no way back from this except another backup.',
  },
]

/**
 * The last step before a backup is written, and the only place a file the
 * user supplied is allowed to change the library.
 *
 * A rejected file stays open with every problem listed rather than closing
 * with a toast: "this backup is corrupt" is the one message a user should
 * read in full before doing anything else. Nothing is applied part-way —
 * validation happens before this dialog opens, and this dialog commits in a
 * single transaction or not at all.
 */
function RestoreDialog({
  fileName,
  report,
  existingCount,
  busy,
  onCancel,
  onConfirm,
}: RestoreDialogProps) {
  const [strategy, setStrategy] = React.useState<RestoreStrategy>('merge')

  if (!report.ok) {
    return (
      <Modal
        size="md"
        title="This backup cannot be restored"
        description={fileName}
        onClose={onCancel}
        footer={
          <Button variant="outline" onClick={onCancel}>
            Close
          </Button>
        }
      >
        <p className="text-body text-muted">
          Nothing was changed. The file was rejected as a whole, so the library still holds the{' '}
          {existingCount} {existingCount === 1 ? 'document' : 'documents'} it had before.
        </p>
        <ul className="flex flex-col gap-2 rounded-product border border-border bg-input p-4">
          {report.issues.map((issue) => (
            <li key={issue} className="text-body-sm text-foreground">
              {issue}
            </li>
          ))}
        </ul>
      </Modal>
    )
  }

  const incoming = report.documents

  return (
    <Modal
      size="md"
      title="Restore this backup?"
      description={`${fileName} · ${incoming.length} ${incoming.length === 1 ? 'document' : 'documents'}`}
      onClose={onCancel}
      footer={
        <>
          <Button variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
          <Button
            variant={strategy === 'replace' ? 'dark' : 'primary'}
            disabled={busy}
            onClick={() => onConfirm(incoming, strategy)}
          >
            {`Restore ${incoming.length} ${incoming.length === 1 ? 'document' : 'documents'}`}
          </Button>
        </>
      }
    >
      <p className="text-body text-muted">
        The library in this browser currently holds {existingCount}{' '}
        {existingCount === 1 ? 'document' : 'documents'}. Choose how the file should be applied.
      </p>

      <fieldset className="flex flex-col gap-3">
        <legend className="sr-only">Restore strategy</legend>
        {CHOICES.map((choice) => (
          <label
            key={choice.value}
            className="flex cursor-pointer items-start gap-3 rounded-product border border-border bg-input p-4 transition-colors has-[:checked]:border-signal-blue has-[:checked]:bg-badge-bg"
          >
            <input
              type="radio"
              name="restore-strategy"
              value={choice.value}
              checked={strategy === choice.value}
              onChange={() => setStrategy(choice.value)}
              className="mt-1 size-4 shrink-0 accent-signal-blue"
            />
            <span className="flex flex-col gap-1">
              <span className="text-body font-medium text-foreground">{choice.label}</span>
              <span className="text-body-sm text-muted">{choice.detail}</span>
            </span>
          </label>
        ))}
      </fieldset>

      {strategy === 'replace' && existingCount > 0 ? (
        <p className="rounded-product border border-border bg-pebble p-4 text-body-sm font-medium text-foreground">
          {existingCount} {existingCount === 1 ? 'document' : 'documents'} not in this file will be
          deleted. Export a backup of the current library first if any of them matter.
        </p>
      ) : null}
    </Modal>
  )
}

export { RestoreDialog }
