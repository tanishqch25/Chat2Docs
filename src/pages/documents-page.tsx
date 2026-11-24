import * as React from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { ArrowRight, Database, Plus, Search, Sparkles, Trash } from 'lucide-react'

import { ConfirmDialog } from '@/components/documents/confirm-dialog'
import { DataLossNotice } from '@/components/documents/data-loss-notice'
import { DocumentComposer } from '@/components/documents/document-composer'
import { DocumentDetail } from '@/components/documents/document-detail'
import { RestoreDialog } from '@/components/documents/restore-dialog'
import { StoragePanel } from '@/components/documents/storage-panel'
import { Container } from '@/components/layout/container'
import { Eyebrow } from '@/components/layout/section-header'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { buttonVariants } from '@/components/ui/button-variants'
import { Input } from '@/components/ui/field'
import { useDocuments } from '@/hooks/useDocuments'
import {
  MODE_LABEL,
  PROVIDER_LABEL,
  backupFileName,
  formatBytes,
  formatDateTime,
} from '@/lib/format'
import type { BackupReport, DocumentDraft, RestoreStrategy } from '@/services/documentService'
import { parseBackup, serialiseBackup } from '@/services/documentService'
import { DOCUMENT_PROVIDERS } from '@/types/document'
import type { DocumentProvider, LocalDocument } from '@/types/document'

type Filter = DocumentProvider | 'all'

const FILTERS: { value: Filter; label: string }[] = [
  { value: 'all', label: 'All sources' },
  ...DOCUMENT_PROVIDERS.map((value) => ({ value, label: PROVIDER_LABEL[value] })),
]

const plural = (value: number, noun: string) => `${value} ${noun}${value === 1 ? '' : 's'}`

/**
 * The Local Document Library.
 *
 * Everything on this page is true of the browser running it: the figures
 * come from the stored records, the counts come from the store, and an empty
 * library is shown as empty. Nothing arrives here by itself — a document gets
 * in because the reader imported one, wrote one, restored a backup, or asked
 * for the sample thread — and no control is rendered unless it does
 * something, which is also why export is disabled rather than decorative when
 * there is nothing to export.
 *
 * The one file input lives here rather than inside the panel that mentions
 * it, because both the panel and the empty library need the same picker.
 */
function DocumentsPage() {
  const library = useDocuments()
  const { documents, estimate, footprint, problem, status } = library
  const location = useLocation()
  const navigate = useNavigate()

  /** How many conversations `/import` just wrote, carried across the
   *  navigation. It is read once and then cleared from the history entry,
   *  because reloading this page must not keep announcing a save that
   *  happened before the reload. */
  const imported = (location.state as { imported?: number } | null)?.imported

  const [query, setQuery] = React.useState('')
  const [filter, setFilter] = React.useState<Filter>('all')
  const [composer, setComposer] = React.useState(false)
  const [confirming, setConfirming] = React.useState<
    { kind: 'one'; id: string } | { kind: 'all' } | null
  >(null)
  const [restoring, setRestoring] = React.useState<{ fileName: string; report: BackupReport } | null>(
    null,
  )
  const [notice, setNotice] = React.useState<string | null>(() =>
    typeof imported === 'number'
      ? `Saved ${plural(imported, 'conversation')} from the import into this browser.`
      : null,
  )
  const [busy, setBusy] = React.useState(false)
  const picker = React.useRef<HTMLInputElement>(null)

  React.useEffect(() => {
    if (typeof imported === 'number') navigate('/documents', { replace: true, state: null })
  }, [imported, navigate])

  /** A document opened from the search palette arrives as `?doc=<id>`, and
   *  the address is worth keeping while it is open: reloading the page
   *  brings the same conversation back. Closing drops it again, so a stale
   *  query never reopens a panel the reader already dismissed. Keeping the
   *  identifier in the address rather than in a second piece of state is also
   *  what lets Back close the panel, and lets a reload prove what was saved. */
  const openId = React.useMemo(
    () => new URLSearchParams(location.search).get('doc'),
    [location.search],
  )

  const inspecting = openId ? (documents.find((record) => record.id === openId) ?? null) : null

  /** The address names a document that is not here — deleted from another
   *  tab, or typed in. Said out loud rather than answered with a blank. */
  const missingId = openId && status === 'ready' && !inspecting ? openId : null

  const openDetail = (record: LocalDocument) =>
    navigate(`/documents?doc=${encodeURIComponent(record.id)}`)

  const closeDetail = () => navigate('/documents', { replace: true })

  const settle = React.useCallback(
    async <T,>(action: () => Promise<T | null>): Promise<T | null> => {
      setBusy(true)
      const result = await action()
      setBusy(false)
      return result
    },
    [],
  )

  const openPicker = () => {
    setNotice(null)
    picker.current?.click()
  }

  const save = async (draft: DocumentDraft) => {
    const saved = await settle(() => library.create(draft))
    if (!saved) return
    setComposer(false)
    setNotice(`Saved “${saved.title}” to this browser.`)
  }

  /** One click, one real thread. Written as blocks through the same door an
   *  import uses, so the sample is not a picture of a document but an
   *  ordinary record: editable, searchable, exportable, deletable.
   *
   *  The thread itself is a few kilobytes of prose that only matters once a
   *  reader asks for it, so it arrives on the click rather than in the
   *  bundle that opens the library. */
  const loadSample = async () => {
    const thread = await import('@/lib/sampleConversation').catch(() => null)
    if (!thread) {
      setNotice(
        'The sample thread did not arrive. It is fetched when asked for rather than carried with the library, and this browser refused the download — an import or a pasted conversation works without it.',
      )
      return
    }
    const saved = await settle(() => library.createImported(thread.buildSampleConversation()))
    if (!saved) return
    setNotice(
      `Loaded the sample thread — ${plural(saved.messageCount, 'message')} with code, a comparison table and a typeset formula. It is an ordinary document: edit it, export it, or delete it.`,
    )
  }

  const exportLibrary = () => {
    if (documents.length === 0) return
    const name = backupFileName()
    const url = URL.createObjectURL(new Blob([serialiseBackup(documents)], { type: 'application/json' }))
    const link = document.createElement('a')
    link.href = url
    link.download = name
    document.body.appendChild(link)
    link.click()
    link.remove()
    URL.revokeObjectURL(url)
    setNotice(`Exported ${plural(documents.length, 'document')} as ${name}.`)
  }

  const pickBackup = async (file: File) => {
    setNotice(null)
    setRestoring({ fileName: file.name, report: parseBackup(await file.text()) })
  }

  const commitRestore = async (incoming: LocalDocument[], strategy: RestoreStrategy) => {
    const summary = await settle(() => library.restore(incoming, strategy))
    if (!summary) return
    setRestoring(null)
    setNotice(
      strategy === 'replace'
        ? `Restored ${plural(summary.restored, 'document')} and cleared the rest of the library.`
        : `Restored ${plural(summary.restored, 'document')} — ${plural(summary.added, 'new document')} added, ${summary.updated} updated.`,
    )
  }

  const confirmDelete = async () => {
    if (!confirming) return
    const target = confirming
    const done =
      target.kind === 'all'
        ? (await settle(() => library.clearAll())) !== null
        : (await settle(() => library.remove(target.id))) !== null
    if (!done) return
    setConfirming(null)
    closeDetail()
    setNotice(
      target.kind === 'all'
        ? 'This browser holds no PromptPaper documents now.'
        : 'Document deleted.',
    )
  }

  const visible = React.useMemo(() => {
    const needle = query.trim().toLowerCase()
    return documents.filter(
      (record) =>
        (filter === 'all' || record.provider === filter) &&
        (needle === '' || record.title.toLowerCase().includes(needle)),
    )
  }, [documents, query, filter])

  const blocked = status === 'unavailable'

  return (
    <Container className="flex flex-col gap-12 py-14 lg:py-20">
      <div className="flex flex-col items-start gap-5">
        <Eyebrow>Local library</Eyebrow>
        <h1 className="max-w-[20ch] text-heading-lg font-bold text-balance text-foreground">
          Your documents, in this browser
        </h1>
        <p className="max-w-[62ch] text-body-lg text-muted">
          PromptPaper keeps conversations here rather than on a server, because there is nothing to
          sign in to. Create, edit, back up and delete — all of it happens on this device.
        </p>
        <div className="flex flex-wrap gap-3">
          <Button onClick={() => setComposer(true)} disabled={blocked || busy}>
            <Plus aria-hidden className="size-4" />
            New document
          </Button>
          <Link to="/import" className={buttonVariants({ variant: 'outline' })}>
            Import a conversation
            <ArrowRight aria-hidden className="size-4" />
          </Link>
          {/* Under twenty documents the library is still small enough that a
              thread to try the other surfaces on is worth offering without
              being asked for. */}
          {documents.length < 20 ? (
            <Button variant="ghost" onClick={() => void loadSample()} disabled={blocked || busy}>
              <Sparkles aria-hidden className="size-4" />
              Load sample
            </Button>
          ) : null}
        </div>
      </div>

      {problem ? (
        <div
          role="alert"
          className="flex flex-wrap items-center gap-4 rounded-product border border-border bg-input p-5"
        >
          <p className="min-w-0 flex-1 text-body text-foreground">{problem}</p>
          <Button variant="ghost" size="sm" onClick={() => library.dismissProblem()}>
            Dismiss
          </Button>
        </div>
      ) : null}

      {notice ? (
        <p
          role="status"
          className="rounded-product border border-border bg-badge-bg px-5 py-3 text-body-sm font-medium text-deep-cobalt"
        >
          {notice}
        </p>
      ) : null}

      {missingId ? (
        <div
          role="alert"
          className="flex flex-wrap items-center gap-4 rounded-product border border-border bg-input p-5"
        >
          <p className="min-w-0 flex-1 text-body text-foreground">
            No document with the id <span className="font-mono text-body-sm">{missingId}</span> is
            stored in this browser. It was probably deleted, or the address came from somewhere
            else.
          </p>
          <Button variant="ghost" size="sm" onClick={closeDetail}>
            Back to the library
          </Button>
        </div>
      ) : null}

      {blocked ? (
        <div className="flex flex-col gap-4 rounded-card border border-border bg-card p-6 shadow-card sm:p-8">
          <Database aria-hidden className="size-6 text-slate-gray" />
          <h2 className="text-subheading font-semibold text-foreground">
            No local storage is available here
          </h2>
          <p className="max-w-[62ch] text-body text-muted">
            The browser declined to open IndexedDB, so there is no library to list, edit or export.
            Private and incognito windows do this on purpose, as do some hardened browser settings.
            PromptPaper will not create documents it cannot keep, so nothing on this page is
            pretending to work.
          </p>
          <p className="max-w-[62ch] text-body text-muted">
            Open a normal window, or allow storage for this site, and reload.
          </p>
        </div>
      ) : (
        <>
          <DataLossNotice />

          <StoragePanel
            documentCount={documents.length}
            footprint={footprint}
            estimate={estimate}
            pending={status === 'loading'}
            busy={busy}
            onExport={exportLibrary}
            onRestore={openPicker}
            onDeleteAll={() => setConfirming({ kind: 'all' })}
          />

          <input
            ref={picker}
            type="file"
            accept=".json,application/json"
            className="sr-only"
            aria-label="Choose a PromptPaper backup file"
            onChange={(event) => {
              const file = event.target.files?.[0]
              if (file) void pickBackup(file)
              // Cleared so picking the same file twice still fires a change.
              event.target.value = ''
            }}
          />

          <section aria-labelledby="library-heading" className="flex flex-col gap-6">
            <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
              <div className="flex flex-col gap-2">
                <h2 id="library-heading" className="text-heading-sm font-bold text-foreground">
                  Library
                </h2>
                <p className="text-body-sm text-muted">
                  {status === 'loading'
                    ? 'Reading this browser’s storage…'
                    : `${plural(documents.length, 'document')} · ${formatBytes(footprint)} · newest edited first`}
                </p>
              </div>

              <div className="w-full sm:max-w-sm">
                <label htmlFor="library-search" className="sr-only">
                  Search document titles
                </label>
                <div className="relative">
                  <Search
                    aria-hidden
                    className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate-gray"
                  />
                  <Input
                    id="library-search"
                    className="pl-10"
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="Search by title"
                  />
                </div>
              </div>
            </div>

            <div
              role="group"
              aria-label="Filter by source"
              className="flex flex-wrap gap-2 border-b border-border pb-5"
            >
              {FILTERS.map((option) => {
                const on = option.value === filter
                return (
                  <button
                    key={option.value}
                    type="button"
                    aria-pressed={on}
                    onClick={() => setFilter(option.value)}
                    className={
                      on
                        ? 'rounded-badge border border-signal-blue bg-badge-bg px-3.5 py-1.5 text-body-sm font-medium text-deep-cobalt'
                        : 'rounded-badge border border-border bg-card px-3.5 py-1.5 text-body-sm font-medium text-muted transition-colors hover:border-mist-gray hover:text-foreground'
                    }
                  >
                    {option.label}
                  </button>
                )
              })}
            </div>

            {status === 'loading' ? (
              <p className="text-body text-muted">Reading this browser’s storage…</p>
            ) : documents.length === 0 ? (
              <div className="flex flex-col items-start gap-5 rounded-card border border-border bg-card p-8 shadow-card">
                <h3 className="text-subheading font-semibold text-foreground">0 documents</h3>
                <p className="max-w-[58ch] text-body text-muted">
                  Nothing has been stored in this browser yet, and nothing will be until you bring
                  something in or ask for the sample. One click on either, and the library is a
                  library.
                </p>
                <div className="flex flex-wrap gap-3">
                  <Link to="/import" className={buttonVariants({})}>
                    Import a conversation
                    <ArrowRight aria-hidden className="size-4" />
                  </Link>
                  {/* The whole point of the sample is that the next three
                      buttons on this page stop being hypothetical. */}
                  <Button variant="outline" onClick={() => void loadSample()} disabled={busy}>
                    <Sparkles aria-hidden className="size-4" />
                    Load Sample Thread
                  </Button>
                  <Button variant="outline" onClick={() => setComposer(true)}>
                    <Plus aria-hidden className="size-4" />
                    New document
                  </Button>
                  <Button variant="ghost" onClick={openPicker}>
                    Restore from a backup
                  </Button>
                </div>
              </div>
            ) : visible.length === 0 ? (
              <p className="text-body text-muted">
                No document matches those filters.{' '}
                <button
                  type="button"
                  className="font-medium text-signal-blue underline underline-offset-4"
                  onClick={() => {
                    setQuery('')
                    setFilter('all')
                  }}
                >
                  Clear them
                </button>
              </p>
            ) : (
              <ol className="flex flex-col gap-4">
                {visible.map((record) => (
                  <li
                    key={record.id}
                    className="flex flex-col gap-4 rounded-card border border-border bg-card p-5 shadow-link sm:flex-row sm:items-center sm:gap-6 sm:p-6"
                  >
                    <div className="flex min-w-0 flex-1 flex-col gap-2">
                      <button
                        type="button"
                        onClick={() => openDetail(record)}
                        className="truncate text-left text-subheading font-semibold text-foreground transition-colors hover:text-signal-blue"
                      >
                        {record.title}
                      </button>
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                        <Badge>{PROVIDER_LABEL[record.provider]}</Badge>
                        <p className="text-caption text-muted">
                          {MODE_LABEL[record.mode]} · {plural(record.messageCount, 'message')} ·{' '}
                          {formatBytes(record.sizeBytes)} · edited {formatDateTime(record.updatedAt)}
                        </p>
                      </div>
                    </div>

                    <div className="flex shrink-0 flex-wrap items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        aria-label={`View ${record.title}`}
                        onClick={() => openDetail(record)}
                      >
                        View
                      </Button>
                      <Link
                        to={`/editor/${record.id}`}
                        className={buttonVariants({ variant: 'ghost', size: 'sm' })}
                        aria-label={`Edit ${record.title} in studio`}
                      >
                        Edit
                      </Link>
                      <Link
                        to={`/export/${record.id}`}
                        className={buttonVariants({ variant: 'ghost', size: 'sm' })}
                        aria-label={`Export ${record.title}`}
                      >
                        Export
                      </Link>
                      <Link
                        to={`/transform/${record.id}`}
                        className={buttonVariants({ variant: 'ghost', size: 'sm' })}
                        aria-label={`Open the AI document modes for ${record.title}`}
                      >
                        AI modes
                      </Link>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="text-muted hover:text-foreground"
                        aria-label={`Delete ${record.title}`}
                        onClick={() => setConfirming({ kind: 'one', id: record.id })}
                      >
                        <Trash aria-hidden className="size-4" />
                      </Button>
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </section>
        </>
      )}

      {composer ? (
        <DocumentComposer
          busy={busy}
          onCancel={() => setComposer(false)}
          onSubmit={(draft) => void save(draft)}
        />
      ) : null}

      {inspecting ? (
        <DocumentDetail
          document={inspecting}
          onClose={closeDetail}
          onDelete={() => setConfirming({ kind: 'one', id: inspecting.id })}
        />
      ) : null}

      {restoring ? (
        <RestoreDialog
          fileName={restoring.fileName}
          report={restoring.report}
          existingCount={documents.length}
          busy={busy}
          onCancel={() => setRestoring(null)}
          onConfirm={(incoming, strategy) => void commitRestore(incoming, strategy)}
        />
      ) : null}

      {confirming ? (
        <ConfirmDialog
          title={
            confirming.kind === 'all' ? 'Delete every local document?' : 'Delete this document?'
          }
          description={
            confirming.kind === 'all' ? (
              <>
                <span>
                  This removes all {plural(documents.length, 'document')} from this browser, along
                  with the storage figures that describe them.
                </span>
                <span>
                  It cannot be undone from here. If any of them matter, export a backup first.
                </span>
              </>
            ) : (
              <span>
                Deleting removes this conversation from this browser only. Other documents are
                untouched, and there is no undo.
              </span>
            )
          }
          confirmLabel={confirming.kind === 'all' ? 'Delete everything' : 'Delete document'}
          cancelLabel={confirming.kind === 'all' ? 'Keep the library' : 'Cancel'}
          busy={busy}
          onConfirm={() => void confirmDelete()}
          onCancel={() => setConfirming(null)}
        />
      ) : null}
    </Container>
  )
}

export { DocumentsPage }
