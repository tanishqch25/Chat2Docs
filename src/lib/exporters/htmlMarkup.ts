import katex from 'katex'

import { isDisplayableSrc, isFollowableHref } from '@/lib/links'
import { LINE_BREAK } from '@/lib/editor/inline'
import {
  SPEAKER_LABEL,
  headingAnchor,
  metadataRows,
  orderedMessages,
  preservationStatement,
  tocFor,
  turnAnchor,
} from '@/lib/exporters/shared'
import { PAGE_AT_RULE, type DocumentExportOptions } from '@/types/export'
import type { ContentBlock, InlineRun } from '@/types/conversation'
import type { LocalDocument, NormalizedMessage } from '@/types/document'

/**
 * The document, as HTML.
 *
 * This is the one markup function in the product, and it is used twice:
 * the preview at /export/:documentId puts its result on screen, and
 * `htmlExporter` wraps the same result in a document shell and hands it
 * over as a file. So what is read on screen is literally what downloads —
 * a difference between the two would be a bug in the exporter, not in the
 * preview, and having one renderer is what makes that impossible.
 *
 * Every string that came out of a conversation passes through `escapeHtml`
 * on the way in, including the ones inside attributes. That is not
 * decoration: a code block containing `<script>` has to appear as those
 * eight characters, and a `href` that says `javascript:` has to stay a
 * piece of text rather than become something the reader's browser runs.
 */

const ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
}

export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ESCAPES[character] ?? character)
}

const attr = (name: string, value: string) => `${name}="${escapeHtml(value)}"`

/**
 * A paragraph the editor gave formatting.
 *
 * The words are escaped exactly as every other string in this file is; the
 * four marks a run can carry are the only thing that becomes a tag, and a
 * link that is not an address a browser may follow stays words with the
 * address written beside them.
 */
function runsHtml(runs: InlineRun[]): string {
  return runs
    .map((run) => {
      const plain = !run.bold && !run.italic && !run.code && !run.href
      if (run.text === LINE_BREAK && plain) return '<br />'
      let html = escapeHtml(run.text)
      if (run.code) html = `<code class="pp-inline-code">${html}</code>`
      if (run.italic) html = `<em>${html}</em>`
      if (run.bold) html = `<strong>${html}</strong>`
      if (run.href) {
        html = isFollowableHref(run.href)
          ? `<a class="pp-link" ${attr('href', run.href.trim())} target="_blank" rel="noopener noreferrer">${html}</a>`
          : `${html} <span class="pp-href">${escapeHtml(run.href)}</span>`
      }
      return html
    })
    .join('')
}

/** Math, typeset at export time so the file needs no script to run. */
function mathHtml(expression: string, display: boolean): string {
  try {
    return katex.renderToString(expression, {
      displayMode: display,
      throwOnError: false,
      output: 'htmlAndMathml',
    })
  } catch {
    // KaTeX refusing an expression is not a licence to lose it: the LaTeX
    // that was stored is written out instead.
    return `<pre class="pp-math-raw">${escapeHtml(expression)}</pre>`
  }
}

function blockHtml(block: ContentBlock, options: DocumentExportOptions, anchor: string | null): string {
  const id = anchor ? ` id="${escapeHtml(anchor)}"` : ''
  const notes = options.includePreservationNotes

  switch (block.kind) {
    case 'text':
      return `<p class="pp-paragraph"${id}>${escapeHtml(block.text)}</p>`
    case 'rich':
      return `<p class="pp-paragraph"${id}>${runsHtml(block.runs)}</p>`
    case 'markdown':
      // Kept as its source. Interpreting Markdown here would be PromptPaper
      // deciding what the export meant.
      return `<p class="pp-paragraph pp-source"${id}>${escapeHtml(block.source)}</p>`
    case 'heading':
      return `<h${block.level} class="pp-heading"${id}>${escapeHtml(block.text)}</h${block.level}>`
    case 'list': {
      const items = block.items.map((item) => `<li>${escapeHtml(item)}</li>`).join('')
      const tag = block.ordered ? 'ol' : 'ul'
      return `<${tag} class="pp-list"${id}>${items}</${tag}>`
    }
    case 'blockquote':
      return `<blockquote class="pp-quote"${id}>${escapeHtml(block.text)}</blockquote>`
    case 'code': {
      const label = [block.language, block.filename, block.caption].filter(Boolean).join(' · ')
      return (
        `<figure class="pp-code-figure"${id}>` +
        `<pre class="pp-code"${block.language ? ` data-language="${escapeHtml(block.language)}"` : ''}>` +
        `<code>${escapeHtml(block.code)}</code></pre>` +
        (label ? `<figcaption class="pp-code-caption">${escapeHtml(label)}</figcaption>` : '') +
        `</figure>`
      )
    }
    case 'table': {
      const head = block.headers
        .map((header) => `<th scope="col">${escapeHtml(header)}</th>`)
        .join('')
      const body = block.rows
        .map(
          (row) =>
            `<tr>${block.headers
              .map((_, index) => `<td>${escapeHtml(row[index] ?? '')}</td>`)
              .join('')}</tr>`,
        )
        .join('')
      return (
        `<table class="pp-table"${id}>` +
        (block.caption ? `<caption>${escapeHtml(block.caption)}</caption>` : '') +
        `<thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`
      )
    }
    case 'math':
      return `<div class="pp-math"${id}>${mathHtml(block.expression, block.display)}</div>`
    case 'link':
      return isFollowableHref(block.href)
        ? `<p class="pp-paragraph"${id}><a class="pp-link" ${attr('href', block.href.trim())} target="_blank" rel="noopener noreferrer">${escapeHtml(block.label)}</a></p>`
        : `<p class="pp-paragraph"${id}>${escapeHtml(block.label)} <span class="pp-href">${escapeHtml(block.href)}</span> <em>(an address a browser will not follow)</em></p>`
    case 'image':
      return block.src && isDisplayableSrc(block.src)
        ? `<p class="pp-figure"${id}><img class="pp-image" ${attr('src', block.src)} ${attr('alt', block.alt)} /></p>`
        : `<p class="pp-paragraph"${id}><span class="pp-badge">Image · ${escapeHtml(block.alt)}</span>${block.src ? ` <em>(address not loadable: ${escapeHtml(block.src)})</em>` : ' <em>(referenced by the export, not held by it)</em>'}</p>`
    case 'file': {
      const detail = [
        block.mimeType,
        block.sizeBytes !== undefined ? `${block.sizeBytes} bytes` : undefined,
      ]
        .filter(Boolean)
        .join(' · ')
      return (
        `<div class="pp-callout"${id}>` +
        `<p class="pp-callout-label">${notes ? 'Attachment' : 'File'}</p>` +
        `<p class="pp-callout-body">${escapeHtml(block.name)}${detail ? ` · ${escapeHtml(detail)}` : ''}</p>` +
        (block.note ? `<p class="pp-callout-note">${escapeHtml(block.note)}</p>` : '') +
        `</div>`
      )
    }
    case 'unsupported':
      return (
        `<div class="pp-callout pp-callout-kept"${id}>` +
        `<p class="pp-callout-label">${notes ? 'Preserved unchanged' : 'Kept'}</p>` +
        `<p class="pp-callout-body">${escapeHtml(block.reason)}</p>` +
        (block.elementType
          ? `<p class="pp-callout-note">named “${escapeHtml(block.elementType)}” by the export</p>`
          : '') +
        `</div>`
      )
  }
}

function turnHtml(message: NormalizedMessage, turn: number, options: DocumentExportOptions): string {
  const who = options.includeRoleBadges
    ? `<span class="pp-speaker-badge pp-${message.role}">${escapeHtml(SPEAKER_LABEL[message.role])}</span>`
    : `<span class="pp-speaker-badge">Turn ${turn}</span>`
  const when = message.timestamp
    ? `<span class="pp-timestamp">${escapeHtml(new Date(message.timestamp).toLocaleString())}</span>`
    : ''
  const blocks = message.content
    .map((block, index) =>
      blockHtml(block, options, block.kind === 'heading' ? headingAnchor(turn, index) : null),
    )
    .join('')
  return (
    `<section class="pp-turn" id="${escapeHtml(turnAnchor(turn))}">` +
    `<header class="pp-speaker">${who}${when}</header>` +
    `${blocks}</section>`
  )
}

/** The document body: title, metadata, contents, the turns, and the
 *  preservation line. Shared by the preview and the file. */
export function sheetHtml(document: LocalDocument, options: DocumentExportOptions, exportedAt = new Date()): string {
  const parts: string[] = [`<h1 class="pp-sheet-title">${escapeHtml(document.title)}</h1>`]

  if (options.includeMetadata) {
    const rows = metadataRows(document, exportedAt)
      .map(
        (row) =>
          `<div class="pp-meta-row"><dt>${escapeHtml(row.label)}</dt><dd>${escapeHtml(row.value)}</dd></div>`,
      )
      .join('')
    parts.push(`<dl class="pp-metadata">${rows}</dl>`)
  }

  if (options.includeToc) {
    const items = tocFor(document)
      .map(
        (entry) =>
          `<li class="pp-toc-${entry.level}"><a href="#${escapeHtml(entry.id)}">${escapeHtml(entry.label)}</a></li>`,
      )
      .join('')
    parts.push(`<nav class="pp-toc"><h2 class="pp-toc-head">Contents</h2><ol>${items}</ol></nav>`)
  }

  parts.push(
    orderedMessages(document)
      .map((message, index) => turnHtml(message, index + 1, options))
      .join(''),
  )

  if (options.includePreservationNotes) {
    parts.push(`<p class="pp-preservation">${escapeHtml(preservationStatement(document))}</p>`)
  }

  if (options.includePageNumbers) {
    // A file cannot number its own pages — only a paged renderer can — so
    // the sheet carries the running footer the printer or the PDF dialog
    // puts a number beside.
    parts.push(
      `<footer class="pp-sheet-footer"><span>${escapeHtml(document.title)}</span>` +
        `<span>${escapeHtml(exportedAt.toLocaleDateString())}</span></footer>`,
    )
  }

  return parts.join('\n')
}

/** The classes the sheet reads its shape from. Same attributes on the
 *  preview element, so the file and the screen agree on size and colour. */
export function sheetDataAttributes(options: DocumentExportOptions): string {
  return [
    `data-page-size="${options.pageSize}"`,
    `data-theme="${options.theme}"`,
    `data-font="${options.fontFamily}"`,
    `data-scale="${options.fontScale}"`,
  ].join(' ')
}

export { PAGE_AT_RULE, blockHtml }
