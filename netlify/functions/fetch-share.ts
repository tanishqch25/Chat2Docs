/**
 * The Netlify entry point for `/api/fetch-share`.
 *
 * It is a shim and nothing more: the relay itself — the allowlist, the
 * hand-driven redirect loop, the size and time caps, the wording of every
 * refusal — lives in `api/fetch-share.ts` and `api/shareFetchCore.ts`, which
 * `vite-share-proxy.ts` already serves during `npm run dev` and `npm run
 * preview`. Re-exporting those handlers instead of wrapping them is what keeps
 * a working local endpoint and a deployed one from drifting apart.
 *
 * Netlify Functions v2 calls a module by its named exports, so `POST` and
 * `GET` are what this file publishes; the address it answers is
 * `/.netlify/functions/fetch-share`, which `netlify.toml` maps to the public
 * `/api/fetch-share`. A `default` export is deliberately not re-exported,
 * because a default handler is the legacy signature and would change the
 * arguments Netlify passes in.
 */

export { GET, POST } from '../../api/fetch-share'
