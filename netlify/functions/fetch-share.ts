/**
 * The Netlify entry point for `/api/fetch-share`.
 *
 * Netlify's modern Functions API wants one default handler that takes a Web
 * `Request` and returns a Web `Response`, so this file routes by method and
 * delegates. The relay itself — the allowlist, the hand-followed redirects,
 * the size and time caps, the wording of every refusal — is unchanged in
 * `api/fetch-share.ts` and `api/shareFetchCore.ts`, which `vite-share-proxy.ts`
 * already serves during `npm run dev` and `npm run preview`; a `.ts` specifier
 * is used so the bundler resolves the file literally rather than guessing an
 * extension. Deployed and local therefore run the same rules.
 *
 * `api/fetch-share.ts` keeps its `GET`/`POST` exports because the Vite
 * middleware and any host that dispatches by verb use them. Anything that is
 * neither verb lands on the `else` branch: Netlify hands every method to a
 * default handler, so the answer for `PUT`, `DELETE` or `OPTIONS` is written
 * here as the same JSON shape the rest of the relay uses, with `no-store` on
 * it because a function response never inherits the header rules in
 * `netlify.toml`.
 */

import { GET, POST } from '../../api/fetch-share.ts'

export default async function handler(req: Request): Promise<Response> {
  if (req.method === 'POST') return POST(req)
  if (req.method === 'GET') return GET()
  return new Response(
    JSON.stringify({
      ok: false,
      code: 'method-not-allowed',
      message: 'Only POST requests are supported on /api/fetch-share.',
    }),
    {
      status: 405,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-store',
      },
    },
  )
}
