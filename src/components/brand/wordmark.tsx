import { cn } from '@/lib/utils'

/** Original PromptPaper mark: a sheet with a turned corner and a
 *  single Signal Blue baseline — a conversation that became a
 *  document. No external logo or icon-library glyph. */
function Wordmark({ className }: { className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-2.5', className)}>
      <svg
        aria-hidden="true"
        viewBox="0 0 24 24"
        width="24"
        height="24"
        className="shrink-0 overflow-visible"
      >
        <path
          d="M4 3.5h10l5 5v11a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V4.5a1 1 0 0 1 1-1z"
          fill="var(--color-ink-navy)"
        />
        <path d="M14 3.5l5 5h-4a1 1 0 0 1-1-1z" fill="var(--color-mist-gray)" />
        <rect x="6.5" y="11" width="8" height="1.5" rx="0.75" fill="var(--color-paper)" />
        <rect x="6.5" y="14.5" width="8" height="1.5" rx="0.75" fill="var(--color-paper)" />
        <rect x="6.5" y="18" width="4.5" height="1.5" rx="0.75" fill="var(--color-signal-blue)" />
      </svg>
      <span className="font-display text-[20px] leading-none font-semibold tracking-tight text-foreground">
        PromptPaper
      </span>
    </span>
  )
}

export { Wordmark }
