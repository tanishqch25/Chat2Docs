import type { ReactNode } from 'react'

import { Button } from '@/components/ui/button'
import { Modal } from '@/components/ui/modal'

interface ConfirmDialogProps {
  title: string
  description: ReactNode
  confirmLabel: string
  cancelLabel?: string
  busy: boolean
  onConfirm: () => void
  onCancel: () => void
}

/**
 * The gate in front of anything that removes user data. Deleting a document,
 * emptying the library and replacing it during a restore all come through
 * here, because none of them can be undone — there is no server holding a
 * copy to recover from.
 *
 * The confirm button is the Ink Navy secondary, not Signal Blue: the blue
 * fill is reserved in this palette for the action that adds something.
 */
function ConfirmDialog({
  title,
  description,
  confirmLabel,
  cancelLabel = 'Cancel',
  busy,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  return (
    <Modal
      size="sm"
      title={title}
      onClose={onCancel}
      footer={
        <>
          <Button variant="ghost" onClick={onCancel}>
            {cancelLabel}
          </Button>
          <Button variant="dark" onClick={onConfirm} disabled={busy}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3 text-body text-muted">{description}</div>
    </Modal>
  )
}

export { ConfirmDialog }
