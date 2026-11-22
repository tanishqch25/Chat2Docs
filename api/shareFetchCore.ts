import { classifyShareUrl } from '../src/lib/parsers/shareUrlParser.ts'
import type { ShareUrlVerdict } from '../src/lib/parsers/shareUrlParser.ts'

/**
 * The fetch behind `/api/fetch-share`, written so it runs unchanged in a
 * Vite dev server, a preview server and a serverless function.
 *
 * A browser cannot read a ChatGPT, Gemini or Claude share page itself: those
 * sites do not offer cross-origin reads, so the words have to be collected
 * on the user's behalf by a small piece of server code. That code is the one
 * place in the product that reaches outside the device, which is why the
 * rules live here rather than in the endpoints around it:
 *
 * - only an address the shared allowlist accepts is fetched, and every
 *   redirect hop is re-accepted before it is followed, so a short link that
 *   hands the request to a sign-in page or an internal host stops instead;
 * - redirects are followed by hand, never by the fetch implementation, so no
 *   hop can escape the rules above;
 * - no cookie, credential or forwarded header of any kind is sent, because a
 *   public share page needs none of them and a private chat must not be read;
 * - the answer is capped in size and in time, and a page too large to be
 *   sure about is refused rather than trimmed, because an import that
 *   quietly loses the last messages is the failure this product promises not
 *   to have.
 *
 * `fetchImpl` is a seam for tests and for a host whose fetch behaves
 * differently; the shipped path is the platform's own `fetch`.
 */

/** Read for at most this long before giving up on the answer. */
const TIMEOUT_MS = 15_000

/** A shared conversation is a page of words with a payload inside it.
 *  Anything larger than this is not one. */
const MAX_BYTES = 4_000_000

/** Enough for a short link, its redirect, and the page it lands on. */
const MAX_REDIRECTS = 5

const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'

/** The provider a link that passed the allowlist names itself as. */
type ShareProvider = Extract<ShareUrlVerdict, { ok: true }>['provider']

export interface ShareHttpResponse {
  status: number
  contentType: string
  /** Declared length in bytes, when the answer says how long it is. */
  contentLength: number | null
  /** Already resolved against the address that was asked for. */
  location: string | null
  text: () => Promise<string>
}

export type ShareFetchImpl = (
  url: string,
  init: { headers: Record<string, string>; signal: AbortSignal },
) => Promise<ShareHttpResponse>

export type ShareFetchErrorCode =
  | 'invalid-url'
  | 'expired-or-deleted'
  | 'bot-blocked'
  | 'login-required'
  | 'redirect-unfollowable'
  | 'timeout'
  | 'network'
  | 'too-large'
  | 'unexpected-content'
  | 'unreachable'

export type ShareFetchOutcome =
  | {
      ok: true
      provider: ShareProvider
      finalUrl: string
      contentType: string
      body: string
    }
  | { ok: false; code: ShareFetchErrorCode; message: string }

const failure = (code: ShareFetchErrorCode, message: string): ShareFetchOutcome => ({
  ok: false,
  code,
  message,
})

const REQUEST_HEADERS: Record<string, string> = {
  'User-Agent': USER_AGENT,
  Accept: 'text/html,application/json;q=0.9,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
}

const hostOf = (url: string) => {
  try {
    return new URL(url).host
  } catch {
    return url
  }
}

const isRedirect = (status: number) => status >= 300 && status < 400

const isReadablePage = (contentType: string) =>
  contentType === '' ||
  contentType.includes('text/html') ||
  contentType.includes('application/json') ||
  contentType.includes('text/plain')

/** The platform's own fetch, reduced to the few things the loop below
 *  needs. `redirect: 'manual'` is the point of the whole call: leaving it to
 *  the implementation would follow hops this file never saw. */
const platformFetch: ShareFetchImpl = async (url, init) => {
  const response = await fetch(url, {
    ...init,
    redirect: 'manual',
    credentials: 'omit',
    cache: 'no-store',
    referrerPolicy: 'no-referrer',
  })
  const location = response.headers.get('location')
  const declared = response.headers.get('content-length')
  return {
    status: response.status,
    contentType: response.headers.get('content-type') ?? '',
    contentLength: declared === null ? null : Number(declared),
    location: location ? new URL(location, url).toString() : null,
    text: () => response.text(),
  }
}

const statusForCode: Record<ShareFetchErrorCode, number> = {
  'invalid-url': 400,
  'expired-or-deleted': 404,
  'bot-blocked': 403,
  'login-required': 401,
  'redirect-unfollowable': 502,
  timeout: 504,
  network: 502,
  'too-large': 413,
  'unexpected-content': 415,
  unreachable: 502,
}

/**
 * Fetch for the endpoint that was handed a request body.
 *
 * Both handlers — the Vite middleware and the serverless function — parse
 * `{ url: … }` the same way, so that part lives here as well. A body that
 * does not name a link is answered with the shape the endpoint returns,
 * because an empty 200 would look to the browser like a page that read
 * nothing.
 */
export async function fetchShareFromRequestBody(
  body: unknown,
  options: { fetchImpl?: ShareFetchImpl; timeoutMs?: number; maxBytes?: number } = {},
): Promise<ShareFetchOutcome> {
  const url =
    typeof body === 'object' && body !== null && 'url' in body
      ? (body as { url: unknown }).url
      : undefined
  if (typeof url !== 'string' || !url.trim()) {
    return failure(
      'invalid-url',
      'The request needs a body shaped like { "url": "https://…" }, and none was given.',
    )
  }
  return fetchSharePage(url, options)
}

/** The HTTP status that matches an outcome, so a failing read is not
 *  reported as a successful one to whatever watches the server. */
export function statusFor(outcome: ShareFetchOutcome): number {
  return outcome.ok ? 200 : statusForCode[outcome.code]
}

/**
 * Fetch one public share page and hand back its words.
 *
 * The address is classified before anything is asked of it, and the answer
 * is classified by status: an expired link, a bot challenge and a page that
 * turns out to want a sign-in are three different dead ends, and each needs
 * its own sentence so the next move is obvious.
 */
export async function fetchSharePage(
  input: string,
  options: { fetchImpl?: ShareFetchImpl; timeoutMs?: number; maxBytes?: number } = {},
): Promise<ShareFetchOutcome> {
  const fetchImpl = options.fetchImpl ?? platformFetch
  const timeoutMs = options.timeoutMs ?? TIMEOUT_MS
  const maxBytes = options.maxBytes ?? MAX_BYTES

  const accepted = classifyShareUrl(input)
  if (!accepted.ok) return failure('invalid-url', accepted.message)

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  const tooLarge = failure(
    'too-large',
    'This page is larger than the reader will take in, and part of a conversation would not be an honest import. Use Paste or Upload instead.',
  )

  try {
    let current = accepted
    for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
      let response: ShareHttpResponse
      try {
        response = await fetchImpl(current.url, {
          headers: REQUEST_HEADERS,
          signal: controller.signal,
        })
      } catch (error) {
        if (controller.signal.aborted) {
          return failure(
            'timeout',
            `No share page answered within ${Math.round(timeoutMs / 1000)} seconds. The link may be slow, or the site may be blocking this reader. Try the link again, or use Paste or Upload.`,
          )
        }
        return failure(
          'network',
          `The address could not be reached: ${
            error instanceof Error ? error.message : 'the connection failed'
          }. Check the link, or use Paste or Upload.`,
        )
      }

      if (isRedirect(response.status)) {
        if (!response.location) {
          return failure(
            'redirect-unfollowable',
            'The share page answered with a redirect that named no address, so there is nothing further to read.',
          )
        }
        const next = classifyShareUrl(response.location)
        if (!next.ok) {
          return failure(
            'login-required',
            `This link hands the request on to ${hostOf(response.location)}, and that address is not fetched: ${next.message} The chat may no longer be shared publicly.`,
          )
        }
        current = next
        continue
      }

      if (response.status === 404 || response.status === 410) {
        return failure(
          'expired-or-deleted',
          'This share link has no page behind it any more. Links stop working when the owner deletes the chat or turns the share off.',
        )
      }
      if (response.status === 403 || response.status === 429) {
        return failure(
          'bot-blocked',
          `The site refused this reader with status ${response.status}. Providers change these pages and turn away automated access, so the words cannot be collected here — Paste or Upload will still work.`,
        )
      }
      if (response.status === 401) {
        return failure(
          'login-required',
          'The page behind this link asks for a sign-in, so it is not a public share page. Open the chat, create a public link, and paste that address.',
        )
      }
      if (response.status < 200 || response.status >= 300) {
        return failure(
          'unreachable',
          `The share page answered with status ${response.status}, so there is nothing to read. Use Paste or Upload instead.`,
        )
      }

      if (response.contentLength !== null && response.contentLength > maxBytes) return tooLarge
      if (!isReadablePage(response.contentType)) {
        return failure(
          'unexpected-content',
          `The address returned ${
            response.contentType || 'a kind of file the reader does not know'
          } rather than a page of words. Use Paste or Upload instead.`,
        )
      }

      const body = await response.text()
      if (body.length > maxBytes) return tooLarge
      if (!body.trim()) {
        return failure(
          'unexpected-content',
          'The share page answered with an empty body, so there are no words to read. Use Paste or Upload instead.',
        )
      }

      return {
        ok: true,
        provider: current.provider,
        finalUrl: current.url,
        contentType: response.contentType,
        body,
      }
    }

    return failure(
      'redirect-unfollowable',
      `This link changed addresses more than ${MAX_REDIRECTS} times, so following it stopped before a page was reached.`,
    )
  } finally {
    clearTimeout(timer)
  }
}
