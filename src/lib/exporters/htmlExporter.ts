import sheetCss from '@/styles/export.css?raw'
import { escapeHtml, sheetDataAttributes, sheetHtml } from '@/lib/exporters/htmlMarkup'
import { PAGE_AT_RULE, type BlobExporter } from '@/types/export'

/**
 * A single HTML file that opens with no network at all.
 *
 * The stylesheet is the same text the preview is styled by, embedded
 * rather than linked, and the maths is already typeset — KaTeX ran while
 * the file was made. So the reader can mail it, put it on a USB stick or
 * open it in ten years and still see the document, which is the whole
 * reason a conversation is worth exporting.
 */

/** Only what the file itself needs on top of the sheet's own rules: the
 *  page around the page, and the printing of it. */
const SHELL_CSS = `
html { background: #eef2f7; }
body { margin: 0; padding: 24px 12px 48px; }
.pp-file-sheet { margin: 0 auto; }
@media print {
  html, body { background: #fff; padding: 0; }
  .pp-file-sheet { box-shadow: none; margin: 0; width: auto; min-height: 0; }
}
`

const htmlExporter: BlobExporter = async (document, options) => {
  // The base64 faces are carried only by the file that needs them, so no
  // other export, and no page load, pays for them.
  const { standaloneKatexCss } = await import('@/lib/exporters/katexStandalone')
  const exportedAt = new Date()

  const html = [
    '<!doctype html>',
    '<html lang="en">',
    '<head>',
    '<meta charset="utf-8" />',
    '<meta name="viewport" content="width=device-width, initial-scale=1" />',
    `<title>${escapeHtml(document.title)}</title>`,
    '<style>',
    sheetCss.trim(),
    '</style>',
    '<style>',
    standaloneKatexCss(),
    '</style>',
    '<style>',
    SHELL_CSS,
    PAGE_AT_RULE[options.pageSize],
    '</style>',
    '</head>',
    '<body>',
    `<main class="pp-document-sheet pp-file-sheet" ${sheetDataAttributes(options)}>`,
    sheetHtml(document, options, exportedAt),
    '</main>',
    '</body>',
    '</html>',
  ].join('\n')

  return new Blob([html], { type: 'text/html;charset=utf-8' })
}

export { htmlExporter }
