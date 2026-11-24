import katex from 'katex'

import { isDisplayableSrc, isFollowableHref } from '@/lib/links'
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
  type DisplayTurn,
} from '@/lib/exporters/shared'
import { PAGE_AT_RULE, type DocumentExportOptions } from '@/types/export'
import type { ContentBlock, InlineRun } from '@/types/conversation'
import type { LocalDocument } from '@/types/document'

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
 * The inline scanner decides *which* characters become a tag, and it runs
 * before escaping: a token holds words, and each renderer escapes the ones
 * it puts between tags.
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

/**
 * One piece of an inline scan, drawn as the markup it names.
 *
 * The words of a token are escaped here and nowhere earlier, so a bold
 * phrase holding `<` still arrives on the page as a character. A link the
 * scanner found is checked the same way a stored link block is: an address
 * a browser will not follow is written beside the words instead of under
 * them, and the file says so.
 */
function inlineTokenHtml(token: InlineToken): string {
  switch (token.kind) {
    case 'text':
      return escapeHtml(token.text)
    case 'bold':
      return `<strong>${escapeHtml(token.text)}</strong>`
    case 'italic':
      return `<em>${escapeHtml(token.text)}</em>`
    case 'code':
      return `<code class="pp-inline-code">${escapeHtml(token.text)}</code>`
    case 'link':
      return isFollowableHref(token.href)
        ? `<a class="pp-link" ${attr('href', token.href.trim())} target="_blank" rel="noopener noreferrer">${escapeHtml(token.text || token.href)}</a>`
        : `${escapeHtml(token.text || token.href)} <span class="pp-href">${escapeHtml(token.href)}</span>`
    case 'math':
      // A display equation read in the middle of a sentence is still the
      // equation it was; the paragraph break the scanner takes around it is
      // what puts it on its own line.
      return `<span class="pp-math-inline">${mathHtml(token.expression, false)}</span>`
    case 'badge':
      return `<span class="pp-badge">${escapeHtml(token.text)}</span>`
    case 'illustration':
      return `<span class="pp-illustration">Illustration · ${escapeHtml(token.text)}</span>`
    case 'cite':
      return token.href && isFollowableHref(token.href)
        ? `<a class="pp-link" ${attr('href', token.href.trim())} target="_blank" rel="noopener noreferrer">${escapeHtml(token.text)}</a>`
        : `<span class="pp-badge">${escapeHtml(token.text)}</span>`
    case 'divider':
      return ''
  }
}

const inlineHtml = (text: string): string => tokenizeInline(text).map(inlineTokenHtml).join('')

/**
 * A paragraph, or the several a paragraph turned out to hold.
 *
 * ChatGPT writes a divider between two ideas as a tag and a display formula
 * as a pair of escaped brackets, both in the same line of prose the reader
 * sees. The scanner finds them; this splits the line so a divider becomes a
 * rule and an equation becomes a block, which is what they were drawn as on
 * the site they came from.
 */
function inlineBodyHtml(source: string, id: string): string {
  const tokens = tokenizeInline(source)
  const parts: string[] = []
  let run: InlineToken[] = []

  const flush = () => {
    const kept = run.filter(
      (token) => !(token.kind === 'text' && token.text.trim().length === 0),
    )
    run = []
    if (kept.length === 0) return
    const first = parts.length === 0 ? id : ''
    parts.push(`<p class="pp-paragraph"${first}>${kept.map(inlineTokenHtml).join('')}</p>`)
  }

  for (const token of tokens) {
    if (token.kind === 'divider') {
      flush()
      parts.push(`<hr class="pp-rule"${parts.length === 0 ? id : ''} />`)
      continue
    }
    if (token.kind === 'math' && token.display) {
      flush()
      parts.push(`<div class="pp-math"${parts.length === 0 ? id : ''}>${mathHtml(token.expression, true)}</div>`)
      continue
    }
    run.push(token)
  }
  flush()

  if (parts.length > 0) return parts.join('')
  // Nothing but space between the marks: the words the block was given stay
  // on the page, even when every one of them was a newline.
  return `<p class="pp-paragraph"${id}>${escapeHtml(source)}</p>`
}

function blockHtml(block: ContentBlock, options: DocumentExportOptions, anchor: string | null): string {
  const id = anchor ? ` id="${escapeHtml(anchor)}"` : ''
  const notes = options.includePreservationNotes

  switch (block.kind) {
    case 'text':
      return inlineBodyHtml(block.text, id)
    case 'rich':
      return `<p class="pp-paragraph"${id}>${runsHtml(block.runs)}</p>`
    case 'markdown':
      // The inline marks are drawn; the block-level ones are not, because
      // this block holds source a reader may still want to copy.
      return inlineBodyHtml(block.source, id)
    case 'heading':
      return `<h${block.level} class="pp-heading"${id}>${inlineHtml(block.text)}</h${block.level}>`
    case 'list': {
      const items = block.items.map((item) => `<li>${inlineHtml(item)}</li>`).join('')
      const tag = block.ordered ? 'ol' : 'ul'
      return `<${tag} class="pp-list"${id}>${items}</${tag}>`
    }
    case 'blockquote':
      return `<blockquote class="pp-quote"${id}>${inlineHtml(block.text)}</blockquote>`
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
        .map((header) => `<th scope="col">${inlineHtml(header)}</th>`)
        .join('')
      const body = block.rows
        .map(
          (row) =>
            `<tr>${block.headers
              .map((_, index) => `<td>${inlineHtml(row[index] ?? '')}</td>`)
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

function turnHtml(view: DisplayTurn, options: DocumentExportOptions): string {
  const { message, content, turn } = view
  const who = options.includeRoleBadges
    ? `<span class="pp-speaker-badge pp-${message.role}">${escapeHtml(SPEAKER_LABEL[message.role])}</span>`
    : `<span class="pp-speaker-badge">Turn ${turn}</span>`
  const when = message.timestamp
    ? `<span class="pp-timestamp">${escapeHtml(new Date(message.timestamp).toLocaleString())}</span>`
    : ''
  const blocks = content
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
  const view = exportView(document, options)
  const parts: string[] = [`<h1 class="pp-sheet-title">${escapeHtml(document.title)}</h1>`]

  if (options.includeMetadata) {
    const rows = metadataRows(document, exportedAt, options)
      .map(
        (row) =>
          `<div class="pp-meta-row"><dt>${escapeHtml(row.label)}</dt><dd>${escapeHtml(row.value)}</dd></div>`,
      )
      .join('')
    parts.push(`<dl class="pp-metadata">${rows}</dl>`)
  }

  if (options.includeToc && options.tocStyle !== 'none') {
    const items = tocFor(document, options)
      .map(
        (entry) =>
          `<li class="pp-toc-${entry.level}"><a href="#${escapeHtml(entry.id)}">${escapeHtml(entry.label)}</a></li>`,
      )
      .join('')
    parts.push(`<nav class="pp-toc"><h2 class="pp-toc-head">Contents</h2><ol>${items}</ol></nav>`)
  }

  parts.push(view.turns.map((turn) => turnHtml(turn, options)).join(''))

  // Said out loud whenever the view is holding anything back, whatever else
  // the reader switched on or off: the page is not showing the whole record,
  // and it says where the rest of it is.
  if (tracesAreHidden(view)) {
    parts.push(`<p class="pp-traces-note">${escapeHtml(TRACES_HIDDEN_NOTE)}</p>`)
  }

  if (options.includePreservationNotes) {
    parts.push(`<p class="pp-preservation">${escapeHtml(preservationStatement(document, options))}</p>`)
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
