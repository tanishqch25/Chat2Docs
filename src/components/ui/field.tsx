import * as React from 'react'

import { cn } from '@/lib/utils'

/**
 * Form controls for the workspace, on the same three decisions as every
 * other surface in the product: Pebble (#f0f3f8) as the filled ground so a
 * control reads as something to type into, an 8px corner to match the
 * buttons, and a hairline border that turns Signal Blue on focus.
 */
const CONTROL =
  'w-full rounded-input border border-border bg-input px-3 text-body text-foreground transition-colors placeholder:text-slate-gray focus-visible:border-signal-blue disabled:cursor-not-allowed disabled:opacity-60'

function Input({ className, ...props }: React.ComponentProps<'input'>) {
  return <input className={cn(CONTROL, 'h-11', className)} {...props} />
}

function Textarea({ className, ...props }: React.ComponentProps<'textarea'>) {
  return (
    <textarea
      className={cn(CONTROL, 'min-h-28 resize-y py-3 leading-relaxed', className)}
      {...props}
    />
  )
}

function Select({ className, ...props }: React.ComponentProps<'select'>) {
  return <select className={cn(CONTROL, 'h-11', className)} {...props} />
}

/** Label above, hint below, one gap between. The `htmlFor` is not optional
 *  in practice: a control without a labelled relationship is not a control
 *  a keyboard or screen-reader user can use. */
function Field({
  label,
  htmlFor,
  hint,
  className,
  children,
}: React.ComponentProps<'div'> & {
  label: string
  htmlFor: string
  hint?: React.ReactNode
}) {
  return (
    <div className={cn('flex flex-col gap-2', className)}>
      <label htmlFor={htmlFor} className="text-body-sm font-medium text-foreground">
        {label}
      </label>
      {children}
      {hint ? <p className="text-caption text-muted">{hint}</p> : null}
    </div>
  )
}

export { Field, Input, Select, Textarea }
