import { formatDateTime } from '@/lib/format'
import { isFollowableHref } from '@/lib/links'
import { LINE_BREAK } from '@/lib/editor/inline'
import { tokenizeInline, type InlineToken } from '@/lib/parsers/inlineScanner'
import {
  SPEAKER_LABEL,
  TRACES_HIDDEN_NOTE,
  exportView,
  headingAnchor,
  metadataRows,
  preservationStatement,
  tocFor,
  tracesAreHidden,
  turnAnchor,
} from '@/lib/exporters/shared'
import type { ContentBlock, InlineRun } from '@/types/conversation'
import type { MessageRole } from '@/types/document'
import type { BlobExporter, DocumentExportOptions } from '@/types/export'

/**
 * GitHub-Flavored Markdown, written straight from the stored blocks.
 *
 * Text is not escaped. An importer that turned `*` into `\*` would be a
 * faithful file but a different document, and the promise here is that the
 * words are the ones that were said. The two places escaping is required
 * for the file to still parse — a pipe inside a table cell, and a code
 * fence longer than any run of backticks inside the code — are the only
 * places it happens.
 *
 * Marks that arrived already written inside a paragraph stay marks: a
 * `**bold**` the site gave us is the same instruction a Markdown reader
 * would have typed, and a formula in ChatGPT's escaped brackets is the same
 * formula in the `$$` every tool knows. What the file does not carry is the
 * markup only one site understands.
 */

/** A speaker header, or a numbered turn when the badges are switched off.
 *  The boundary itself is never dropped: a document that stopped saying
 *  where one turn ended would have lost structure. */
function speakerHeading(
  role: MessageRole,
  turn: number,
  timestamp: string | undefined,
  options: DocumentExportOptions,
): string {
  const who = options.includeRoleBadges ? SPEAKER_LABEL[role] : `Turn ${turn}`
  return `## ${who}${timestamp ? ` · ${formatDateTime(timestamp)}` : ''}`
}

/** Longest run of backticks in the code, so the fence cannot be closed by
 *  the code itself. */
function fenceFor(code: string): string {
  let longest = 0
  for (const run of code.match(/`+/g) ?? []) longest = Math.max(longest, run.length)
  return '`'.repeat(Math.max(3, longest + 1))
}

const cell = (value: string) => value.replace(/\\/g, '\\\\').replace(/\|/g, '\\|').replace(/\n/g, ' ')

/** Inline code is fenced one backtick longer than any run inside it, which
 *  is the same rule the code blocks above are written by. */
function inlineCode(text: string): string {
  let longest = 0
  for (const run of text.match(/`+/g) ?? []) longest = Math.max(longest, run.length)
  const fence = '`'.repeat(longest + 1)
  const pad = text.startsWith('`') || text.endsWith('`') || text.length === 0 ? ' ' : ''
  return `${fence}${pad}${text}${pad}${fence}`
}

/**
 * A formatted paragraph, in the Markdown a reader's own tools parse.
 *
 * `**bold**` and `_italic_` here are the words the editor was given, not a
 * rewriting of them: a document that had its formatting flattened back to
 * plain text would have lost something the reader can see on screen.
 */
function renderRuns(runs: InlineRun[]): string {
  return runs
    .map((run) => {
      const plain = !run.bold && !run.italic && !run.code && !run.href
      if (run.text === LINE_BREAK && plain) return '\\\n'
      let text = run.code ? inlineCode(run.text) : run.text
      if (run.italic) text = `_${text}_`
      if (run.bold) text = `**${text}**`
      if (!run.href) return text
      return isFollowableHref(run.href)
        ? `[${text}](${run.href.trim()})`
        : `${text} (address not followed by a browser: ${run.href})`
    })
    .join('')
}

/**
 * One piece of the inline scan, in the Markdown a reader's own tools parse.
 *
 * The marks a paragraph already carried keep their meaning; the ones only
 * the site that wrote them understood are translated into it: an escaped
 * bracket pair becomes `$$`, a badge becomes bold words, a divider becomes a
 * rule, and an illustration the page drew from a query says that query.
 */
const DIVIDER = '\n\n---\n\n'

function renderToken(token: InlineToken): string {
  switch (token.kind) {
    case 'text':
      return token.text
    case 'bold':
    case 'badge':
      return `**${token.text}**`
    case 'italic':
      return `_${token.text}_`
    case 'code':
      return inlineCode(token.text)
    case 'cite':
      return token.href && isFollowableHref(token.href)
        ? `[${token.text}](${token.href.trim()})`
        : `**${token.text}**`
    case 'illustration':
      return `*[Illustration: ${token.text}]*`
    case 'math':
      return token.display
        ? `$$\n${token.expression}\n$$`
        : `$${token.expression}$`
    case 'link':
      return isFollowableHref(token.href)
        ? `[${token.text || token.href}](${token.href.trim()})`
        : `${token.text || token.href} (address not followed by a browser: ${token.href})`
    case 'divider':
      return '\n\n---\n\n'
  }
}

const renderInline = (source: string): string => {
  const pieces = tokenizeInline(source).map(renderToken)
  // A message that is nothing but a rule is its own block, and the block
  // joiner already puts a blank line around it.
  if (pieces.length === 1 && pieces[0] === DIVIDER) return '---'

  let out = ''
  for (const piece of pieces) {
    if (piece === DIVIDER) {
      // One rule, one blank line either side: the paragraph's own breaks
      // are already inside the pieces on either side of it.
      out = `${out.trimEnd()}${DIVIDER}`
      continue
    }
    out += out.endsWith('\n') ? piece.replace(/^\n+/, '') : piece
  }
  return out
}

/** A line of a list or a table may not hold a block rule or a newline. */
const renderInlineFlat = (source: string): string =>
  renderInline(source)
    .replace(/\n+---\n+/g, ' --- ')
    .replace(/\n+/g, ' ')

function renderBlock(block: ContentBlock, options: DocumentExportOptions): string {
  switch (block.kind) {
    case 'text':
      return renderInline(block.text)
    case 'rich':
      return renderRuns(block.runs)
    case 'markdown':
      return renderInline(block.source)
    case 'heading':
      return `${'#'.repeat(block.level)} ${renderInlineFlat(block.text)}`
    case 'list':
      return block.items
        .map((item, index) =>
          `${block.ordered ? `${index + 1}.` : '-'} ${renderInlineFlat(item).replace(/\n/g, '\n  ')}`,
        )
        .join('\n')
    case 'blockquote':
      return renderInline(block.text)
        .split('\n')
        .map((line) => `> ${line}`)
        .join('\n')
    case 'code': {
      const fence = fenceFor(block.code)
      const caption = [block.language, block.filename, block.caption]
        .filter(Boolean)
        .join(' · ')
      return `${fence}${block.language ?? ''}\n${block.code}\n${fence}${caption ? `\n\n*${caption}*` : ''}`
    }
    case 'table': {
      const head = `| ${block.headers.map((header) => cell(renderInlineFlat(header))).join(' | ')} |`
      const rule = `| ${block.headers.map(() => '---').join(' | ')} |`
      const body = block.rows
        .map(
          (row) =>
            `| ${block.headers.map((_, i) => cell(renderInlineFlat(row[i] ?? ''))).join(' | ')} |`,
        )
        .join('\n')
      return [head, rule, body, block.caption ? `\n*${block.caption}*` : '']
        .filter(Boolean)
        .join('\n')
    }
    case 'math':
      return block.display
        ? `$$\n${block.expression}\n$$`
        : `$${block.expression}$`
    case 'link':
      return isFollowableHref(block.href)
        ? `[${block.label}](${block.href.trim()})`
        : `${block.label} (address not followed by a browser: ${block.href})`
    case 'image':
      return block.src
        ? `![${block.alt}](<${block.src}>)`
        : `![${block.alt}] — referenced by the export, not held by it`
    case 'file': {
      const detail = [block.mimeType, block.sizeBytes !== undefined ? `${block.sizeBytes} bytes` : undefined]
        .filter(Boolean)
        .join(' · ')
      const note = block.note ? ` — ${block.note}` : ''
      return options.includePreservationNotes
        ? `> [Attachment] **${block.name}**${detail ? ` · ${detail}` : ''}${note}`
        : `**${block.name}**${detail ? ` · ${detail}` : ''}${note}`
    }
    case 'unsupported':
      return options.includePreservationNotes
        ? `> [Preserved unchanged] ${block.reason}${block.elementType ? ` (named “${block.elementType}” by the export)` : ''}`
        : `${block.reason}${block.elementType ? ` (named “${block.elementType}” by the export)` : ''}`
  }
}

/** A link label may not hold raw brackets. */
const linkLabel = (value: string) => value.replace(/([[\]])/g, '\\$1')

const markdownExporter: BlobExporter = async (document, options) => {
  const now = new Date()
  const view = exportView(document, options)
  const out: string[] = [`# ${document.title}`, '']

  if (options.includeMetadata) {
    for (const row of metadataRows(document, now, options)) out.push(`**${row.label}:** ${row.value}  `)
    out.push('')
  }

  const entries = tocFor(document, options)
  if (entries.length > 0) {
    out.push('## Contents', '')
    for (const entry of entries) {
      out.push(`${entry.level === 1 ? '- ' : '  - '}[${linkLabel(entry.label)}](#${entry.id})`)
    }
    out.push('')
  }

  for (const { message, content, turn } of view.turns) {
    out.push(`<a id="${turnAnchor(turn)}"></a>`, '')
    out.push(speakerHeading(message.role, turn, message.timestamp, options), '')
    content.forEach((block, blockIndex) => {
      if (block.kind === 'heading') {
        out.push(`<a id="${headingAnchor(turn, blockIndex)}"></a>`, '')
      }
      out.push(renderBlock(block, options), '')
    })
  }

  if (tracesAreHidden(view)) {
    out.push(`> ${TRACES_HIDDEN_NOTE}`, '')
  }

  if (options.includePreservationNotes) {
    out.push('---', '', `> ${preservationStatement(document, options)}`, '')
  }

  return new Blob([out.join('\n')], { type: 'text/markdown;charset=utf-8' })
}

export { markdownExporter }
