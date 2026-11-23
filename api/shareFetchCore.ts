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

/**
 * The headers a top-level navigation carries.
 *
 * These are the words a browser uses when a person opens a link, and a
 * provider's page decides what to hand back partly by them: a request that
 * names no language, claims to want any type of document and says nothing
 * about where it came from reads to a bot filter like a scraper, so the
 * share page comes back as a challenge instead of a conversation. Nothing
 * private is imitated here — no cookie, no token, no identity — and the
 * address still has to pass the allowlist before any of it is sent.
 */
const NAVIGATION_HEADERS: Record<string, string> = {
  'User-Agent': USER_AGENT,
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
  'Sec-Fetch-Dest': 'document',
  'Sec-Fetch-Mode': 'navigate',
  'Sec-Fetch-Site': 'none',
  'Upgrade-Insecure-Requests': '1',
}

/** The same navigation, asking for a route's data instead of its page. */
const SINGLE_FETCH_HEADERS: Record<string, string> = {
  ...NAVIGATION_HEADERS,
  Accept: 'text/x-script, application/json, */*',
}

/** The provider a link that passed the allowlist names itself as. */
type ShareProvider = Extract<ShareUrlVerdict, { ok: true }>['provider']

export interface ShareHttpResponse {
  status: number
  contentType: string
  /** Declared length in bytes, when the answer says how long it is. */
  contentLength: number | null
  /** Already resolved against the address that was asked for. */
  location: string | null
  /** One response header, lower-cased by the caller as the platform does. */
  header: (name: string) => string | null
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
  contentType.includes('text/plain') ||
  // A route's own data, which React Router hands back as `text/x-script`.
  contentType.includes('text/x-script')

/** What a CDN puts in front of a reader it does not believe is a person.
 *  The words are the challenge page's own, so they are matched in the body
 *  rather than trusted from a status code that a provider also uses for an
 *  ordinary page. */
const CHALLENGE_MARKERS = [
  'just a moment',
  'enable javascript and cookies to continue',
  '__cf_chl_',
  'checking your browser',
  'attention required!',
  'verifying you are human',
]

/** A response that is a bot check rather than the page asked for. */
function challengedByBotFilter(response: ShareHttpResponse, body: string): boolean {
  const mitigated = response.header('cf-mitigated')
  if (mitigated && mitigated.toLowerCase() !== 'none') return true
  if (response.header('x-verdict')?.toLowerCase() === 'challenge') return true
  const words = body.slice(0, 20_000).toLowerCase()
  return CHALLENGE_MARKERS.some((marker) => words.includes(marker))
}

const BOT_BLOCKED_MESSAGE =
  'The site answered this link with a check that a person is asking rather than a reader, so no conversation came back. Providers do this to automated access, and PromptPaper does not work around it. Paste the thread or upload an export of the chat instead.'

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
    header: (name) => response.headers.get(name),
    text: () => response.text(),
  }
}

/** The `.data` address of a route, which is where React Router keeps the
 *  data a page would otherwise fill in after its scripts run. The suffix
 *  belongs on the path, not after the query a share link may carry. */
function singleFetchUrl(url: string): string | null {
  try {
    const parsed = new URL(url)
    parsed.search = ''
    parsed.hash = ''
    parsed.pathname = `${parsed.pathname}.data`
    return parsed.toString()
  } catch {
    return null
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
 * The address is classified before anything is asked of it, and the answer is
 * classified by status: an expired link, a bot challenge and a page that turns
 * out to want a sign-in are three different dead ends, and each needs its own
 * sentence so the next move is obvious.
 *
 * A ChatGPT link is read as two addresses, in order of how exactly each one
 * describes the thread. `<share>.data` is the route's own data — the
 * conversation object, with the branch the reader was on named — and it is a
 * sixth of the size of the page. The page is read when that data route is not
 * there, because an older or a changed deployment may serve only the markup
 * and the scripts around it. Both addresses go through the same allowlist and
 * the same caps, and the same 15-second budget covers the pair: a link that
 * spends it is reported as a timeout, not as two half-read pages.
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
  const budget = { fetchImpl, maxBytes, controller, timeoutMs }

  try {
    if (accepted.provider === 'chatgpt') {
      const dataUrl = singleFetchUrl(accepted.url)
      const dataRoute = dataUrl ? classifyShareUrl(dataUrl) : null
      if (dataRoute?.ok) {
        const viaData = await readAllowedRoute(dataRoute, budget, 'data')
        // Anything the reader can walk is worth handing back: the data route
        // is the provider's own description of the conversation. Every
        // refusal is silent here because the page may still answer.
        if (viaData.ok) return viaData
      }
    }
    return await readAllowedRoute(accepted, budget)
  } finally {
    clearTimeout(timer)
  }
}

/** The caps and the clock shared by every address one read asks of. */
interface ReadBudget {
  fetchImpl: ShareFetchImpl
  maxBytes: number
  controller: AbortController
  timeoutMs: number
}

/**
 * Follow one allowlisted address to its words, re-accepting every hop.
 *
 * `navigation` decides only which `Accept` the request carries: a page asks
 * for a document, a route's data asks for the stream the router writes.
 */
async function readAllowedRoute(
  start: Extract<ShareUrlVerdict, { ok: true }>,
  budget: ReadBudget,
  navigation: 'document' | 'data' = 'document',
): Promise<ShareFetchOutcome> {
  const { fetchImpl, maxBytes, controller, timeoutMs } = budget
  const headers = navigation === 'data' ? SINGLE_FETCH_HEADERS : NAVIGATION_HEADERS
  const tooLarge = failure(
    'too-large',
    'This page is larger than the reader will take in, and part of a conversation would not be an honest import. Use Paste or Upload instead.',
  )

  let current = start
  for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
    let response: ShareHttpResponse
    try {
      response = await fetchImpl(current.url, { headers, signal: controller.signal })
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
      return failure('bot-blocked', BOT_BLOCKED_MESSAGE)
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
    // Status 200 and a challenge: the only honest answer is that the site
    // refused a reader, and the page's own words would otherwise be read as
    // a conversation of two lines.
    if (challengedByBotFilter(response, body)) return failure('bot-blocked', BOT_BLOCKED_MESSAGE)

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
}
