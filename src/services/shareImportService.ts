import { classifyShareUrl } from '@/lib/parsers/shareUrlParser'
import type { ParsedConversationResult } from '@/types/import'
import type { ShareFetchOutcome } from '../../api/shareFetchCore'

/**
 * The one client call behind the Share Link tab.
 *
 * A share page cannot be read from this tab directly — the providers do not
 * allow cross-origin reads — so the link is handed to a small same-origin
 * endpoint and the answer is read back here. Two things are worth stating
 * about that division, and both are visible in this file.
 *
 * The address is classified in the browser first. A private chat URL, a
 * local network address or a site that is not one of the three supported
 * providers is answered with a sentence, and no request leaves this tab at
 * all. What does leave is the link alone: no cookie, no session, nothing
 * that identifies the person using it.
 *
 * The parsing happens after, in this tab, by the same deterministic readers
 * that handle an exported file. The endpoint exists to collect words the
 * browser is not allowed to collect; it does not read, order or judge them.
 */

/** Where a same-origin deployment keeps the reader. */
const RELAY_PATH = '/api/fetch-share'

export type ShareImportOutcome =
  | { ok: true; results: ParsedConversationResult[]; notes: string[]; source: string }
  | { ok: false; message: string; hint?: string }

const failed = (message: string, hint?: string): ShareImportOutcome =>
  hint ? { ok: false, message, hint } : { ok: false, message }

/** The site the words finally came from, which is what the review card
 *  names as the source of a conversation. */
const hostOf = (url: string) => {
  try {
    return new URL(url).host
  } catch {
    return url
  }
}

/** An environment override for a deployment that runs the reader somewhere
 *  else. A value that is not an address is reported rather than quietly
 *  ignored, because a silently ignored setting is how an import ends up
 *  asking the wrong machine. */
function relayTarget(): { url: string } | { message: string } {
  const configured = import.meta.env.VITE_SHARE_PROXY_URL?.trim()
  if (!configured) return { url: RELAY_PATH }
  try {
    return { url: new URL(configured, window.location.origin).toString() }
  } catch {
    return {
      message: `The share reader is set to “${configured}”, which is not an address, so nothing was asked of it. Set VITE_SHARE_PROXY_URL to a full https:// address, or leave it unset to use ${RELAY_PATH}.`,
    }
  }
}

/** Read the link at `link`, or say exactly why it could not be read. */
export async function importFromShareLink(
  link: string,
  signal: AbortSignal,
): Promise<ShareImportOutcome> {
  const verdict = classifyShareUrl(link)
  if (!verdict.ok) return failed(verdict.message, verdict.hint)

  const target = relayTarget()
  if ('message' in target) return failed(target.message)

  let response: Response
  try {
    response = await fetch(target.url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      // Only the link travels. No credentials, no cached answer, nothing
      // that could turn this into a request made as the person using it.
      credentials: 'omit',
      cache: 'no-store',
      body: JSON.stringify({ url: verdict.url }),
      signal,
    })
  } catch (error) {
    if (signal.aborted) {
      return failed('The read was stopped, so nothing was imported. The link can be tried again.')
    }
    return failed(
      `Nothing answered at ${target.url}, so the link could not be read${
        error instanceof Error ? ` (${error.message})` : ''
      }. Paste the thread or upload an export instead.`,
    )
  }

  let payload: ShareFetchOutcome
  try {
    payload = (await response.json()) as ShareFetchOutcome
  } catch {
    // A static deployment without the endpoint answers with a page, not an
    // outcome. Naming the missing endpoint is the only honest sentence here.
    return failed(
      response.status === 404
        ? `This site has no share reader at ${RELAY_PATH}. Reading a link needs that small server endpoint to be deployed; Paste and Upload need nothing but this browser.`
        : `The reader answered with status ${response.status} and not with a page it had read. Paste the thread or upload an export instead.`,
    )
  }

  if (!payload.ok) return failed(payload.message)

  // The readers are pulled in only when a page has actually come back to
  // read. They are the heaviest part of this feature, and a visitor who
  // never uses the Share Link tab should not carry them.
  const { extractShareConversation } = await import('@/lib/parsers/sharePageExtractor')
  const read = extractShareConversation({
    provider: payload.provider,
    contentType: payload.contentType,
    body: payload.body,
    finalUrl: payload.finalUrl,
  })
  if (!read.ok) return failed(read.reason)
  return {
    ok: true,
    results: read.results,
    notes: read.notes ?? [],
    source: hostOf(payload.finalUrl),
  }
}
