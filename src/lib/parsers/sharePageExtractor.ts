import { extractBlocks } from './blockExtractor'
import { buildResult, notParsed, titleFrom } from './envelope'
import { chatgptConversations } from './chatgptParser'
import { claudeConversations } from './claudeParser'
import { geminiConversations } from './geminiParser'
import { isRecord, shorten } from './json'
import { newId } from '@/services/documentService'
import type { ContentBlock, TableBlock } from '@/types/conversation'
import type { DocumentProvider, MessageRole, NormalizedMessage } from '@/types/document'
import type { ParseResult } from './envelope'

/**
 * The words on a public share page, read without a browser.
 *
 * A shared conversation arrives as an HTML page whose text was assembled by
 * client-side scripts, so the same thread can be found twice over: once in
 * the data the page hands to those scripts, and once in the markup a person
 * ends up looking at. This file reads both, in that order, and stops at the
 * first one that actually holds a conversation.
 *
 * Nothing here asks a model to work out what the page means. The data path
 * offers the payload to the same deterministic parsers that read a provider's
 * own export file — a share page carries one conversation where an export
 * carries a thousand, which is the only difference — and the markup path
 * walks elements into blocks by what those elements are. Where neither works,
 * it says so: an empty shell, an anti-bot challenge or a restructured thread
 * produces an explanation, never a document with pieces quietly missing.
 */

export interface SharePage {
  /** The site the address named, which decides which payload is tried first. */
  provider: DocumentProvider
  contentType: string
  body: string
  finalUrl: string
}

const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? '' : 's'}`

/** The three readers, keyed by the site a share link belongs to. */
const PROVIDER_READERS: Partial<Record<DocumentProvider, (parsed: unknown) => ParseResult>> = {
  chatgpt: chatgptConversations,
  claude: claudeConversations,
  gemini: geminiConversations,
}

/** A page is a few megabytes of scripts. A search that outlives the page has
 *  lost the plot, and a conversation worth importing carries one payload. */
const MAX_PAYLOADS = 40

/** How far the search inside one payload goes. */
const MAX_NODES = 120

/** A quoted run this short is a word, not a payload. Escaping a thread into
 *  a string costs roughly its own length in backslashes, so a conversation
 *  is never this small — but the labels and class names scattered through a
 *  page's scripts always are. */
const MIN_QUOTED_PAYLOAD = 120

const USER_LABELS = /^(you|your prompt|user|human|prompt|my prompt|question)$/i
const ASSISTANT_LABELS =
  /^(chatgpt|gpt|claude|gemini|bard|assistant|ai|model|response|answer|copilot)$/i

const WIDGET_ELEMENTS = new Set(['IFRAME', 'CANVAS', 'VIDEO', 'AUDIO', 'EMBED', 'OBJECT', 'FORM'])

const ROLE_ATTRIBUTES = ['data-message-author-role', 'data-role', 'data-author-role']

const BOT_CHALLENGE =
  /(just a moment|checking your browser|verify you are (a )?human|are you a robot|unusual traffic|captcha|enable javascript and cookies)/i

/* ------------------------------------------------------------------ *
 * payloads hidden inside the page's scripts
 * ------------------------------------------------------------------ */

/**
 * The span of a JSON object or array that starts at `from`.
 *
 * Written by hand rather than left to a regular expression because braces
 * nest and a string can hold a brace: the scanner tracks depth outside
 * strings and stops the moment a value is complete. A span it cannot close is
 * reported as no value at all, which is the honest answer for a truncated or
 * non-JSON stretch of script.
 */
function jsonSpan(text: string, from: number): string | null {
  const opener = text[from]
  if (opener !== '{' && opener !== '[') return null
  const closer = opener === '{' ? '}' : ']'
  let depth = 0
  let inString = false
  let escaped = false

  for (let at = from; at < text.length; at += 1) {
    const char = text[at]
    if (inString) {
      if (escaped) escaped = false
      else if (char === '\\') escaped = true
      else if (char === '"') inString = false
      continue
    }
    if (char === '"') inString = true
    else if (char === opener) depth += 1
    else if (char === closer) {
      depth -= 1
      if (depth === 0) return text.slice(from, at + 1)
    }
  }
  return null
}

/** The JSON value a span holds, or nothing when it is really JavaScript. */
function parseSpan(span: string): unknown {
  // A quoted key is what separates a JSON payload from the JavaScript object
  // literals around it; the parse simply fails on those.
  if (!/"[A-Za-z_]\w*"\s*:/.test(span)) return undefined
  try {
    return JSON.parse(span)
  } catch {
    return undefined
  }
}

/** Every JSON value a stretch of script text carries, in the order found. */
function payloadsIn(text: string): unknown[] {
  const found: unknown[] = []
  let at = 0
  while (at < text.length && found.length < MAX_PAYLOADS) {
    const char = text[at]
    if (char !== '{' && char !== '[') {
      at += 1
      continue
    }
    const span = jsonSpan(text, at)
    if (!span) {
      at += 1
      continue
    }
    const value = parseSpan(span)
    if (value === undefined) {
      // A stretch that is not JSON itself can still hold the thread inside
      // it: a page's hydration call is JavaScript wrapped around the data. So
      // the scanner steps in one character and tries again, rather than
      // jumping past the whole call. A value that did parse is trusted to
      // carry everything below it, because `treeOf` walks it.
      at += 1
      continue
    }
    found.push(value)
    at += span.length
  }
  return found
}

/**
 * The quoted runs of a script, unescaped.
 *
 * Pages carry their data as strings as often as as objects: a React Server
 * chunk is `x.push([1,"…"])` and a Remix context can be the whole thread as
 * one quoted blob, braces and all. Taking every long quoted run apart puts
 * both in the same shape as a plain inline payload, so one scanner reads
 * either. Short runs are words in the page's own JavaScript, not a thread.
 */
function quotedPayloads(text: string): string[] {
  const out: string[] = []
  let at = 0
  while (at < text.length && out.length < MAX_PAYLOADS) {
    if (text[at] !== '"') {
      at += 1
      continue
    }
    let end = at + 1
    while (end < text.length) {
      if (text[end] === '\\') {
        end += 2
        continue
      }
      if (text[end] === '"') break
      end += 1
    }
    const inner = text.slice(at + 1, end)
    if (inner.length >= MIN_QUOTED_PAYLOAD) {
      try {
        out.push(JSON.parse(`"${inner}"`))
      } catch {
        /* An escape this reader does not know; the markup path still can. */
      }
    }
    at = end + 1
  }
  return out
}

/** The readers only ever report what they found, never a refusal: a payload
 *  that is not a conversation is simply not a result. */
type FoundConversations = Extract<ParseResult, { ok: true }>

/** The payload readers, in the order of confidence for one link. */
function readersFor(provider: DocumentProvider): ((parsed: unknown) => ParseResult)[] {
  const first = PROVIDER_READERS[provider]
  const rest = Object.entries(PROVIDER_READERS)
    .filter(([key]) => key !== provider)
    .map(([, reader]) => reader)
  return first ? [first, ...rest] : rest
}

/** Every object and array inside a parsed value, outermost first.
 *
 * A share page keeps its thread several levels down — `props.pageProps` here,
 * `state.loaderData` there — and the text scanner only ever reports the
 * outermost value, so the tree is walked instead. The walk is bounded: a
 * conversation is a few hundred objects, and a page that holds ten thousand
 * is not a conversation. */
function treeOf(value: unknown, limit: number): unknown[] {
  const out: unknown[] = []
  const queue: unknown[] = [value]
  while (queue.length > 0 && out.length < limit) {
    const each = queue.shift()
    if (Array.isArray(each)) {
      out.push(each)
      queue.push(...each)
      continue
    }
    if (isRecord(each)) {
      out.push(each)
      queue.push(...Object.values(each))
    }
  }
  return out
}

/** Ask each reader in turn whether this value, or anything inside it, is a
 *  conversation. */
function readCandidates(values: unknown[], provider: DocumentProvider): FoundConversations | null {
  const readers = readersFor(provider)
  for (const value of values.slice(0, MAX_PAYLOADS)) {
    if (value === undefined || value === null) continue
    for (const node of treeOf(value, MAX_NODES)) {
      for (const reader of readers) {
        const result = reader(node)
        if (result.ok && result.results.some((each) => each.messages.length > 0)) return result
      }
    }
  }
  return null
}

function parseAsJson(source: string): unknown[] {
  try {
    return [JSON.parse(source)]
  } catch {
    return []
  }
}

/**
 * Conversation-shaped data in a page of scripts.
 *
 * A JSON response is read whole first, since a link that answers with data
 * needs no digging. Otherwise every inline script is opened, in order, and
 * each JSON value inside it — including the ones carried as strings by a
 * hydration call — is offered to the reader belonging to the site the link
 * names, then to the other two, so a link that redirects to a different
 * provider is still read.
 *
 * `DOMParser` is only touched on the script-scanning path, which keeps the
 * data path readable in a page with no browser around.
 */
function fromPayloads(page: SharePage): FoundConversations | null {
  if (page.contentType.includes('application/json') || !/[<>]/.test(page.body.slice(0, 512))) {
    const direct = readCandidates(parseAsJson(page.body), page.provider)
    if (direct) return direct
  }
  if (!/<script/i.test(page.body)) return null

  const doc = new DOMParser().parseFromString(page.body, 'text/html')
  const candidates: unknown[] = []
  for (const element of Array.from(doc.querySelectorAll('script:not([src])'))) {
    const text = element.textContent ?? ''
    if (!text.trim()) continue
    candidates.push(...payloadsIn(text))
    for (const quoted of quotedPayloads(text)) candidates.push(...payloadsIn(quoted))
    if (candidates.length >= MAX_PAYLOADS) break
  }
  return readCandidates(candidates, page.provider)
}

/* ------------------------------------------------------------------ *
 * the markup a person actually reads
 * ------------------------------------------------------------------ */

const levelOf = (tagName: string) => Number(tagName.charAt(1)) as 1 | 2 | 3 | 4 | 5 | 6

/** The LaTeX a page rendered, taken from the annotation KaTeX leaves behind.
 *  Inline equations come back as `$…$` in the words around them. */
function texOf(element: Element): string | null {
  if (!element.matches('.katex, .katex-display')) return null
  const expression = element.querySelector('annotation')?.textContent?.trim()
  return expression || null
}

/** Inline formatting kept as the markdown that describes it. */
function inlineText(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) return node.textContent ?? ''
  const element = node as Element
  if (element.nodeType !== Node.ELEMENT_NODE) return ''
  const tag = element.tagName
  if (tag === 'SCRIPT' || tag === 'STYLE' || tag === 'NOSCRIPT' || tag === 'TEMPLATE') return ''
  if (tag === 'BR') return '\n'

  const tex = texOf(element)
  if (tex) return `$${tex}$`

  const inner = () => Array.from(element.childNodes).map(inlineText).join('')
  switch (tag) {
    case 'CODE':
      return `\`${inner().replace(/^`+|`+$/g, '')}\``
    case 'STRONG':
    case 'B':
      return `**${inner()}**`
    case 'EM':
    case 'I':
      return `*${inner()}*`
    case 'DEL':
    case 'S':
    case 'STRIKE':
      return `~~${inner()}~~`
    case 'A': {
      const href = element.getAttribute('href') ?? ''
      const label = inner().trim()
      return href && !href.startsWith('#') ? `[${label}](${href})` : label
    }
    case 'IMG':
      return `![${element.getAttribute('alt') ?? ''}](${element.getAttribute('src') ?? ''})`
    default:
      return inner()
  }
}

function textOf(element: Element): string {
  return Array.from(element.childNodes)
    .map(inlineText)
    .join('')
    .replace(/[ \t]+/g, ' ')
    .trim()
}

function cellsOf(row: Element): string[] {
  return Array.from(row.querySelectorAll(':scope > th, :scope > td')).map(textOf)
}

/** A table read as a table: a header row, then the rows under it. */
function tableBlock(element: Element): ContentBlock | null {
  const head = element.querySelector('thead tr')
  const all = Array.from(element.querySelectorAll('tr')).filter((row) => row !== head)
  let headers: string[]
  let body: Element[]

  if (head) {
    headers = cellsOf(head)
    body = all
  } else if (all.length > 0 && all[0]!.querySelector('th')) {
    // A header row that is only marked by its cells is still a header row.
    headers = cellsOf(all[0]!)
    body = all.slice(1)
  } else {
    // Without any mark of a header, the first row is treated as one, which is
    // what a pipe table does, and no word is lost either way.
    headers = all.length > 0 ? cellsOf(all[0]!) : []
    body = all.slice(1)
  }

  const rows = body.map(cellsOf).filter((row) => row.some((cell) => cell.length > 0))
  if (headers.length === 0 && rows.length === 0) return null
  const caption = element.querySelector('caption')
  const block: TableBlock = { kind: 'table', headers, rows }
  if (caption) block.caption = shorten(textOf(caption), 80)
  return block
}

/** List items kept whole, with a nested list kept under the item it sits in. */
function listBlock(element: Element): ContentBlock | null {
  const items = Array.from(element.querySelectorAll(':scope > li')).flatMap((item) => {
    const nested = Array.from(item.querySelectorAll(':scope > ul, :scope > ol'))
    for (const each of nested) each.remove()
    const text = textOf(item)
    if (!text) return []
    const children = nested.flatMap((each) => {
      const marker = each.tagName === 'OL' ? '1.' : '-'
      return Array.from(each.querySelectorAll('li'))
        .map((li) => textOf(li))
        .filter(Boolean)
        .map((li) => `  ${marker} ${li}`)
    })
    return [children.length > 0 ? `${text}\n${children.join('\n')}` : text]
  })
  if (items.length === 0) return null
  return { kind: 'list', ordered: element.tagName === 'OL', items }
}

/** The language a code block says it is, from whichever convention the page
 *  chose — a class, or a data attribute. */
function languageOf(pre: Element, code: Element): string {
  for (const element of [code, pre]) {
    for (const name of Array.from(element.classList)) {
      const match = /^(?:language|lang|brush)[-:]([\w+#.-]+)$/.exec(name)
      if (match) return match[1]!
    }
    const declared = element.getAttribute('data-language') ?? element.getAttribute('data-lang')
    if (declared?.trim()) return declared.trim()
  }
  return 'text'
}

/**
 * The blocks inside one element, in the order they appear.
 *
 * Prose is gathered and handed to the same markdown scanner every parser
 * uses, so a fenced block or a pipe table written as text behaves exactly as
 * it does in a pasted thread. Elements that carry their own kind — a heading,
 * a table, a rendered equation, a picture — become that kind, because the
 * page has already said what they are.
 */
function blocksOf(element: Element, counters: Counters): ContentBlock[] {
  const blocks: ContentBlock[] = []
  let prose = ''

  const flush = () => {
    if (!prose.trim()) {
      prose = ''
      return
    }
    blocks.push(...extractBlocks(prose.trim()))
    prose = ''
  }

  for (const child of Array.from(element.childNodes)) {
    if (child.nodeType === Node.TEXT_NODE) {
      prose += child.textContent ?? ''
      continue
    }
    const node = child as Element
    if (node.nodeType !== Node.ELEMENT_NODE) continue
    const tag = node.tagName

    const tex = texOf(node)
    if (tex) {
      flush()
      blocks.push({
        kind: 'math',
        expression: tex,
        display: node.classList.contains('katex-display') || tag === 'DIV',
      })
      continue
    }

    if (tag === 'IMG') {
      flush()
      counters.images += 1
      const src = node.getAttribute('src') ?? ''
      if (!src) counters.unaddressed += 1
      blocks.push({ kind: 'image', src: src || undefined, alt: node.getAttribute('alt') ?? '', pending: true })
      continue
    }

    if (WIDGET_ELEMENTS.has(tag)) {
      flush()
      counters.widgets += 1
      const title = node.getAttribute('title') ?? node.getAttribute('aria-label')
      blocks.push({
        kind: 'unsupported',
        reason: `This is where the page showed a ${tag.toLowerCase()} — part of the chat the site ran or drew rather than wrote.${
          title ? ` It was titled “${shorten(title, 60)}”.` : ''
        }`,
        elementType: tag.toLowerCase(),
      })
      continue
    }

    if (/^H[1-6]$/.test(tag)) {
      const text = textOf(node)
      if (text) {
        flush()
        blocks.push({ kind: 'heading', level: levelOf(tag), text })
      }
      continue
    }

    if (tag === 'PRE') {
      flush()
      const code = node.querySelector('code')
      blocks.push({
        kind: 'code',
        code: (code ?? node).textContent?.replace(/\n$/, '') ?? '',
        language: languageOf(node, code ?? node),
      })
      continue
    }

    if (tag === 'TABLE') {
      flush()
      const table = tableBlock(node)
      if (table) blocks.push(table)
      continue
    }

    if (tag === 'UL' || tag === 'OL') {
      flush()
      const list = listBlock(node)
      if (list) blocks.push(list)
      continue
    }

    if (tag === 'BLOCKQUOTE') {
      flush()
      const text = textOf(node)
      if (text) blocks.push({ kind: 'blockquote', text })
      continue
    }

    if (tag === 'HR') {
      flush()
      blocks.push({ kind: 'text', text: '---' })
      continue
    }

    if (tag === 'A') {
      const inner = node.querySelector('img')
      const href = node.getAttribute('href') ?? ''
      if (inner && href) {
        flush()
        counters.images += 1
        const src = inner.getAttribute('src')
        if (!src) counters.unaddressed += 1
        blocks.push({ kind: 'image', src: src ?? undefined, alt: inner.getAttribute('alt') ?? '', pending: true })
        blocks.push({ kind: 'link', href, label: textOf(node) || href })
        continue
      }
    }

    // A container of further elements is descended into; anything else is
    // prose whose inline formatting the scanner is equipped for.
    if (
      node.querySelector(
        ':scope > p, :scope > div, :scope > ul, :scope > ol, :scope > pre, :scope > table, :scope > h1, :scope > h2, :scope > h3, :scope > blockquote',
      )
    ) {
      blocks.push(...blocksOf(node, counters))
      continue
    }
    prose += `${inlineText(node)}\n`
  }

  flush()
  return blocks
}

/** What the markup reading found, so the notes can count it honestly. */
interface Counters {
  images: number
  widgets: number
  unaddressed: number
  unlabelled: number
  wholePage: boolean
}

/* ------------------------------------------------------------------ *
 * where one turn ends and the next begins
 * ------------------------------------------------------------------ */

const TURN_HINT =
  /(^|[^a-z])(message|messages|msg|turn|conversation|chat-item|response|prompt|bubble|answer|question)([^a-z]|$)/i

const hasProse = (element: Element) =>
  !!element.querySelector('p, pre, ul, ol, table, h1, h2, h3, li, blockquote, .katex')

const labelCandidates = 'header, [class*="author"], [class*="role"], [class*="sender"], [class*="name"], strong, h1, h2, h3'

/** The speaker a container names, if it names one at all. */
function roleOfTurn(element: Element): MessageRole | null {
  for (const name of ROLE_ATTRIBUTES) {
    const value = element.getAttribute(name)?.trim()
    if (value && USER_LABELS.test(value)) return 'user'
    if (value && ASSISTANT_LABELS.test(value)) return 'assistant'
  }

  const named = (element.getAttribute('aria-label') ?? element.getAttribute('title') ?? '').trim()
  if (named && USER_LABELS.test(named)) return 'user'
  if (named && ASSISTANT_LABELS.test(named)) return 'assistant'

  for (const candidate of Array.from(element.querySelectorAll(labelCandidates))) {
    const text = (candidate.getAttribute('aria-label') ?? textOf(candidate)).trim()
    if (!text || text.length > 40) continue
    if (USER_LABELS.test(text)) return 'user'
    if (ASSISTANT_LABELS.test(text)) return 'assistant'
  }

  const signal = `${element.className} ${element.id}`.toLowerCase()
  if (/(^|[-_\s])(user|human|prompt|question)([-_\s]|$)/.test(signal)) return 'user'
  if (/(^|[-_\s])(assistant|model|response|answer|bot|gpt|claude|gemini)([-_\s]|$)/.test(signal))
    return 'assistant'
  return null
}

/** Containers that look like turns, with those that only wrap others gone. */
function turnContainers(root: Element): Element[] {
  const found = Array.from(root.querySelectorAll('*')).filter((element) => {
    const name = `${element.className} ${element.id}`
    return TURN_HINT.test(name) && hasProse(element)
  })
  const kept = found.filter(
    (element) => !found.some((other) => other !== element && element.contains(other)),
  )
  if (kept.length > 0) return kept
  return Array.from(root.querySelectorAll('article, section, [role="listitem"]')).filter(hasProse)
}

function timestampOf(element: Element): string | undefined {
  const time = element.querySelector('time')
  const raw = time?.getAttribute('datetime') ?? time?.textContent?.trim()
  if (!raw) return undefined
  const asDate = new Date(raw)
  return Number.isNaN(asDate.getTime()) ? undefined : asDate.toISOString()
}

/**
 * The turns a page of markup carries.
 *
 * A container becomes a turn only when the page marks it as one. A thread
 * that is a single column of undifferentiated paragraphs stays one message
 * and says so, because cutting it into a conversation would be this import
 * deciding what the page meant — and the preview lets every speaker be
 * corrected before anything is saved.
 */
function messagesFromMarkup(root: Element, counters: Counters): NormalizedMessage[] {
  const containers = turnContainers(root)
  if (containers.length === 0) {
    const text = textOf(root)
    if (text.length < 40) return []
    counters.wholePage = true
    return [{ id: newId(), role: 'assistant', content: extractBlocks(text), sequence: 0 }]
  }

  const messages: NormalizedMessage[] = []

  for (const container of containers) {
    const content = blocksOf(container, counters).filter(
      (block) => block.kind !== 'text' || block.text.trim().length > 0 || block.text === '---',
    )
    if (content.length === 0) continue
    const role = roleOfTurn(container)
    if (role === null) counters.unlabelled += 1
    messages.push({
      id: newId(),
      role: role ?? 'assistant',
      content,
      sequence: messages.length,
      timestamp: timestampOf(container),
    })
  }

  return messages
}

/* ------------------------------------------------------------------ *
 * the entry point
 * ------------------------------------------------------------------ */

const PAYLOAD_NOTE =
  'The conversation was read from the data this page hands to its own scripts — the same reading used for a provider export file.'

const MARKUP_NOTE =
  'This page was read from the markup the browser was given, not from a data payload. A part of the conversation built only after scripts run would not be in it.'

const SHELL_NOTE =
  'The page behind this link is filled in by scripts that run only in a browser, and it holds no conversation to read here. Providers serve this to automated readers, so use Paste or Upload for this thread.'

const CHALLENGE_NOTE =
  'The site answered this link with a check that it is being visited by a person rather than a reader, so there is no conversation in the response. Use Paste or Upload for this thread.'

const RESTRUCTURED_NOTE =
  'The page was reached, but no conversation could be found in it. Providers change these pages, and this reader has not been updated for the version you got. Paste the thread or upload an export of the chat instead.'

/** The line a document is named after: its first heading, or its first words. */
function firstLineOf(message: NormalizedMessage | undefined): string {
  if (!message) return ''
  for (const block of message.content) {
    let whole: string | null = null
    if (block.kind === 'heading' || block.kind === 'text' || block.kind === 'blockquote')
      whole = block.text
    else if (block.kind === 'markdown') whole = block.source
    else if (block.kind === 'code') whole = block.code
    else if (block.kind === 'list') whole = block.items[0] ?? ''
    if (whole === null) continue
    // The words of one turn are often several elements running together — a
    // question and the timestamp printed under it — so the name is the first
    // line of them rather than the whole of it.
    return (whole.split('\n')[0] ?? '').trim()
  }
  return ''
}

/**
 * Read a share page into the same envelope a file import produces.
 *
 * The order is the order of confidence: a data payload is the provider's own
 * description of the thread and is read by the shipped export parsers; the
 * markup is what the page shows, read second; and a page that gives neither
 * is reported as the failure it is.
 */
export function extractShareConversation(page: SharePage): ParseResult {
  const payload = fromPayloads(page)
  if (payload) {
    const results = payload.results.map((each) =>
      each.warnings.includes(PAYLOAD_NOTE)
        ? each
        : { ...each, warnings: [PAYLOAD_NOTE, ...each.warnings] },
    )
    return { ok: true, results, notes: payload.notes }
  }

  const doc = new DOMParser().parseFromString(page.body, 'text/html')
  doc
    .querySelectorAll('script, style, noscript, template, svg, head')
    .forEach((each) => each.remove())
  const root = doc.querySelector('main') ?? doc.body
  if (!root) return notParsed(RESTRUCTURED_NOTE)

  const words = (root.textContent ?? '').replace(/\s+/g, ' ').trim()
  if (words.length === 0) return notParsed(SHELL_NOTE)
  if (BOT_CHALLENGE.test(words)) return notParsed(CHALLENGE_NOTE)

  const counters: Counters = { images: 0, widgets: 0, unaddressed: 0, unlabelled: 0, wholePage: false }
  const messages = messagesFromMarkup(root, counters)
  if (messages.length === 0) return notParsed(RESTRUCTURED_NOTE)

  const notes: string[] = [MARKUP_NOTE]
  if (counters.unlabelled > 0) {
    notes.push(
      `${plural(counters.unlabelled, 'turn')} ${
        counters.unlabelled === 1 ? 'names' : 'name'
      } no speaker on this page and ${
        counters.unlabelled === 1 ? 'is shown as a reply' : 'are shown as replies'
      }. Correct any of them in the preview before saving.`,
    )
  }
  if (counters.wholePage) {
    notes.push(
      'This page does not mark its turns, so its words are kept as a single message rather than a conversation this import invented. Use Paste for a thread you can label line by line.',
    )
  }
  if (counters.images > 0) {
    notes.push(
      `${plural(counters.images, 'image')} on this page ${
        counters.images === 1 ? 'is kept' : 'are kept'
      } as a reference to where it appears, not as the picture itself, which stays behind the provider's address.`,
    )
  }
  if (counters.unaddressed > 0) {
    notes.push('An image on this page carries no address, so only its description is kept.')
  }
  if (counters.widgets > 0) {
    notes.push(
      `${plural(counters.widgets, 'interactive part')} of this chat — a canvas, a chart, or code the site ran for it — ${
        counters.widgets === 1 ? 'is' : 'are'
      } named where it appeared. What it showed cannot be read from the page’s words.`,
    )
  }

  const first = messages[0]
  const result = buildResult({
    title: titleFrom(firstLineOf(first)),
    provider: page.provider,
    messages,
    warnings: notes,
    sourceId: page.finalUrl,
    createdAt: first?.timestamp,
  })
  return { ok: true, results: [result] }
}
