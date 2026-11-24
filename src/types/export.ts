import type { LocalDocument } from '@/types/document'

/**
 * The one settings object every exporter reads.
 *
 * It is a single model rather than per-format options because the promise
 * of the export engine is that a document looks like the preview: what is
 * on screen at /export/:documentId and what arrives in the .docx are
 * decided by these same eleven fields. No exporter may quietly default
 * something the preview did not show, and none may read anything from the
 * document beyond it — the content itself is never reflowed, shortened or
 * paraphrased on the way out.
 *
 * Two of the eleven decide what a page shows rather than what a record
 * holds. `hideSystemAndToolTraces` and `tocStyle` are presentation choices
 * read at the view layer: the stored document keeps every turn the import
 * recovered, and switching the trace filter off puts them back.
 */

export type PageSize = 'a4' | 'letter'

export type DocumentTheme = 'light' | 'dark'

export type FontFamily = 'sans' | 'serif' | 'mono'

export type FontScale = 'compact' | 'standard' | 'comfortable'

/** How much the contents page says: the section headings and the questions
 *  asked, every turn, or nothing. */
export type TocStyle = 'topics' | 'all-turns' | 'none'

export interface DocumentExportOptions {
  pageSize: PageSize
  /** Light and dark are both printable choices: dark is for reading on
   *  screen, and the print stylesheet keeps its ink on white paper. */
  theme: DocumentTheme
  fontFamily: FontFamily
  fontScale: FontScale
  includeToc: boolean
  /** 'topics' is the readable default; 'all-turns' is the complete outline
   *  a long thread was drawn from before. Only read when `includeToc` is on. */
  tocStyle: TocStyle
  includeMetadata: boolean
  includeRoleBadges: boolean
  includePreservationNotes: boolean
  includePageNumbers: boolean
  /** On by default: a system turn or a reasoning marker is plumbing the
   *  site wrote for itself, and sixty of them in a row is not a document.
   *  Off, every one is written exactly as it was stored. */
  hideSystemAndToolTraces: boolean
}

export const DEFAULT_EXPORT_OPTIONS: DocumentExportOptions = {
  pageSize: 'a4',
  theme: 'light',
  fontFamily: 'sans',
  fontScale: 'standard',
  includeToc: true,
  tocStyle: 'topics',
  includeMetadata: true,
  includeRoleBadges: true,
  includePreservationNotes: true,
  includePageNumbers: true,
  hideSystemAndToolTraces: true,
}

/** Labels for the control rail. The stored values stay ASCII slugs, the
 *  way provider and mode do. */
export const PAGE_SIZE_LABEL: Record<PageSize, string> = {
  a4: 'A4',
  letter: 'Letter',
}

export const THEME_LABEL: Record<DocumentTheme, string> = {
  light: 'Light',
  dark: 'Dark',
}

export const FONT_FAMILY_LABEL: Record<FontFamily, string> = {
  sans: 'Sans',
  serif: 'Serif',
  mono: 'Mono',
}

export const FONT_SCALE_LABEL: Record<FontScale, string> = {
  compact: 'Compact',
  standard: 'Standard',
  comfortable: 'Comfortable',
}

export const TOC_STYLE_LABEL: Record<TocStyle, string> = {
  topics: 'Section topics',
  'all-turns': 'Every turn',
  none: 'Nothing',
}

/** Millimetres, so the sheet can be drawn to scale on any screen. A4 is
 *  210 × 297; US Letter is 215.9 × 279.4. */
export const PAGE_MM: Record<PageSize, { width: number; height: number }> = {
  a4: { width: 210, height: 297 },
  letter: { width: 215.9, height: 279.4 },
}

/** The `@page` rule the print stylesheet writes for the chosen size.
 *  Tighter left and right than top and bottom: a document of conversation
 *  is mostly running text, and the extra measure it needs is for the page
 *  number and the breathing room a reader's thumb holds a page by. */
export const PAGE_AT_RULE: Record<PageSize, string> = {
  a4: '@page { size: A4 portrait; margin: 16mm 14mm; }',
  letter: '@page { size: letter portrait; margin: 0.63in 0.55in; }',
}

/** Word measures its pages in twentieths of a point (dxa): 1440 per inch. */
export const PAGE_DXA: Record<PageSize, { width: number; height: number }> = {
  a4: { width: 11906, height: 16838 },
  letter: { width: 12240, height: 15840 },
}

/** The five formats, in the order the studio offers them. */
export const EXPORT_FORMATS = ['pdf', 'docx', 'markdown', 'html', 'text'] as const

export type ExportFormat = (typeof EXPORT_FORMATS)[number]

export const FORMAT_LABEL: Record<ExportFormat, string> = {
  pdf: 'PDF',
  docx: 'DOCX',
  markdown: 'Markdown',
  html: 'HTML',
  text: 'TXT',
}

export const FORMAT_EXTENSION: Record<ExportFormat, string> = {
  pdf: 'pdf',
  docx: 'docx',
  markdown: 'md',
  html: 'html',
  text: 'txt',
}

/** One exporter's contract: the document plus the options, nothing else.
 *  A format that needs the browser — PDF — says so in its own file. */
export type BlobExporter = (
  document: LocalDocument,
  options: DocumentExportOptions,
) => Promise<Blob>
