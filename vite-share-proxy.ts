import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Plugin } from 'vite'
import { fetchShareFromRequestBody, statusFor } from './api/shareFetchCore.ts'
import type { ShareFetchErrorCode, ShareFetchOutcome } from './api/shareFetchCore.ts'

/**
 * `/api/fetch-share` inside `vite dev` and `vite preview`.
 *
 * The share-link import needs a same-origin endpoint, and a developer
 * working on this project gets one without a separate server process or a
 * deploy. The rules themselves live in `api/shareFetchCore`, which the
 * serverless handler uses too, so what is tested here is what ships.
 *
 * The endpoint answers this project's own page and nobody else's: no
 * cross-origin headers are written, nothing is cached, and the request body
 * is capped at a size no share link needs.
 */

const ENDPOINT = '/api/fetch-share'

/** A URL is a few hundred characters. Anything longer is not one. */
const MAX_REQUEST_BYTES = 8_192

const JSON_HEADERS = {
  'Content-Type': 'application/json',
  'Cache-Control': 'no-store',
}

/** Read the posted body, or say it never should have been this long. */
async function readBody(req: IncomingMessage): Promise<string | null> {
  req.setEncoding('utf8')
  let text = ''
  for await (const chunk of req) {
    text += String(chunk)
    if (text.length > MAX_REQUEST_BYTES) return null
  }
  return text
}

function send(res: ServerResponse, outcome: ShareFetchOutcome, status?: number) {
  res.writeHead(status ?? statusFor(outcome), JSON_HEADERS)
  res.end(JSON.stringify(outcome))
}

const refused = (code: ShareFetchErrorCode, message: string): ShareFetchOutcome => ({
  ok: false,
  code,
  message,
})

async function handle(req: IncomingMessage, res: ServerResponse) {
  if (req.method !== 'POST') {
    send(
      res,
      refused(
        'invalid-url',
        'Share pages are read with a POST that carries the link. Nothing is fetched by GET.',
      ),
      405,
    )
    return
  }

  const raw = await readBody(req)
  if (raw === null) {
    send(
      res,
      { ok: false, code: 'too-large', message: 'The request was longer than a share link needs.' },
      413,
    )
    return
  }

  let body: unknown
  try {
    body = JSON.parse(raw)
  } catch {
    body = null
  }
  send(res, await fetchShareFromRequestBody(body))
}

/** Registered on both servers, because `vite preview` is where a built
 *  bundle is checked and it is not the same process as `vite dev`. */
export function shareFetchProxy(): Plugin {
  const middleware = (req: IncomingMessage, res: ServerResponse) => {
    void handle(req, res).catch((error: unknown) => {
      if (res.writableEnded) return
      send(
        res,
        refused(
          'unreachable',
          `The reader stopped unexpectedly${
            error instanceof Error ? `: ${error.message}` : '.'
          } Use Paste or Upload instead.`,
        ),
        500,
      )
    })
  }

  return {
    name: 'promptpaper:share-fetch-proxy',
    configureServer(server) {
      server.middlewares.use(ENDPOINT, middleware)
    },
    configurePreviewServer(server) {
      server.middlewares.use(ENDPOINT, middleware)
    },
  }
}
