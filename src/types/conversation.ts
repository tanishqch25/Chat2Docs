/**
 * Normalized conversation model.
 *
 * Every provider import adapter resolves into these types, and the
 * document renderers read only from them. That keeps provider-specific
 * parsing and universal rendering independent: adding ChatGPT, Gemini,
 * Claude, or any future export format means a new adapter, not a new
 * rendering path.
 *
 * A paragraph is a `text` block and an attachment is a `file` block: the
 * names are the ones the store has always used, so a record written before
 * the import engine and one written by it are the same shape. A paragraph
 * that has been given bold, italic, inline code or a link is a `rich` block,
 * which is the one kind the editor adds and every format has to draw.
 */

export interface UnsupportedBlock {
  kind: 'unsupported'
  reason: string
  /** The element type the export named, kept so the warning can quote it. */
  elementType?: string
}

export interface TextBlock {
  kind: 'text'
  text: string
}
export interface MarkdownBlock {
  kind: 'markdown'
  source: string
}

/**
 * One run of words inside a paragraph, with the formatting the editor can
 * put on it.
 *
 * Deliberately narrower than a document model: a run is text plus four flags,
 * so a stored paragraph can be drawn by any format without one, and an
 * address in it stays a string nobody has to trust. A line break the reader
 * pressed is a run holding `\n` and nothing else.
 */
export interface InlineRun {
  text: string
  bold?: true
  italic?: true
  code?: true
  /** Only ever set by the editor after the address passed `isFollowableHref`. */
  href?: string
}

/**
 * A paragraph whose words carry formatting a plain string cannot hold.
 *
 * Prose that arrives from an import is stored as `text` or `markdown` and
 * stays that way until someone actually formats it: this kind exists so that
 * a bold word survives the save, not to rewrite what nobody touched.
 */
export interface RichBlock {
  kind: 'rich'
  runs: InlineRun[]
}

export interface HeadingBlock {
  kind: 'heading'
  level: 1 | 2 | 3 | 4 | 5 | 6
  text: string
}

export interface ListBlock {
  kind: 'list'
  ordered: boolean
  items: string[]
}

export interface BlockquoteBlock {
  kind: 'blockquote'
  text: string
}

export interface CodeBlock {
  kind: 'code'
  code: string
  language?: string
  /** Preserved because an export may carry a filename the user needs. */
  filename?: string
  caption?: string
}

export interface TableBlock {
  kind: 'table'
  headers: string[]
  rows: string[][]
  caption?: string
}

export interface MathBlock {
  kind: 'math'
  expression: string
  display: boolean
}

export interface LinkBlock {
  kind: 'link'
  href: string
  label: string
}

export interface ImageBlock {
  kind: 'image'
  src?: string
  alt: string
  /** Set when the export references an asset we do not hold yet. */
  pending?: boolean
}

export interface FileReferenceBlock {
  kind: 'file'
  name: string
  mimeType?: string
  sizeBytes?: number
  /** Why the file could not be inlined, in the parser's own words. */
  note?: string
}

export type ContentBlock =
  | TextBlock
  | MarkdownBlock
  | RichBlock
  | HeadingBlock
  | ListBlock
  | BlockquoteBlock
  | CodeBlock
  | TableBlock
  | MathBlock
  | LinkBlock
  | ImageBlock
  | FileReferenceBlock
  | UnsupportedBlock
