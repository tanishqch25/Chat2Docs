/**
 * The two things every downloaded file needs: a name the filesystem will
 * accept, and the act of handing the bytes over.
 *
 * Kept in one place because a filename that reaches the disk with a slash
 * in it, or a download that never fires because the object URL was revoked
 * too early, is a bug in every format at once.
 */

/** `Backprop guide (final!)` → `backprop-guide-final`. Letters, digits and
 *  spaces survive; everything else becomes a separator, because a title is
 *  whatever the reader typed and the export has to cope with it. */
export function sanitizeFilename(value: string): string {
  const cleaned = value
    .normalize('NFKD')
    .replace(/[^\p{L}\p{N}. _-]+/gu, ' ')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^[-.]+|[-.]+$/g, '')

  // A document titled "???" still has to download as something.
  const base = cleaned.slice(0, 80).replace(/-$/, '')
  return base.length > 0 ? base : 'promptpaper-document'
}

/** The file name for one export: title, then the format's own extension. */
export function downloadName(title: string, extension: string): string {
  return `${sanitizeFilename(title)}.${extension}`
}

/**
 * Offer the bytes as a download.
 *
 * The anchor is added to the document, clicked and then removed: Safari in
 * particular ignores a programmatic click on an anchor that is not in the
 * page. Revocation waits for the next task rather than the current one, so
 * the browser has already taken the blob before the URL disappears.
 */
export function triggerBlobDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.rel = 'noopener'
  anchor.style.display = 'none'
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}
