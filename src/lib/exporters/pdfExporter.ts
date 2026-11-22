import { PAGE_AT_RULE, type DocumentExportOptions } from '@/types/export'

/**
 * Print-to-PDF: the browser's own text renderer, at the size chosen.
 *
 * There is no screenshot in this path and there never will be. A canvas
 * grab of the preview would be a picture of words — soft at the edges,
 * unsearchable, unable to be quoted, and with every code block sliced in
 * half wherever the page happened to fall. `window.print()` hands the same
 * markup to the browser's line breaker, so a formula stays one formula, a
 * table stays a table, and a paragraph of code can be selected after the
 * fact. The cost of the honest version is one dialog, which the download
 * panel tells the reader to expect.
 *
 * Only the `@page` rule is written here, because it is the one thing that
 * depends on a size chosen after the page loaded. Everything else about
 * printing — the chrome that goes away, the sheet that stays, where a page
 * may break — lives in `styles/export.css`, which the standalone .html
 * export carries with it, so both print the same way from one definition.
 */

/** The injected rule is removed on `afterprint`, and named so it can be
 *  found again even if the print dialog never reports back. */
export const PRINT_STYLE_ID = 'pp-print-page-rule'

function injectedCss(options: DocumentExportOptions): string {
  return [
    PAGE_AT_RULE[options.pageSize],
    // The sheet is drawn to fit the pane on screen. On paper it is the
    // page, so the scale goes and the page's own margins take over.
    '@media print { .pp-document-sheet { zoom: 1 !important; } }',
  ].join('\n')
}

/**
 * Open the print dialog for the sheet that is on screen.
 *
 * Returns when the dialog closes. The style is taken out on `afterprint`,
 * and again when printing comes back, because a browser that is interrupted
 * — a cancelled dialog, a dialog that never fires the event — should not
 * leave a page-size rule sitting in the document.
 */
export function printDocument(options: DocumentExportOptions): void {
  const existing = document.getElementById(PRINT_STYLE_ID)
  if (existing) existing.remove()

  const style = document.createElement('style')
  style.id = PRINT_STYLE_ID
  style.textContent = injectedCss(options)
  document.head.appendChild(style)

  const remove = () => {
    style.remove()
    window.removeEventListener('afterprint', remove)
  }
  window.addEventListener('afterprint', remove)

  window.print()

  // Chrome and Firefox return here once the dialog is gone; Safari has
  // been known not to, which is what the listener above is for.
  window.setTimeout(remove, 0)
}
