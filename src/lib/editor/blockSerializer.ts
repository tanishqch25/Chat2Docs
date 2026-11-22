import {
  LINE_BREAK,
  inlineToRuns,
  runsArePlain,
  runsToInline,
  runsToPlainText,
  textToRuns,
} from '@/lib/editor/inline'
import { isFollowableHref } from '@/lib/links'
import type { ContentBlock, InlineRun } from '@/types/conversation'

/**
 * The door a conversation walks through to be edited, and back.
 *
 * Both directions are written here, against the shapes `extensions.ts`
 * builds the schema from, so a document model node and a stored block are
 * two views of one thing rather than two things that have to be kept in
 * step. The rules that make a save trustworthy:
 *
 * — A block the editor cannot express — an attachment, a picture, a canvas
 *   marker, a link address a browser refuses — becomes a protected card
 *   holding that block. Reading it back yields the same object, so editing
 *   the paragraph above an attachment costs the attachment nothing.
 *
 * — A paragraph remembers the kind it arrived as. Words with no formatting
 *   on them are written back as `text`, or as `markdown` if that is what
 *   was stored, so opening a document and saving it changes nothing.
 *
 * — Formatting only appears where the store has a place for it. A link that
 *   is the whole paragraph is a `link` block again; a paragraph with marks
 *   on part of it is a `rich` one; and a heading, a list item, a quote or a
 *   cell holds plain words, because those blocks are stored as strings.
 *
 * — Anything the editor cannot represent is refused at the schema, not
 *   dropped at the save: there is no underline, no rule, no nested list and
 *   no image inside a cell to lose.
 */

/** One node, text node or line break in the editor's document model. */
export interface EditorNode {
  type: string
  attrs?: Record<string, unknown>
  content?: EditorNode[]
  text?: string
  marks?: { type: string; attrs?: Record<string, unknown> }[]
}

export interface EditorDoc {
  type: 'doc'
  content: EditorNode[]
}

/** The kinds drawn as a card, and the only ones whose payload a card may carry. */
export type CardBlock = Extract<ContentBlock, { kind: 'image' | 'file' | 'unsupported' | 'link' }>

const PROTECTED_KINDS = new Set(['image', 'file', 'unsupported', 'link'])

const children = (node: EditorNode): EditorNode[] => node.content ?? []

const attrOf = (node: EditorNode, name: string): unknown => node.attrs?.[name]

/** A stored string field, read out of an attribute that may not be there. */
function stringAttr(node: EditorNode, name: string): string | undefined {
  const value = attrOf(node, name)
  return typeof value === 'string' && value.length > 0 ? value : undefined
}

/**
 * A card's payload, checked before anything trusts it.
 *
 * The same answer is needed both ways: a block copied through a DOM
 * attribute is somebody else's JSON until these fields pass, and a link
 * address a browser would follow belongs in an editable paragraph, never in
 * a card no one can rewrite.
 */
export function isStoredCard(value: unknown): value is CardBlock {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false
  const block = value as Record<string, unknown>
  if (typeof block.kind !== 'string' || !PROTECTED_KINDS.has(block.kind)) return false
  const optional = (fields: string[], type: 'string' | 'number') =>
    fields.every((field) => block[field] === undefined || typeof block[field] === type)
  switch (block.kind) {
    case 'image':
      return typeof block.alt === 'string' && optional(['src'], 'string')
    case 'file':
      return (
        typeof block.name === 'string' &&
        optional(['mimeType', 'note'], 'string') &&
        optional(['sizeBytes'], 'number')
      )
    case 'unsupported':
      return typeof block.reason === 'string' && optional(['elementType'], 'string')
    case 'link':
      return (
        typeof block.href === 'string' &&
        typeof block.label === 'string' &&
        !isFollowableHref(block.href)
      )
  }
  return false
}

const card = (block: CardBlock): EditorNode => ({
  type: 'protectedBlock',
  attrs: { block },
})

function paragraph(originKind: string, runs: InlineRun[]): EditorNode {
  return {
    type: 'paragraph',
    attrs: { originKind },
    content: runsToInline(runs),
  }
}

/**
 * Words that came in as a string.
 *
 * A newline becomes a line break the reader can see and move through, and
 * comes back as a newline again, so a stored block is not rearranged by
 * being opened.
 */
const wordsToRuns = (value: string): InlineRun[] => textToRuns(value)

/**
 * One block's plain words, split so every line is a paragraph of its own.
 *
 * A quote, a list item and a table cell are stored as strings that may hold
 * newlines. Giving each line its own paragraph is what lets someone press
 * Enter in one of them and have the newline still be there afterwards.
 */
const linesToParagraphs = (value: string): EditorNode[] =>
  value.split(LINE_BREAK).map((line) => ({
    type: 'paragraph',
    content: runsToInline(wordsToRuns(line)),
  }))

function blockToNode(block: ContentBlock): EditorNode | null {
  switch (block.kind) {
    case 'text':
      return paragraph('text', wordsToRuns(block.text))
    case 'markdown':
      return paragraph('markdown', wordsToRuns(block.source))
    case 'rich':
      return paragraph('rich', block.runs)
    case 'heading':
      return {
        type: 'heading',
        attrs: { level: block.level },
        content: runsToInline(wordsToRuns(block.text)),
      }
    case 'list':
      // An empty list has no items to keep and no valid shape to hold them,
      // so there is nothing here to lose.
      if (block.items.length === 0) return null
      return {
        type: block.ordered ? 'orderedList' : 'bulletList',
        content: block.items.map((item) => ({
          type: 'listItem',
          content: linesToParagraphs(item),
        })),
      }
    case 'blockquote':
      return { type: 'blockquote', content: linesToParagraphs(block.text) }
    case 'code':
      return {
        type: 'codeBlock',
        attrs: {
          language: block.language ?? null,
          filename: block.filename ?? null,
          caption: block.caption ?? null,
        },
        content: block.code.length > 0 ? [{ type: 'text', text: block.code }] : [],
      }
    case 'table': {
      const cell = (value: string, tag: 'tableHeader' | 'tableCell'): EditorNode => ({
        type: tag,
        content: linesToParagraphs(value),
      })
      return {
        type: 'table',
        attrs: { caption: block.caption ?? null },
        content: [
          {
            type: 'tableRow',
            content: block.headers.map((header) => cell(header, 'tableHeader')),
          },
          ...block.rows.map((row) => ({
            type: 'tableRow',
            content: block.headers.map((_, index) => cell(row[index] ?? '', 'tableCell')),
          })),
        ],
      }
    }
    case 'math':
      return { type: 'mathBlock', attrs: { expression: block.expression, display: block.display } }
    case 'link':
      // A link that is one clickable address is one linked line of words.
      // Anything else — an address a browser refuses, or no label at all to
      // click — stays a card nobody can accidentally rewrite.
      if (!isFollowableHref(block.href) || block.label.length === 0) return card(block)
      return paragraph('text', [{ text: block.label, href: block.href }])
    case 'image':
    case 'file':
    case 'unsupported':
      return card(block)
  }
}

export function blocksToDoc(blocks: ContentBlock[]): EditorDoc {
  const content = blocks
    .map(blockToNode)
    .filter((node): node is EditorNode => node !== null)
  // A document model needs one block to sit in, which is also where the
  // cursor goes when a turn has nothing yet.
  return { type: 'doc', content: content.length > 0 ? content : [{ type: 'paragraph' }] }
}

/** The words of an inline run, with every line break put back. */
const inlineWords = (node: EditorNode): string => runsToPlainText(inlineToRuns(children(node)))

/**
 * A heading, a list item, a quote or a cell, as the string the store keeps.
 *
 * Each paragraph inside becomes one line, so a newline someone typed is a
 * newline in the saved block rather than a lost keystroke.
 */
function nodeWords(node: EditorNode): string {
  return children(node).map(inlineWords).join(LINE_BREAK)
}

function nodeText(node: EditorNode): string {
  return node.content
    ? children(node)
        .map((child) => (child.type === 'text' ? (child.text ?? '') : nodeText(child)))
        .join('')
    : ''
}

const HEADING_LEVELS = [1, 2, 3, 4, 5, 6] as const

function headingLevel(node: EditorNode): (typeof HEADING_LEVELS)[number] {
  const level = Number(attrOf(node, 'level'))
  return (HEADING_LEVELS.includes(level as 1) ? level : 1) as (typeof HEADING_LEVELS)[number]
}

/**
 * A paragraph, as the kind the store keeps.
 *
 * The order is the whole argument: a link that is all there is, then plain
 * words in the kind they arrived as, then — only then — a `rich` block,
 * because formatting is the one thing a string cannot hold.
 */
function paragraphBlock(node: EditorNode): ContentBlock | null {
  const runs = inlineToRuns(children(node))
  if (runs.length === 0) return null

  const [only] = runs
  if (runs.length === 1 && only.href && !only.bold && !only.italic && !only.code)
    return { kind: 'link', href: only.href, label: only.text }

  if (runsArePlain(runs)) {
    const text = runsToPlainText(runs)
    const originKind = attrOf(node, 'originKind')
    return originKind === 'markdown' ? { kind: 'markdown', source: text } : { kind: 'text', text }
  }
  return { kind: 'rich', runs }
}

function tableCells(row: EditorNode, tag: 'tableHeader' | 'tableCell'): string[] {
  return children(row)
    .filter((cell) => cell.type === tag)
    .map((cell) => nodeWords(cell))
}

function nodeToBlocks(node: EditorNode): ContentBlock[] {
  switch (node.type) {
    case 'paragraph': {
      const block = paragraphBlock(node)
      return block ? [block] : []
    }
    case 'heading': {
      const text = inlineWords(node)
      return text.length > 0 ? [{ kind: 'heading', level: headingLevel(node), text }] : []
    }
    case 'bulletList':
    case 'orderedList': {
      const items = children(node)
        .filter((item) => item.type === 'listItem')
        .map((item) => nodeWords(item))
      return items.length > 0
        ? [{ kind: 'list', ordered: node.type === 'orderedList', items }]
        : []
    }
    case 'blockquote': {
      const text = nodeWords(node)
      return text.length > 0 ? [{ kind: 'blockquote', text }] : []
    }
    case 'codeBlock': {
      const block: ContentBlock = {
        kind: 'code',
        code: nodeText(node),
        language: stringAttr(node, 'language'),
        filename: stringAttr(node, 'filename'),
        caption: stringAttr(node, 'caption'),
      }
      return block.code.length > 0 ? [block] : []
    }
    case 'table': {
      const rows = children(node).filter((row) => row.type === 'tableRow')
      const [first, ...rest] = rows
      if (!first) return []
      const headers = tableCells(first, 'tableHeader')
      if (headers.length === 0) return []
      return [
        {
          kind: 'table',
          headers,
          rows: rest.map((row) => {
            const cells = tableCells(row, 'tableCell')
            return headers.map((_, index) => cells[index] ?? '')
          }),
          caption: stringAttr(node, 'caption'),
        },
      ]
    }
    case 'mathBlock':
      return [
        {
          kind: 'math',
          expression: typeof attrOf(node, 'expression') === 'string' ? String(attrOf(node, 'expression')) : '',
          display: attrOf(node, 'display') !== false,
        },
      ]
    case 'protectedBlock': {
      const block = attrOf(node, 'block')
      return isStoredCard(block) ? [block] : []
    }
    default:
      // Nothing else is in the schema the editor is built from.
      return []
  }
}

/**
 * The document model, back to the blocks the library stores.
 *
 * `null` fields are left off rather than written as nothing, because a code
 * block with no language and a code block with an empty language string are
 * not the same record, and the store should keep saying the first one.
 */
export function docToBlocks(doc: EditorDoc): ContentBlock[] {
  return children(doc).flatMap(nodeToBlocks)
}

export function jsonToBlocks(json: unknown): ContentBlock[] {
  return docToBlocks(json as EditorDoc)
}
