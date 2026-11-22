import * as React from 'react'
import { Check, Download, FileText, Loader } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { downloadName, triggerBlobDownload } from '@/lib/exporters/download'
import {
  EXPORT_FORMATS,
  FORMAT_EXTENSION,
  FORMAT_LABEL,
  type DocumentExportOptions,
  type ExportFormat,
} from '@/types/export'
import type { LocalDocument } from '@/types/document'

/**
 * The five downloads.
 *
 * Each format's code arrives only when its button is pressed: `docx` is a
 * library big enough to be worth its own chunk, KaTeX's embedded typefaces
 * are carried by the HTML file alone, and Markdown, text and print need
 * almost nothing. So the page a reader lands on holds the document and the
 * controls, and each format's weight follows the click that asked for it.
 *
 * A button says which of four things happened — waiting, working, written,
 * or refused — and a refusal keeps its reason on screen. A download that
 * quietly did nothing is the failure mode this whole file exists to avoid.
 */

type Phase = 'idle' | 'working' | 'done' | 'error'

const RUNNERS: Record<
  ExportFormat,
  (document: LocalDocument, options: DocumentExportOptions) => Promise<void>
> = {
  markdown: async (document, options) => {
    const { markdownExporter } = await import('@/lib/exporters/markdownExporter')
    triggerBlobDownload(
      await markdownExporter(document, options),
      downloadName(document.title, FORMAT_EXTENSION.markdown),
    )
  },
  text: async (document, options) => {
    const { textExporter } = await import('@/lib/exporters/textExporter')
    triggerBlobDownload(
      await textExporter(document, options),
      downloadName(document.title, FORMAT_EXTENSION.text),
    )
  },
  html: async (document, options) => {
    const { htmlExporter } = await import('@/lib/exporters/htmlExporter')
    triggerBlobDownload(
      await htmlExporter(document, options),
      downloadName(document.title, FORMAT_EXTENSION.html),
    )
  },
  docx: async (document, options) => {
    const { docxExporter } = await import('@/lib/exporters/docxExporter')
    triggerBlobDownload(
      await docxExporter(document, options),
      downloadName(document.title, FORMAT_EXTENSION.docx),
    )
  },
  pdf: async (_document, options) => {
    const { printDocument } = await import('@/lib/exporters/pdfExporter')
    printDocument(options)
  },
}

const FAILURE: Record<ExportFormat, string> = {
  markdown: 'The Markdown file could not be written.',
  text: 'The text file could not be written.',
  html: 'The HTML file could not be written.',
  docx: 'The Word document could not be written.',
  pdf: 'The print dialog could not be opened.',
}

const LABEL = (format: ExportFormat): string => `Download ${FORMAT_LABEL[format]}`

/** The print path writes no file of its own: the reader names the
 *  destination inside the dialog, so the tab can only report that the
 *  dialog opened. Saying "Downloaded" there would claim a thing that did
 *  not happen. */
const DONE_LABEL: Record<ExportFormat, string> = {
  markdown: 'Downloaded',
  text: 'Downloaded',
  html: 'Downloaded',
  docx: 'Downloaded',
  pdf: 'Print dialog opened',
}

/** Say what the PDF button does before it is pressed: that download is a
 *  print dialog rather than a file, and the reader names the destination
 *  there. */
const PDF_TIP =
  'Choose ‘Save as PDF’ in your browser’s print dialog for crisp, searchable vector text.'

function phaseLabel(format: ExportFormat, phase: Phase): string {
  if (phase === 'working') return 'Generating…'
  if (phase === 'done') return DONE_LABEL[format]
  if (phase === 'error') return 'Try again'
  return LABEL(format)
}

interface FormatButtonsProps {
  document: LocalDocument
  options: DocumentExportOptions
}

function FormatButtons({ document: record, options }: FormatButtonsProps) {
  const [phases, setPhases] = React.useState<Record<ExportFormat, Phase>>({
    pdf: 'idle',
    docx: 'idle',
    markdown: 'idle',
    html: 'idle',
    text: 'idle',
  })
  const [problem, setProblem] = React.useState<string | null>(null)
  const timers = React.useRef<number[]>([])

  // A "Downloaded" tick is a report about a moment that has passed, so it
  // has to pass: it is cleared here rather than left to outlive the file.
  React.useEffect(
    () => () => {
      for (const timer of timers.current) window.clearTimeout(timer)
    },
    [],
  )

  const run = async (format: ExportFormat) => {
    setProblem(null)
    setPhases((current) => ({ ...current, [format]: 'working' }))
    try {
      await RUNNERS[format](record, options)
      setPhases((current) => ({ ...current, [format]: 'done' }))
    } catch (error) {
      setPhases((current) => ({ ...current, [format]: 'error' }))
      setProblem(
        `${FAILURE[format]} ${
          error instanceof Error ? error.message : 'The browser would not say why.'
        }`,
      )
      return
    }
    timers.current.push(
      window.setTimeout(
        () => setPhases((current) => ({ ...current, [format]: 'idle' })),
        2600,
      ),
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        {EXPORT_FORMATS.map((format) => {
          const phase = phases[format]
          return (
            <Button
              key={format}
              variant={format === 'pdf' ? 'primary' : 'outline'}
              className="justify-start"
              disabled={phase === 'working'}
              aria-label={`${LABEL(format)} — ${record.title}`}
              onClick={() => void run(format)}
            >
              {phase === 'working' ? (
                <Loader aria-hidden className="size-4 animate-spin" />
              ) : phase === 'done' ? (
                <Check aria-hidden className="size-4" />
              ) : (
                <Download aria-hidden className="size-4" />
              )}
              {phaseLabel(format, phase)}
            </Button>
          )
        })}
      </div>

      <p className="flex gap-2 text-caption text-muted">
        <FileText aria-hidden className="mt-px size-3.5 shrink-0" />
        {PDF_TIP}
      </p>

      {problem ? (
        <p role="alert" className="text-caption text-foreground">
          {problem}
        </p>
      ) : null}
    </div>
  )
}

export { FormatButtons }
