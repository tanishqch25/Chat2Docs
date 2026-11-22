import type { LocalDocument } from '@/types/document'

/**
 * The one settings object every exporter reads.
 *
 * It is a single model rather than per-format options because the promise
 * of the export engine is that a document looks like the preview: what is
 * on screen at /export/:documentId and what arrives in the .docx are
 * decided by these same nine fields. No exporter may quietly default
 * something the preview did not show, and none may read anything from the
 * document beyond it — the content itself is never reflowed, shortened or
 * paraphrased on the way out.
 */

export type PageSize = 'a4' | 'letter'

export type DocumentTheme = 'light' | 'dark'

export type FontFamily = 'sans' | 'serif' | 'mono'

export type FontScale = 'compact' | 'standard' | 'comfortable'

export interface DocumentExportOptions {
  pageSize: PageSize
  /** Light and dark are both printable choices: dark is for reading on
   *  screen, and the print stylesheet keeps its ink on white paper. */
  theme: DocumentTheme
  fontFamily: FontFamily
  fontScale: FontScale
  includeToc: boolean
  includeMetadata: boolean
  includeRoleBadges: boolean
  includePreservationNotes: boolean
  includePageNumbers: boolean
}

export const DEFAULT_EXPORT_OPTIONS: DocumentExportOptions = {
  pageSize: 'a4',
  theme: 'light',
  fontFamily: 'sans',
  fontScale: 'standard',
  includeToc: true,
  includeMetadata: true,
  includeRoleBadges: true,
  includePreservationNotes: true,
  includePageNumbers: true,
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

/** Millimetres, so the sheet can be drawn to scale on any screen. A4 is
 *  210 × 297; US Letter is 215.9 × 279.4. */
export const PAGE_MM: Record<PageSize, { width: number; height: number }> = {
  a4: { width: 210, height: 297 },
  letter: { width: 215.9, height: 279.4 },
}

/** The `@page` rule the print stylesheet writes for the chosen size. */
export const PAGE_AT_RULE: Record<PageSize, string> = {
  a4: '@page { size: A4 portrait; margin: 16mm; }',
  letter: '@page { size: letter portrait; margin: 0.65in; }',
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
