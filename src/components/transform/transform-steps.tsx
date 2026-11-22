import * as React from 'react'
import { Check } from 'lucide-react'

import { cn } from '@/lib/utils'
import { TRANSFORM_STEPS } from '@/types/transform'
import type { TransformStep } from '@/types/transform'

/**
 * The three pieces every step of a transform is built out of: where the work
 * stands, the card it stands in, and the strip of counts beside it.
 *
 * The rail is a set of buttons rather than a progress bar because the steps
 * are choices, not a loading state — going back to change the mode is a
 * normal thing to do halfway through, and a document already generated is
 * still worth saving after the key panel is closed.
 */

const STEP_LABEL: Record<TransformStep, { n: string; label: string }> = {
  mode: { n: '01', label: 'Choose a mode' },
  key: { n: '02', label: 'Bring your own key' },
  generate: { n: '03', label: 'Generate and review' },
}

function StepRail({
  step,
  furthest,
  onJump,
}: {
  step: TransformStep
  /** The furthest step the page has actually earned: a rail must not let a
   *  reader jump to Generate with no key saved. */
  furthest: TransformStep
  onJump: (step: TransformStep) => void
}) {
  const reached = TRANSFORM_STEPS.indexOf(furthest)

  return (
    <ol role="group" aria-label="Transform steps" className="flex flex-wrap gap-2">
      {TRANSFORM_STEPS.map((each, index) => {
        const on = each === step
        const done = index < TRANSFORM_STEPS.indexOf(step)
        const enabled = index <= reached
        return (
          <li key={each}>
            <button
              type="button"
              aria-current={on ? 'step' : undefined}
              disabled={!enabled}
              onClick={() => onJump(each)}
              className={cn(
                'flex items-center gap-2 rounded-badge border px-3.5 py-2 text-body-sm font-medium transition-colors',
                on
                  ? 'border-signal-blue bg-badge-bg text-deep-cobalt'
                  : 'border-border bg-card text-muted',
                enabled && !on && 'hover:border-mist-gray hover:text-foreground',
                !enabled && 'cursor-not-allowed opacity-60',
              )}
            >
              <span className="text-caption tracking-[0.16em] uppercase">{STEP_LABEL[each].n}</span>
              {STEP_LABEL[each].label}
              {done ? <Check aria-hidden className="size-4 text-deep-cobalt" /> : null}
            </button>
          </li>
        )
      })}
    </ol>
  )
}

function Panel({
  title,
  description,
  children,
  footer,
  className,
}: React.ComponentProps<'section'> & {
  title: string
  description?: React.ReactNode
  footer?: React.ReactNode
}) {
  return (
    <section aria-label={title} className={cn('flex flex-col gap-6 rounded-card border border-border bg-card p-6 shadow-card sm:p-8', className)}>
      <div className="flex flex-col gap-2">
        <h2 className="text-heading-sm font-bold text-foreground">{title}</h2>
        {description ? <p className="max-w-[66ch] text-body text-muted">{description}</p> : null}
      </div>
      {children}
      {footer ? <div className="flex flex-wrap items-center gap-3">{footer}</div> : null}
    </section>
  )
}

/** A count of what is about to be sent, stated as facts rather than a
 *  warning: the point is that a long thread is a long request. */
function StatRow({ items }: { items: { label: string; value: string }[] }) {
  return (
    <dl className="grid grid-cols-2 gap-4 rounded-product border border-border bg-pebble p-5 sm:grid-cols-3 lg:grid-cols-6">
      {items.map((item) => (
        <div key={item.label} className="flex min-w-0 flex-col gap-1">
          <dt className="text-caption font-semibold tracking-[0.16em] text-slate-gray uppercase">
            {item.label}
          </dt>
          <dd className="text-body-sm font-medium text-foreground">{item.value}</dd>
        </div>
      ))}
    </dl>
  )
}

/** Anything the page needs the reader to see before they go on, in one
 *  place, with the same dismiss behaviour as the rest of the workspace. */
function Notice({
  tone,
  text,
  onDismiss,
}: {
  tone: 'problem' | 'note'
  text: string
  onDismiss: () => void
}) {
  return (
    <div
      role={tone === 'problem' ? 'alert' : 'status'}
      className="flex flex-wrap items-center gap-4 rounded-product border border-border bg-input p-5"
    >
      <p className="min-w-0 flex-1 text-body text-foreground">{text}</p>
      <button
        type="button"
        onClick={onDismiss}
        className="text-body-sm font-medium text-signal-blue underline underline-offset-4"
      >
        Dismiss
      </button>
    </div>
  )
}

export { Panel, StatRow, StepRail, Notice }
