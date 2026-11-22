import * as React from 'react'
import { Search } from 'lucide-react'

import type { ImportCandidate } from '@/components/import/types'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/field'
import { formatDateTime, PROVIDER_LABEL } from '@/lib/format'

interface ConversationPickerProps {
  candidates: ImportCandidate[]
  onConfirm: (keys: string[]) => void
  onBack: () => void
}

/** An archive can hold thousands of threads, and every one of them is read
 *  whether or not it is drawn. Fifty rows is enough to choose from and short
 *  enough that the page still scrolls. */
const PAGE = 50

/**
 * Choosing which conversations from a file become documents.
 *
 * Everything the file holds is already parsed at this point — this screen
 * selects, it does not read — so the counts and note figures shown per row
 * are the same ones the preview will report for that thread. All rows start
 * ticked, because the usual case is a download the user asked PromptPaper to
 * bring in, and unticking is cheaper than ticking.
 */
function ConversationPicker({ candidates, onConfirm, onBack }: ConversationPickerProps) {
  const [query, setQuery] = React.useState('')
  const [limit, setLimit] = React.useState(PAGE)
  const [chosen, setChosen] = React.useState<Set<string>>(
    () => new Set(candidates.map((candidate) => candidate.key)),
  )

  const needle = query.trim().toLowerCase()
  const matched = needle
    ? candidates.filter(
        (candidate) =>
          candidate.result.title.toLowerCase().includes(needle) ||
          (candidate.source ?? '').toLowerCase().includes(needle),
      )
    : candidates

  const toggle = (key: string) =>
    setChosen((current) => {
      const next = new Set(current)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })

  const selectMatched = (on: boolean) =>
    setChosen((current) => {
      const next = new Set(current)
      for (const candidate of matched) {
        if (on) next.add(candidate.key)
        else next.delete(candidate.key)
      }
      return next
    })

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="flex flex-col gap-1">
          <h2 className="text-subheading font-semibold text-foreground">
            {candidates.length.toLocaleString()} conversations found
          </h2>
          <p className="text-body-sm text-muted">
            Tick the ones to bring in. Each becomes its own document, and each can be checked over
            before anything is saved.
          </p>
        </div>

        <div className="w-full sm:max-w-sm">
          <label htmlFor="import-search" className="sr-only">
            Search conversations by title
          </label>
          <div className="relative">
            <Search
              aria-hidden
              className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate-gray"
            />
            <Input
              id="import-search"
              className="pl-10"
              value={query}
              onChange={(event) => {
                setQuery(event.target.value)
                setLimit(PAGE)
              }}
              placeholder="Search by title"
            />
          </div>
        </div>
      </div>

      <div
        role="group"
        aria-label="Choose conversations"
        className="flex flex-wrap items-center gap-3 text-caption text-muted"
      >
        <Button variant="ghost" size="sm" onClick={() => selectMatched(true)}>
          Select all matching
        </Button>
        <Button variant="ghost" size="sm" onClick={() => selectMatched(false)}>
          Select none
        </Button>
        <p>
          {chosen.size.toLocaleString()} of {candidates.length.toLocaleString()} ticked
        </p>
      </div>

      {matched.length === 0 ? (
        <p className="text-body text-muted">No conversation in this file matches “{query}”.</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {matched.slice(0, limit).map((candidate) => {
            const { result } = candidate
            const on = chosen.has(candidate.key)
            return (
              <li key={candidate.key}>
                <label
                  className={`flex cursor-pointer items-start gap-4 rounded-product border p-4 transition-colors ${
                    on ? 'border-signal-blue bg-badge-bg' : 'border-border bg-card'
                  }`}
                >
                  <input
                    type="checkbox"
                    className="mt-1 size-4 shrink-0 accent-[var(--color-signal-blue)]"
                    checked={on}
                    onChange={() => toggle(candidate.key)}
                  />
                  <div className="flex min-w-0 flex-col gap-2">
                    <p className="truncate text-body font-medium text-foreground">{result.title}</p>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                      <Badge variant={on ? 'default' : 'outline'}>
                        {PROVIDER_LABEL[result.provider]}
                      </Badge>
                      <p className="text-caption text-muted">
                        {result.stats.totalMessages} messages · {result.stats.codeBlocks} code ·{' '}
                        {result.stats.tables} tables · {result.stats.mathBlocks} formulas
                      </p>
                      {result.warnings.length > 0 ? (
                        <p className="text-caption text-muted">
                          {result.warnings.length} preservation{' '}
                          {result.warnings.length === 1 ? 'note' : 'notes'}
                        </p>
                      ) : null}
                      {candidate.source ? (
                        <p className="text-caption text-muted">from {candidate.source}</p>
                      ) : null}
                      {result.createdAt ? (
                        <p className="text-caption text-muted">{formatDateTime(result.createdAt)}</p>
                      ) : null}
                    </div>
                  </div>
                </label>
              </li>
            )
          })}
        </ul>
      )}

      {matched.length > limit ? (
        <Button variant="outline" size="sm" onClick={() => setLimit((value) => value + PAGE)}>
          Show {Math.min(PAGE, matched.length - limit)} more of {matched.length.toLocaleString()}{' '}
          matching
        </Button>
      ) : null}

      <div className="flex flex-wrap items-center gap-4">
        <Button onClick={() => onConfirm([...chosen])} disabled={chosen.size === 0}>
          Check {chosen.size.toLocaleString()} {chosen.size === 1 ? 'conversation' : 'conversations'}
        </Button>
        <Button variant="ghost" onClick={onBack} className="text-muted hover:text-foreground">
          Back
        </Button>
        {chosen.size === 0 ? (
          <p className="text-caption text-muted">Nothing is ticked, so there is nothing to check.</p>
        ) : null}
      </div>
    </div>
  )
}

export { ConversationPicker }
