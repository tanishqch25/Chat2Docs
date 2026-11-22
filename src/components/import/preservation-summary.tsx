import { useState } from 'react'
import { ChevronDown, ShieldCheck } from 'lucide-react'

import type { ParsedConversationStats } from '@/types/import'

interface PreservationSummaryProps {
  stats: ParsedConversationStats
  /** What the reader said about this conversation, plus anything removed
   *  here. The list is the evidence behind the headline claim. */
  warnings: string[]
}

const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? '' : 's'}`

/** A figure that reads as zero is not a fact worth space, except the
 *  message count: an import of nothing has to be visible. */
function figures(stats: ParsedConversationStats) {
  return [
    { value: stats.totalMessages, label: 'messages' },
    { value: stats.userMessages, label: 'you' },
    { value: stats.assistantMessages, label: 'AI replies' },
    { value: stats.codeBlocks, label: 'code blocks' },
    { value: stats.tables, label: 'tables' },
    { value: stats.mathBlocks, label: 'formulas' },
  ].filter((figure, index) => index === 0 || figure.value > 0)
}

/**
 * What the reader found, and what it could not render.
 *
 * The counts are re-derived from the messages that are about to be saved, so
 * a table that was deleted in the preview is gone from this bar as well —
 * the bar cannot claim something the document does not hold. The notes are
 * the other half: an attachment reference or a canvas widget has to appear
 * here as words, because a preservation promise nobody can read is not one.
 */
function PreservationSummary({ stats, warnings }: PreservationSummaryProps) {
  const [open, setOpen] = useState(warnings.length <= 3)
  const shown = open ? warnings : warnings.slice(0, 3)

  return (
    <div className="flex flex-col gap-4 rounded-product border border-border bg-pebble p-5">
      <div className="flex flex-wrap items-baseline gap-x-7 gap-y-3">
        {figures(stats).map((figure) => (
          <p key={figure.label} className="flex items-baseline gap-2">
            <span className="text-subheading font-bold text-foreground tabular-nums">
              {figure.value}
            </span>
            <span className="text-caption text-muted">{figure.label}</span>
          </p>
        ))}
      </div>

      {warnings.length === 0 ? (
        <p className="flex items-start gap-2 text-body-sm text-foreground">
          <ShieldCheck aria-hidden className="mt-0.5 size-4 shrink-0 text-slate-gray" />
          Read by this browser alone: nothing was summarised, paraphrased or sent anywhere. What
          was read is below, in order.
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          <p className="text-body-sm font-medium text-foreground">
            {plural(warnings.length, 'note')} about what was read
          </p>
          <ul className="flex flex-col gap-1.5 pl-5 list-disc text-caption text-muted">
            {shown.map((warning, index) => (
              <li key={index}>{warning}</li>
            ))}
          </ul>
          {warnings.length > 3 ? (
            <button
              type="button"
              aria-expanded={open}
              onClick={() => setOpen((value) => !value)}
              className="flex w-fit items-center gap-1 text-caption font-medium text-signal-blue"
            >
              {open ? 'Show fewer notes' : `Show all ${warnings.length} notes`}
              <ChevronDown
                aria-hidden
                className={`size-3.5 transition-transform ${open ? 'rotate-180' : ''}`}
              />
            </button>
          ) : null}
        </div>
      )}
    </div>
  )
}

export { PreservationSummary }
