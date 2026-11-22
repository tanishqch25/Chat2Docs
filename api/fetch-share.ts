import { fetchShareFromRequestBody, statusFor } from './shareFetchCore.ts'
import type { ShareFetchOutcome } from './shareFetchCore.ts'

/**
 * The `/api/fetch-share` endpoint for a host that runs server functions.
 *
 * It is the thin half of the relay: it turns a Web Request into a Web
 * Response and nothing else. Every rule — which addresses may be read, how
 * long the wait is, what a refusal says — lives in `shareFetchCore`, which
 * the Vite dev and preview servers use unchanged, so the deployed endpoint
 * and the one a developer tests against cannot drift apart.
 *
 * No cross-origin headers are sent. This endpoint exists for PromptPaper's
 * own page, and leaving it open to any site on the internet would turn a
 * helpful reader into a proxy other people can point at addresses.
 */

const JSON_HEADERS = {
  'Content-Type': 'application/json',
  'Cache-Control': 'no-store',
}

const asJson = (outcome: ShareFetchOutcome, status?: number) =>
  new Response(JSON.stringify(outcome), {
    status: status ?? statusFor(outcome),
    headers: JSON_HEADERS,
  })

const notARead = (message: string): ShareFetchOutcome => ({
  ok: false,
  code: 'invalid-url',
  message,
})

/** `POST { "url": "https://chatgpt.com/share/…" }` — the only shape
 *  accepted, because a link in a query string would end up in server logs. */
export async function POST(request: Request): Promise<Response> {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return asJson(notARead('The request body was not JSON with a url in it.'))
  }

  try {
    return asJson(await fetchShareFromRequestBody(body))
  } catch (error) {
    // Should not happen: the core catches its own failures. Said plainly
    // rather than dressed up as a share page that read nothing.
    return asJson({
      ok: false,
      code: 'unreachable',
      message: `The reader stopped unexpectedly${
        error instanceof Error ? `: ${error.message}` : '.'
      } Use Paste or Upload instead.`,
    })
  }
}

export function GET(): Response {
  return asJson(
    notARead('Share pages are read with a POST that carries the link. Nothing is fetched by GET.'),
    405,
  )
}

export default POST
