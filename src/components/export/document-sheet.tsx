import { useMemo, type CSSProperties } from 'react'

import { sheetHtml } from '@/lib/exporters/htmlMarkup'
import type { DocumentExportOptions } from '@/types/export'
import type { LocalDocument } from '@/types/document'

/**
 * The live preview, which is the export.
 *
 * `sheetHtml` is the same function `htmlExporter` runs before it writes a
 * file, so this component is not a picture of what a download will contain
 * — it is the thing itself, held in the page rather than on disk. The
 * markup arrives as a string because that string is the product; keeping a
 * second, React-shaped copy of it would be exactly the drift this design
 * exists to avoid.
 *
 * What is in that string was escaped on the way out by the exporter: every
 * piece of a conversation passes through `escapeHtml`, addresses a browser
 * would not follow are left as text, and images are only loaded from an
 * embedded or web address. A stored code block containing `<script>` is
 * therefore drawn as eight characters.
 */

interface DocumentSheetProps {
  document: LocalDocument
  options: DocumentExportOptions
  /** The preview is the page, drawn to fit the space there is. A whole A4
   *  sheet is 210mm, which no laptop pane holds at 100%, so the reader
   *  chooses how much of it to see; printing undoes the scale. */
  scale: number
}

function DocumentSheet({ document: record, options, scale }: DocumentSheetProps) {
  const html = useMemo(() => sheetHtml(record, options), [record, options])

  return (
    <div
      className="pp-document-sheet"
      // The four shape attributes the exporters write, so the sheet's own
      // rules do the rest and a setting change is a re-attribute.
      data-page-size={options.pageSize}
      data-theme={options.theme}
      data-font={options.fontFamily}
      data-scale={options.fontScale}
      style={{ zoom: scale } as CSSProperties}
      aria-label={`${record.title}, as it will export`}
      // The exporter's own markup, escaped by the exporter.
      dangerouslySetInnerHTML={{ __html: html }}
    />
  )
}

export { DocumentSheet }
