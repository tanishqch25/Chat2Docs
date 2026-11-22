import type { DocumentProvider } from '@/types/document'

/**
 * The one place a public share link is judged.
 *
 * The browser, the dev/preview relay and the serverless handler all import
 * this file, so the set of addresses that may be fetched is decided once
 * instead of three times. That matters because the same list is both a
 * product rule and a security rule: only a link its owner made public is
 * read, and an endpoint that fetches whatever it is handed can be pointed at
 * a router, a cloud metadata address or a coworker's laptop.
 *
 * Nothing here reaches the network. The whole file is strings and `URL`
 * parsing, which is what lets a private chat address be answered with an
 * explanation before a request exists.
 */

/** The addresses read as public share pages, and the path each one uses. */
const SHARE_HOSTS: { host: string; provider: DocumentProvider; prefix: string }[] = [
  { host: 'chatgpt.com', provider: 'chatgpt', prefix: '/share/' },
  { host: 'chat.openai.com', provider: 'chatgpt', prefix: '/share/' },
  { host: 'gemini.google.com', provider: 'gemini', prefix: '/share/' },
  { host: 'g.co', provider: 'gemini', prefix: '/gemini/share/' },
  { host: 'claude.ai', provider: 'claude', prefix: '/share/' },
]

/** Paths on a supported site that open a chat inside an account rather than
 *  a page the owner shared. */
const PRIVATE_CHAT_PATHS: Record<string, string[]> = {
  'chatgpt.com': ['/c/', '/chat/'],
  'chat.openai.com': ['/c/', '/chat/'],
  'gemini.google.com': ['/app/', '/chat/'],
  'claude.ai': ['/chat/', '/new'],
}

export const PRIVATE_CHAT_HINT =
  'This looks like a private chat URL. Open the chat, click Share → Create public link, and paste the /share/... URL here.'

/** Why a pasted address cannot be fetched. Kept as codes so the relay and
 *  the panel can describe the same refusal in the same words. */
export type ShareUrlRejectionCode =
  | 'empty'
  | 'not-a-url'
  | 'not-https'
  | 'credentials'
  | 'private-address'
  | 'unsupported-host'
  | 'not-a-share-link'
  | 'private-chat'

export type ShareUrlVerdict =
  | { ok: true; provider: DocumentProvider; url: string; host: string; shareId: string }
  | { ok: false; code: ShareUrlRejectionCode; message: string; hint?: string }

const rejected = (
  code: ShareUrlRejectionCode,
  message: string,
  hint?: string,
): ShareUrlVerdict => (hint ? { ok: false, code, message, hint } : { ok: false, code, message })

const shorten = (value: string, max = 80) =>
  value.length > max ? `${value.slice(0, max - 1)}…` : value

/** `new URL` lowercases and punycodes the host, and drops a trailing dot for
 *  some inputs but not all, so the comparison normalises it here. */
const cleanHost = (hostname: string) => hostname.replace(/\.$/, '').toLowerCase()

const isIPv4 = (host: string) => /^\d{1,3}(\.\d{1,3}){3}$/.test(host)

const isIPv6 = (host: string) => host.startsWith('[') && host.endsWith(']')

/** Octets that never name a public site: loopback, link-local, private,
 *  carrier-grade NAT, documentation ranges and anything multicast. */
function isPrivateIPv4(host: string) {
  const parts = host.split('.').map(Number)
  if (parts.some((part) => !Number.isFinite(part) || part > 255)) return true
  const [a, b] = parts
  if (a === undefined) return true
  if (a === 0 || a === 10 || a === 127) return true
  if (a === 100 && b !== undefined && b >= 64 && b <= 127) return true
  if (a === 169 && b === 254) return true
  if (a === 172 && b !== undefined && b >= 16 && b <= 31) return true
  if (a === 192 && b === 0) return true
  if (a === 192 && b === 168) return true
  if (a === 198 && b !== undefined && b >= 18 && b <= 19) return true
  if (a === 198 && b === 51) return true
  if (a === 203 && b === 0) return true
  return a >= 224
}

/** Loopback, unspecified, unique-local and link-local in the shapes a URL
 *  actually carries, including an IPv4 tucked inside an IPv6 literal. */
function isPrivateIPv6(literal: string) {
  const host = literal.slice(1, -1).toLowerCase()
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(host)?.[1]
  if (mapped) return isPrivateIPv4(mapped)
  if (host === '::1' || host === '::' || host === '') return true
  const first = Number.parseInt(host.split(':')[0] ?? '0', 16)
  if (!Number.isFinite(first)) return true
  if ((first & 0xfe00) === 0xfc00) return true
  if ((first & 0xffc0) === 0xfe80) return true
  return false
}

/** Names that resolve inside a network instead of on the public internet. */
function isPrivateName(host: string) {
  if (host === 'localhost') return true
  if (host.endsWith('.localhost') || host.endsWith('.local')) return true
  if (host.endsWith('.internal') || host.endsWith('.home.arpa')) return true
  return !host.includes('.')
}

function isPrivateAddress(host: string) {
  if (isIPv4(host)) return isPrivateIPv4(host)
  if (isIPv6(host)) return isPrivateIPv6(host)
  return isPrivateName(host)
}

/**
 * Say whether an address may be fetched, and why not if it may not.
 *
 * The order is the order a person needs the reasons in: a paste that is not
 * an address at all is answered before an address on the wrong site, and a
 * supported site is checked for a share path before its domain is accepted.
 * A private-chat path is reported as a hint rather than a dead end, because
 * the conversation usually can be imported — it needs the other button.
 */
export function classifyShareUrl(input: string): ShareUrlVerdict {
  const raw = input.trim()
  if (!raw) {
    return rejected('empty', 'Paste the public share link of a ChatGPT, Gemini or Claude chat.')
  }

  // A bare `chatgpt.com/share/…` loses its scheme when copied from some
  // dialogs, so the missing one is added before the address is judged.
  const hasScheme = /^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(raw)
  let url: URL
  try {
    url = new URL(hasScheme ? raw : `https://${raw}`)
  } catch {
    return rejected(
      'not-a-url',
      `“${shorten(raw)}” is not a web address. Paste the full link from the share dialog.`,
    )
  }

  if (hasScheme && url.protocol !== 'https:') {
    return rejected(
      'not-https',
      `This address uses ${url.protocol.replace(':', '').toUpperCase()}, and PromptPaper reads share pages over HTTPS only. Paste the HTTPS version of the link.`,
    )
  }
  if (url.username || url.password) {
    return rejected(
      'credentials',
      'A share link never carries a username or password in its address, so this one is not fetched.',
    )
  }

  const host = cleanHost(url.hostname)
  if (isPrivateAddress(host)) {
    return rejected(
      'private-address',
      'This address names a machine on a local or private network rather than a public share page, so nothing is fetched from it.',
    )
  }

  const entry = SHARE_HOSTS.find((each) => each.host === host)
  if (!entry) {
    return rejected(
      'unsupported-host',
      `PromptPaper reads public share links from ChatGPT (chatgpt.com), Gemini (gemini.google.com) and Claude (claude.ai). ${host} is not one of them, so nothing is fetched.`,
    )
  }

  if ((PRIVATE_CHAT_PATHS[host] ?? []).some((path) => url.pathname.startsWith(path))) {
    return rejected(
      'private-chat',
      'This address opens a chat inside an account, which only a signed-in browser can read. PromptPaper never asks for a sign-in.',
      PRIVATE_CHAT_HINT,
    )
  }
  if (!url.pathname.startsWith(entry.prefix)) {
    return rejected(
      'not-a-share-link',
      `${host} is a supported site, but this is not a share link. The address needs to be ${host}${entry.prefix} followed by the link’s code, so nothing is fetched.`,
    )
  }

  const shareId = decodeURIComponent(url.pathname.slice(entry.prefix.length))
  if (!shareId) {
    return rejected(
      'not-a-share-link',
      `This address ends at ${entry.prefix} and has no link code after it, so there is nothing to read.`,
    )
  }

  return { ok: true, provider: entry.provider, url: url.toString(), host, shareId }
}

/** The provider badge for a link that is already complete and allowed.
 *  Returns null while the paste is still an ordinary address, so nothing in
 *  the interface claims a conversation has been found. */
export function providerOfShareUrl(input: string): DocumentProvider | null {
  const verdict = classifyShareUrl(input)
  return verdict.ok ? verdict.provider : null
}
