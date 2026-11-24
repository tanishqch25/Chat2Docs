import * as React from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, ArrowRight, FileText } from 'lucide-react'

/* The page-sized document the preview draws. KaTeX's stylesheet arrives with
   the app shell now — see the note in `main.tsx` — because the library and
   the editor typeset the same blocks; only the standalone .html export keeps
   its own copy of the faces, inlined, so a downloaded file needs no origin. */
import '@/styles/export.css'

import { DocumentSheet } from '@/components/export/document-sheet'
import { ExportControls } from '@/components/export/export-controls'
import { FormatButtons } from '@/components/export/format-buttons'
import { Container } from '@/components/layout/container'
import { buttonVariants } from '@/components/ui/button-variants'
import { Field, Select } from '@/components/ui/field'
import { useDocuments } from '@/hooks/useDocuments'
import { formatBytes, formatDateTime, MODE_LABEL, PROVIDER_LABEL } from '@/lib/format'
import { DEFAULT_EXPORT_OPTIONS, PAGE_MM, type DocumentExportOptions } from '@/types/export'

/** A CSS inch, so a millimetre page can be measured in the pane it sits in. */
const MM_TO_PX = 96 / 25.4

/**
 * Where a document becomes a file.
 *
 * The left rail is the whole set of choices the exporters will read; the
 * right is the document itself, drawn by the same function that writes the
 * HTML, on a sheet the size of the paper it will be printed onto. There is
 * no third thing here: no format has a setting the preview does not show,
 * and nothing in the preview is a decoration the download leaves out.
 *
 * Nothing in this page sends a word anywhere. The document is read out of
 * IndexedDB in this browser, laid out in this browser, and written to disk
 * by this browser — which is the same rule the import works by, and the
 * reason an export can be trusted with a thread nobody would want to have
 * explained to a service.
 */

function sheetWidthPx(options: DocumentExportOptions): number {
  return PAGE_MM[options.pageSize].width * MM_TO_PX
}

function MissingState({ documentId, problem }: { documentId?: string; problem: string | null }) {
  return (
    <Container className="py-16 sm:py-24">
      <div className="flex max-w-xl flex-col gap-5">
        <span className="text-caption font-semibold tracking-[0.16em] text-slate-gray uppercase">
          Export preview
        </span>
        <h1 className="text-heading font-semibold text-foreground">
          {problem ? 'The library could not be read' : 'No document at this address'}
        </h1>
        <p className="text-body text-muted">
          {problem ??
            `PromptPaper looked in this browser for the document ${documentId ?? 'you asked for'} and did not find it. ` +
              'It may have been deleted, or the address may have come from another browser — ' +
              'a document lives where it was saved.'}
        </p>
        <Link to="/documents" className={`${buttonVariants({ variant: 'primary' })} self-start`}>
          Back to the library <ArrowRight aria-hidden className="size-4" />
        </Link>
      </div>
    </Container>
  )
}

function ExportPage() {
  const { documentId } = useParams()
  const { documents, status, problem } = useDocuments()
  const [options, setOptions] = React.useState<DocumentExportOptions>(DEFAULT_EXPORT_OPTIONS)
  const [zoom, setZoom] = React.useState<'fit' | 'actual'>('fit')
  const pane = React.useRef<HTMLDivElement>(null)
  const [paneWidth, setPaneWidth] = React.useState(0)

  const record = documents.find((each) => each.id === documentId)

  React.useEffect(() => {
    const el = pane.current
    if (!el) return
    // The content box, not the padding box: a sheet fitted to a pane that
    // includes its own padding overflows the padding it is sitting in.
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setPaneWidth(entry.contentRect.width)
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [record, status])

  const scale = React.useMemo(() => {
    if (zoom === 'actual') return 1
    const natural = sheetWidthPx(options)
    if (paneWidth <= 0 || paneWidth >= natural) return 1
    return Math.max(0.4, paneWidth / natural)
  }, [options, paneWidth, zoom])

  if (status === 'loading') {
    return (
      <Container className="py-16 sm:py-24">
        <p className="text-body text-muted" role="status">
          Reading this browser’s library…
        </p>
      </Container>
    )
  }

  if (!record) return <MissingState documentId={documentId} problem={problem} />

  const onChange = (patch: Partial<DocumentExportOptions>) =>
    setOptions((current) => ({ ...current, ...patch }))

  return (
    <Container className="py-10 sm:py-14">
      <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,340px)_minmax(0,1fr)] lg:gap-12">
        <aside className="pp-chrome flex min-w-0 flex-col gap-8">
          <div className="flex flex-col gap-4">
            <Link
              to="/documents"
              className="inline-flex items-center gap-2 self-start text-caption font-medium text-muted transition-colors hover:text-foreground"
            >
              <ArrowLeft aria-hidden className="size-4" /> Local library
            </Link>
            <h1 className="text-subheading font-semibold break-words text-foreground">
              {record.title}
            </h1>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-3 border-t border-border pt-4">
              {[
                ['Source', PROVIDER_LABEL[record.provider]],
                ['Mode', MODE_LABEL[record.mode]],
                ['Messages', String(record.messageCount)],
                ['Stored', formatBytes(record.sizeBytes)],
                ['Saved', formatDateTime(record.createdAt)],
                ['Edited', formatDateTime(record.updatedAt)],
              ].map(([label, value]) => (
                <div key={label} className="flex min-w-0 flex-col gap-0.5">
                  <dt className="text-caption font-semibold tracking-[0.14em] text-slate-gray uppercase">
                    {label}
                  </dt>
                  <dd className="truncate text-body-sm text-foreground" title={value}>
                    {value}
                  </dd>
                </div>
              ))}
            </dl>

            <Link
              to={`/editor/${record.id}`}
              className={`${buttonVariants({ variant: 'outline', size: 'sm' })} self-start`}
              aria-label={`Edit ${record.title} in studio`}
            >
              Open in editor
            </Link>
          </div>

          <ExportControls options={options} onChange={onChange} />

          <div className="border-t border-border pt-5">
            <Field
              label="Preview size"
              htmlFor="pp-zoom"
              hint={
                zoom === 'fit'
                  ? `Fitted to this pane: ${Math.round(scale * 100)}%. The file is always written at 100%.`
                  : 'Actual size. A page wider than the pane scrolls sideways; printing is unaffected.'
              }
            >
              <Select
                id="pp-zoom"
                value={zoom}
                onChange={(event) => setZoom(event.target.value as 'fit' | 'actual')}
              >
                <option value="fit">Fit to pane</option>
                <option value="actual">100%</option>
              </Select>
            </Field>
          </div>

          <div className="border-t border-border pt-5">
            <p className="mb-4 text-body-sm font-semibold text-foreground">Download</p>
            <FormatButtons document={record} options={options} />
          </div>
        </aside>

        <section
          aria-label={`${record.title}, formatted preview`}
          className="flex min-w-0 flex-col gap-3"
        >
          <p className="pp-chrome flex items-center gap-2 text-caption text-muted">
            <FileText aria-hidden className="size-3.5" />
            {options.pageSize === 'a4' ? 'A4' : 'US Letter'} ·{' '}
            {PAGE_MM[options.pageSize].width} × {PAGE_MM[options.pageSize].height} mm · as it
            exports
          </p>
          <div
            ref={pane}
            className="pp-print-root max-w-full overflow-x-auto rounded-product border border-border bg-pebble p-4 sm:p-6"
          >
            <DocumentSheet document={record} options={options} scale={scale} />
          </div>
        </section>
      </div>
    </Container>
  )
}

export { ExportPage }
