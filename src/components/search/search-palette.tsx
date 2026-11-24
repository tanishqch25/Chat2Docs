import * as React from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Search } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Modal } from '@/components/ui/modal'
import { PROVIDER_LABEL, ROLE_LABEL, formatDateTime } from '@/lib/format'
import { searchDocuments } from '@/lib/search/librarySearch'
import type { SearchMatch } from '@/lib/search/librarySearch'
import { listDocuments } from '@/services/documentService'
import type { LocalDocument } from '@/types/document'
import { cn } from '@/lib/utils'

/**
 * The palette, on the one dialog the workspace already owns.
 *
 * `Modal` is what composes, inspects and confirms elsewhere, and it is why
 * this file has no focus code in it: the trap, the Escape key, the backdrop,
 * the label relationship and handing focus back to whatever opened it are
 * already solved there. The search field carries `data-autofocus`, which is
 * how `Modal` picks its first focus, so the palette is typable-into the
 * instant it opens.
 *
 * What it can find is what is stored. There is no second copy of the library
 * indexed somewhere: the records are read out of IndexedDB when the palette
 * opens and searched as they are, so search cannot report a document that was
 * deleted and cannot miss one that was imported a minute ago.
 */

const plural = (value: number, noun: string) => `${value} ${noun}${value === 1 ? '' : 's'}`

const OPTION_ID = 'search-option'

const KEYCAP =
  'rounded-[4px] border border-border bg-pebble px-1.5 py-0.5 font-mono text-[0.7rem] text-muted'

/** Where a hit came from, in the words the rest of the product uses. */
function where(match: SearchMatch): string {
  if (match.turnIndex === null) return match.matchedIn
  const turn = `Turn ${match.turnIndex + 1}`
  return match.role
    ? `${turn} · ${ROLE_LABEL[match.role]} · ${match.matchedIn}`
    : `${turn} · ${match.matchedIn}`
}

function Snippet({ match }: { match: SearchMatch }) {
  const { before, match: phrase, after } = match.snippet
  if (!phrase) return null
  return (
    <p className="line-clamp-2 break-words text-body-sm text-muted">
      {before}
      {/* Marked in the DOM rather than by handing the browser a string of
          HTML: everything between these tags came out of someone else’s
          conversation file. */}
      <mark className="rounded-[3px] bg-badge-bg px-1 font-medium text-deep-cobalt">{phrase}</mark>
      {after}
    </p>
  )
}

interface ResultRowProps {
  match: SearchMatch
  index: number
  active: boolean
  /** Enter, or a click on the row itself. */
  onOpen: (match: SearchMatch) => void
  /** A row's secondary action, which goes somewhere else. */
  onGo: (path: string) => void
}

function ResultRow({ match, index, active, onOpen, onGo }: ResultRowProps) {
  return (
    <li
      id={`${OPTION_ID}-${index}`}
      role="option"
      aria-selected={active}
      // Mouse-down, not click, so the row behaves like the keyboard path
      // before the field loses focus. A press that lands on one of the row's
      // own links belongs to that link, not here.
      onMouseDown={(event) => {
        if ((event.target as HTMLElement).closest('a')) return
        event.preventDefault()
        onOpen(match)
      }}
      className={cn(
        'flex cursor-default flex-col gap-2 rounded-product border px-4 py-3',
        active ? 'border-border bg-pebble' : 'border-transparent',
      )}
    >
      <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
        <p className="min-w-0 flex-1 truncate text-body-sm font-semibold text-foreground">
          {match.docTitle}
        </p>
        <Badge variant="outline">{where(match)}</Badge>
      </div>

      <Snippet match={match} />

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-caption text-slate-gray">
        <span>
          {PROVIDER_LABEL[match.provider]} · edited {formatDateTime(match.updatedAt)}
        </span>
        <Link
          to={`/editor/${match.docId}`}
          onClick={(event) => {
            event.preventDefault()
            event.stopPropagation()
            onGo(`/editor/${match.docId}`)
          }}
          className="font-medium text-signal-blue underline underline-offset-4"
        >
          Edit
        </Link>
        <Link
          to={`/export/${match.docId}`}
          onClick={(event) => {
            event.preventDefault()
            event.stopPropagation()
            onGo(`/export/${match.docId}`)
          }}
          className="font-medium text-signal-blue underline underline-offset-4"
        >
          Export
        </Link>
      </div>
    </li>
  )
}

interface SearchPaletteProps {
  onClose: () => void
}

function SearchPalette({ onClose }: SearchPaletteProps) {
  const navigate = useNavigate()
  const [documents, setDocuments] = React.useState<LocalDocument[] | null>(null)
  const [problem, setProblem] = React.useState<string | null>(null)
  const [query, setQuery] = React.useState('')
  const [active, setActive] = React.useState(0)
  const list = React.useRef<HTMLUListElement>(null)

  React.useEffect(() => {
    let alive = true
    listDocuments()
      .then((records) => {
        if (alive) setDocuments(records)
      })
      .catch((error: unknown) => {
        if (!alive) return
        setProblem(
          error instanceof Error
            ? error.message
            : 'This browser would not open its local storage, so there is nothing to search.',
        )
        setDocuments([])
      })
    return () => {
      alive = false
    }
  }, [])

  const results = React.useMemo(() => searchDocuments(documents ?? [], query), [documents, query])

  // Any change to the query puts the selection back on the first row, so what
  // Enter does is always what the top of the list says it will do. The reset
  // happens while rendering rather than in an effect: an effect would paint a
  // list whose highlight is still on a row from the old search.
  const [lastQuery, setLastQuery] = React.useState(query)
  if (query !== lastQuery) {
    setLastQuery(query)
    setActive(0)
  }

  React.useEffect(() => {
    list.current
      ?.querySelector(`#${OPTION_ID}-${active}`)
      ?.scrollIntoView({ block: 'nearest' })
  }, [active, results.length])

  const go = (path: string) => {
    onClose()
    navigate(path)
  }

  const onKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (results.length === 0) return
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setActive((index) => (index + 1) % results.length)
      return
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault()
      setActive((index) => (index - 1 + results.length) % results.length)
      return
    }
    if (event.key === 'Enter') {
      // Escape is left to `Modal`, which already closes on it.
      const match = results[active]
      if (match) {
        event.preventDefault()
        go(`/documents?doc=${encodeURIComponent(match.docId)}`)
      }
    }
  }

  const nothingYet = documents !== null && documents.length === 0

  return (
    <Modal
      size="md"
      title="Search your documents"
      description={
        problem
          ? 'This browser will not open its storage'
          : documents === null
            ? 'Reading this browser’s storage…'
            : `${plural(documents.length, 'document')} in this browser`
      }
      onClose={onClose}
    >
      <div className="relative">
        <label htmlFor="global-search" className="sr-only">
          Search every document stored in this browser
        </label>
        <Search
          aria-hidden
          className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate-gray"
        />
        <input
          id="global-search"
          data-autofocus
          type="search"
          role="combobox"
          aria-expanded
          aria-controls="search-results"
          aria-activedescendant={results.length > 0 ? `${OPTION_ID}-${active}` : undefined}
          autoComplete="off"
          spellCheck={false}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={onKeyDown}
          placeholder="Titles, prose, code, tables, maths, attachments…"
          className="h-11 w-full rounded-input border border-border bg-input pr-3 pl-10 text-body text-foreground placeholder:text-slate-gray focus-visible:border-signal-blue"
        />
      </div>

      {problem ? (
        <p role="alert" className="text-body text-muted">
          {problem}
        </p>
      ) : documents === null ? (
        <p role="status" className="text-body text-muted">
          Reading this browser’s storage…
        </p>
      ) : nothingYet ? (
        <div className="flex flex-col gap-3">
          <p className="text-body text-muted">
            Nothing is stored in this browser yet, so there is nothing to search. One import, or one
            click on the sample thread, and this list fills up.
          </p>
          <div className="flex flex-wrap gap-4">
            <Link
              to="/documents"
              onClick={onClose}
              className="text-body-sm font-medium text-signal-blue underline underline-offset-4"
            >
              Open the library
            </Link>
            <Link
              to="/import"
              onClick={onClose}
              className="text-body-sm font-medium text-signal-blue underline underline-offset-4"
            >
              Import a conversation
            </Link>
          </div>
        </div>
      ) : (
        <>
          {results.length > 0 ? (
            <ul
              id="search-results"
              ref={list}
              role="listbox"
              aria-label="Search results"
              className="-mx-2 flex flex-col gap-1"
            >
              {results.map((match, index) => (
                <ResultRow
                  key={`${match.docId}-${match.matchedIn}-${match.turnIndex ?? 'document'}-${index}`}
                  match={match}
                  index={index}
                  active={index === active}
                  onOpen={(record) => go(`/documents?doc=${encodeURIComponent(record.docId)}`)}
                  onGo={go}
                />
              ))}
            </ul>
          ) : (
            <p className="text-body text-muted" role="status">
              No document in this browser contains “{query.trim()}”.
            </p>
          )}

          <p className="flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-border pt-4 text-caption text-slate-gray">
            <span className="flex items-center gap-2">
              <kbd className={KEYCAP}>↑</kbd>
              <kbd className={KEYCAP}>↓</kbd>
              move
            </span>
            <span className="flex items-center gap-2">
              <kbd className={KEYCAP}>Enter</kbd>
              open in the library
            </span>
            <span className="flex items-center gap-2">
              <kbd className={KEYCAP}>Esc</kbd>
              close
            </span>
            <span>Edit and Export sit on every row.</span>
          </p>
        </>
      )}
    </Modal>
  )
}

export { SearchPalette }
