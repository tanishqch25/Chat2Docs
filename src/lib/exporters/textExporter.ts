import { formatDateTime } from '@/lib/format'
import { runsToPlainText } from '@/lib/editor/inline'
import {
  SPEAKER_LABEL,
  metadataRows,
  orderedMessages,
  preservationStatement,
  tocFor,
} from '@/lib/exporters/shared'
import type { ContentBlock } from '@/types/conversation'
import type { MessageRole } from '@/types/document'
import type { BlobExporter, DocumentExportOptions } from '@/types/export'

/**
 * Plain text: the same conversation with no markup to lean on.
 *
 * Chosen for the reader who pastes the file into an email or a terminal.
 * Structure survives as indentation and rules rather than syntax, tables
 * become aligned columns, and math stays as the LaTeX that was written —
 * which is the only form of it that a text file can hold honestly.
 */

const RULE = '='.repeat(80)
const SUBRULE = '-'.repeat(80)
const INDENT = '    '

/** Wrapped at the right margin, but only for prose. Code and tables keep
 *  their own line breaks; re-flowing either would change what they say. */
function wrap(text: string, width = 80, indent = ''): string {
  return text
    .split('\n')
    .map((paragraph) => {
      if (paragraph.trim().length === 0) return ''
      const words = paragraph.split(/\s+/)
      const lines: string[] = []
      let line = ''
      for (const word of words) {
        if (line.length === 0) line = word
        else if (line.length + 1 + word.length <= width) line = `${line} ${word}`
        else {
          lines.push(line)
          line = word
        }
      }
      lines.push(line)
      return lines.map((l) => `${indent}${l}`).join('\n')
    })
    .join('\n\n')
}

const indentLines = (text: string, prefix = INDENT) =>
  text
    .split('\n')
    .map((line) => `${prefix}${line}`)
    .join('\n')

function speakerHeader(
  role: MessageRole,
  turn: number,
  timestamp: string | undefined,
  options: DocumentExportOptions,
): string {
  const who = options.includeRoleBadges ? `[${SPEAKER_LABEL[role].toUpperCase()}]` : `[TURN ${turn}]`
  const when = timestamp ? ` · ${formatDateTime(timestamp)}` : ''
  return `${who}${when}`
}

/** Columns sized to their own content, so a wide table stays readable
 *  rather than wrapping into a mess. */
function asciiTable(headers: string[], rows: string[][]): string {
  const clean = (value: string) => value.replace(/\s+/g, ' ').trim()
  const columns = headers.map((header, i) =>
    Math.max(
      clean(header).length,
      ...rows.map((row) => clean(row[i] ?? '').length),
      3,
    ),
  )
  const line = (cells: string[]) =>
    cells.map((cell, i) => cell.padEnd(columns[i])).join(' | ').trimEnd()
  return [
    line(headers.map(clean)),
    columns.map((width) => '-'.repeat(width)).join('-|-'),
    ...rows.map((row) => line(headers.map((_, i) => clean(row[i] ?? '')))),
  ].join('\n')
}

function renderBlock(block: ContentBlock, options: DocumentExportOptions): string {
  switch (block.kind) {
    case 'text':
      return wrap(block.text)
    case 'rich':
      // A text file has no way to say bold, so it says the words. The
      // formatting is still in the document; nothing here invents a
      // convention the reader would have to unlearn.
      return wrap(runsToPlainText(block.runs))
    case 'markdown':
      // The source is kept exactly: a text file cannot render it, and
      // re-writing it would be an interpretation.
      return block.source
    case 'heading':
      return `${''.padEnd(block.level * 2)}${block.text.toUpperCase()}\n${'-'.repeat(Math.min(80, block.text.length + 1))}`
    case 'list':
      return block.items
        .map((item, index) => {
          const marker = block.ordered ? `${index + 1}.` : '•'
          const body = wrap(item, 80 - 6, '').split('\n')
          return [`${INDENT}${marker} ${body[0]}`, ...body.slice(1).map((l) => `${INDENT}  ${l}`)].join('\n')
        })
        .join('\n')
    case 'blockquote':
      return indentLines(wrap(block.text, 76, ''), `${INDENT}│ `)
    case 'code': {
      const label = `[Code${block.language ? `: ${block.language}` : ''}]`
      const named = [block.filename, block.caption].filter(Boolean).join(' · ')
      return [label, named ? `  ${named}` : '', indentLines(block.code)].filter(Boolean).join('\n')
    }
    case 'table': {
      const caption = block.caption ? `\n${wrap(block.caption, 80, INDENT)}` : ''
      return `${INDENT}Table\n${indentLines(asciiTable(block.headers, block.rows))}${caption}`
    }
    case 'math':
      return `${INDENT}[Math${block.display ? ' — display' : ''}]\n${indentLines(block.expression)}`
    case 'link':
      return `${INDENT}${block.label}\n${INDENT}${block.href}`
    case 'image':
      return block.src
        ? `${INDENT}[Image] ${block.alt} (address held in the file)`
        : `${INDENT}[Image] ${block.alt} — referenced by the export, not held by it`
    case 'file': {
      const detail = [
        block.mimeType,
        block.sizeBytes !== undefined ? `${block.sizeBytes} bytes` : undefined,
      ]
        .filter(Boolean)
        .join(' · ')
      const head = `${INDENT}[Attachment] ${block.name}${detail ? ` · ${detail}` : ''}`
      const note = block.note ? `\n${indentLines(wrap(block.note, 76, ''), `${INDENT}  `)}` : ''
      return options.includePreservationNotes ? `${head}${note}` : `[File] ${block.name}${note}`
    }
    case 'unsupported': {
      const note = block.elementType ? ` (named “${block.elementType}” by the export)` : ''
      return options.includePreservationNotes
        ? `${INDENT}[Preserved unchanged] ${block.reason}${note}`
        : `${INDENT}${block.reason}${note}`
    }
  }
}

const textExporter: BlobExporter = async (document, options) => {
  const now = new Date()
  const out: string[] = [RULE, document.title.toUpperCase(), RULE, '']

  if (options.includeMetadata) {
    for (const row of metadataRows(document, now)) {
      out.push(`${row.label.padEnd(24)}${row.value}`)
    }
    out.push('')
  }

  if (options.includeToc) {
    out.push('CONTENTS', SUBRULE)
    for (const entry of tocFor(document)) {
      out.push(entry.level === 1 ? entry.label : `${INDENT}${INDENT}${entry.label}`)
    }
    out.push(SUBRULE, '')
  }

  orderedMessages(document).forEach((message, index) => {
    out.push(RULE, speakerHeader(message.role, index + 1, message.timestamp, options), RULE, '')
    for (const block of message.content) out.push(renderBlock(block, options), '')
  })

  if (options.includePreservationNotes) {
    out.push(SUBRULE, wrap(preservationStatement(document), 80), SUBRULE, '')
  }

  return new Blob([out.join('\n')], { type: 'text/plain;charset=utf-8' })
}

export { textExporter }
