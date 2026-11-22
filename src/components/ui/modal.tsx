import * as React from 'react'
import { X } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

const WIDTH = {
  sm: 'sm:max-w-md',
  md: 'sm:max-w-2xl',
  lg: 'sm:max-w-3xl',
}

export interface ModalProps {
  title: string
  description?: string
  onClose: () => void
  children: React.ReactNode
  /** Actions, held apart so they stay reachable while a long body scrolls. */
  footer?: React.ReactNode
  size?: keyof typeof WIDTH
  /** Escape and the backdrop both dismiss. A half-finished form is worth
   *  trapping the reader in; a confirmation is not. */
  dismissible?: boolean
}

/**
 * The one dialog the workspace uses — for composing, inspecting, restoring
 * and every confirmation.
 *
 * It is a real modal rather than a positioned div: `role="dialog"` with
 * `aria-modal`, the title bound by id, focus moved into the panel on open
 * and handed back to whatever opened it on close, Tab kept inside, and
 * Escape honoured. Nothing here is decorative — a control that cannot be
 * reached from the keyboard is not an input, it is a picture of one.
 *
 * Callers mount it rather than keep it hidden: a dialog that is closed has
 * no reason to hold a form's state or to sit in the tab order, and unmount
 * cleanup is what returns focus to the button that opened it.
 */
function Modal({
  title,
  description,
  onClose,
  children,
  footer,
  size = 'md',
  dismissible = true,
}: ModalProps) {
  const panel = React.useRef<HTMLDivElement>(null)
  const heading = React.useId()
  const detail = React.useId()

  React.useEffect(() => {
    const previous = document.activeElement
    const items = () => [...(panel.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? [])]

    // A form names its own first field; anything else starts at the top.
    const target = panel.current?.querySelector<HTMLElement>('[data-autofocus]') ?? items()[0]
    target?.focus()

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        if (dismissible) {
          event.preventDefault()
          onClose()
        }
        return
      }
      if (event.key !== 'Tab') return
      const list = items()
      if (list.length === 0) return
      const first = list[0]
      const last = list[list.length - 1]
      const active = document.activeElement
      if (event.shiftKey && (active === first || active === panel.current)) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && active === last) {
        event.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', onKeyDown)

    return () => {
      document.removeEventListener('keydown', onKeyDown)
      if (previous instanceof HTMLElement) previous.focus()
    }
  }, [onClose, dismissible])

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-ink-navy/45 p-4 sm:p-6"
      // Mouse-down, not click: a drag that starts in a field and ends on the
      // backdrop should not throw the form away.
      onMouseDown={(event) => {
        if (dismissible && event.target === event.currentTarget) onClose()
      }}
    >
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby={heading}
        aria-describedby={description ? detail : undefined}
        className={cn(
          'flex max-h-[min(92dvh,56rem)] w-full flex-col overflow-hidden rounded-card border border-border bg-card text-foreground shadow-card',
          WIDTH[size],
        )}
      >
        <div className="flex items-start justify-between gap-6 border-b border-border px-6 py-5">
          <div className="flex flex-col gap-1">
            <h2 id={heading} className="text-subheading font-semibold text-foreground">
              {title}
            </h2>
            {description ? (
              <p id={detail} className="text-body-sm text-muted">
                {description}
              </p>
            ) : null}
          </div>
          {dismissible ? (
            <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close">
              <X aria-hidden className="size-5" />
            </Button>
          ) : null}
        </div>

        <div className="flex flex-1 flex-col gap-5 overflow-y-auto px-6 py-6">{children}</div>

        {footer ? (
          <div className="flex flex-wrap items-center justify-end gap-3 border-t border-border px-6 py-4">
            {footer}
          </div>
        ) : null}
      </div>
    </div>
  )
}

export { Modal }
