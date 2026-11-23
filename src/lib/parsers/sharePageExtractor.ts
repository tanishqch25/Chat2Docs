import { extractBlocks } from './blockExtractor'
import { buildResult, notParsed, titleFrom } from './envelope'
import { chatgptConversations } from './chatgptParser'
import { claudeConversations } from './claudeParser'
import { geminiConversations } from './geminiParser'
import { afInitDataValues, decodeTurboStream, flightChunks, octaneValues } from './hydration'
import {
  asArray,
  asRecord,
  asString,
  asText,
  isRecord,
  jsonSpan,
  parseSpan,
  shorten,
  timestampFrom,
} from './json'
import { newId } from '@/services/documentService'
import type { ContentBlock, TableBlock } from '@/types/conversation'
import type { DocumentProvider, MessageRole, NormalizedMessage } from '@/types/document'
import type { JsonRecord } from './json'
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

const ROLE_ATTRIBUTES = [
  'data-message-author-role',
  'data-message-role',
  'data-role',
  'data-author-role',
]

const BOT_CHALLENGE =
  /(just a moment|checking your browser|verify you are (a )?human|are you a robot|unusual traffic|captcha|enable javascript and cookies)/i

/* ------------------------------------------------------------------ *
 * payloads hidden inside the page's scripts
 * ------------------------------------------------------------------ */

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
  const turns = shareTurnsReader(provider)
  const rest = Object.entries(PROVIDER_READERS)
    .filter(([key]) => key !== provider)
    .map(([, reader]) => reader)
  if (provider === 'gemini') return [geminiConversations, geminiShareTurns, turns, ...rest]
  return first ? [first, turns, ...rest] : [turns, ...rest]
}

/**
 * The positional turns inside a Google `AF_initDataCallback` array.
 *
 * Gemini writes its chat as arrays whose meaning is their order, so one entry
 * is `[who spoke, what they said, when]` and nothing says so. This reader
 * therefore needs two independent signals to call an array a turn: a cell that
 * names a speaker in the provider's own words, and a cell that holds words. It
 * takes the first list in which at least two such turns sit side by side, and
 * refuses anything that does not add up to a question and an answer, so a page
 * of menus — which is all arrays of short strings — never reads as a chat.
 *
 * The words go to the same markdown scanner every import uses, which is what
 * keeps a fence or a table whole across the two cells that hold it.
 */
function geminiShareTurns(parsed: unknown): ParseResult {
  const found: { role: MessageRole; text: string; timestamp?: string }[] = []

  /** One moment written as itself: a page that gives a turn its timestamp in
   *  the same array as its words would otherwise print the time as a reply. */
  const ISO_CELL = /^\d{4}-\d{2}-\d{2}T[\d:.]+Z?$/

  const stringsIn = (node: unknown, out: string[], depth: number): void => {
    if (depth > 24) return
    if (typeof node === 'string') {
      if (node.trim().length > 0) out.push(node)
      return
    }
    if (Array.isArray(node)) {
      for (const each of node) stringsIn(each, out, depth + 1)
      return
    }
    const record = asRecord(node)
    if (record)
      for (const key of TURN_TEXT_KEYS)
        if (record[key] !== undefined) stringsIn(record[key], out, depth + 1)
  }

  const turnOf = (item: unknown): { role: MessageRole; text: string; timestamp?: string } | null => {
    if (!Array.isArray(item)) return null
    let role: MessageRole | null = null
    let timestamp: string | undefined
    const words: string[] = []
    for (const each of item) {
      if (typeof each === 'string') {
        const label = each.trim().toLowerCase()
        if (role === null && label.length > 0 && label.length <= 24) {
          if (USER_LABELS.test(label)) {
            role = 'user'
            continue
          }
          if (ASSISTANT_LABELS.test(label)) {
            role = 'assistant'
            continue
          }
        }
        if (ISO_CELL.test(each.trim())) {
          const stamp = new Date(each.trim())
          if (!Number.isNaN(stamp.getTime())) {
            timestamp ??= stamp.toISOString()
            continue
          }
        }
        words.push(each)
        continue
      }
      stringsIn(each, words, 0)
    }
    if (role === null || words.length === 0) return null
    const text = words.join('\n\n').trim()
    return text.length > 0 ? { role, text, timestamp } : null
  }

  const queue: { node: unknown; depth: number }[] = [{ node: parsed, depth: 0 }]
  while (queue.length > 0 && found.length === 0) {
    const each = queue.shift()
    if (!each || each.depth > 40) continue
    if (Array.isArray(each.node)) {
      const turns = each.node.map(turnOf)
      const hits = turns.filter(
        (turn): turn is { role: MessageRole; text: string; timestamp?: string } => turn !== null,
      )
      if (hits.length >= 2) {
        found.push(...hits)
        break
      }
      for (const child of each.node) queue.push({ node: child, depth: each.depth + 1 })
      continue
    }
    const record = asRecord(each.node)
    if (record) for (const value of Object.values(record)) queue.push({ node: value, depth: each.depth + 1 })
  }

  const asked = found.some((each) => each.role === 'user')
  const answered = found.some((each) => each.role === 'assistant')
  const words = found.reduce((total, each) => total + each.text.length, 0)
  if (found.length < 2 || !asked || !answered || words < 80) {
    return notParsed('This array does not hold a conversation between two speakers.')
  }

  const messages: NormalizedMessage[] = found.map((each, position) => ({
    id: newId(),
    role: each.role,
    content: extractBlocks(each.text),
    sequence: position,
    timestamp: each.timestamp,
  }))
  return {
    ok: true,
    results: [
      buildResult({
        title: titleFrom(firstLineOf(messages[0]), 'Untitled Gemini conversation'),
        provider: 'gemini',
        messages,
        warnings: [
          'The words were taken from the positional data this page hands its own scripts, where nothing names which entry is the speaker. Check each turn in the preview before saving.',
        ],
        sourceId: 'gemini-share',
      }),
    ],
  }
}

/**
 * A thread written as a plain list of turns.
 *
 * Each provider also ships its chat as `[{role, content}, …]` somewhere in
 * the page — an Octane signal table here, a React Server row there — and none
 * of the three export readers looks for that shape, because none of those
 * files is where it comes from. The reader is deliberately narrow: at least
 * two entries, each naming a speaker, with a question and an answer among
 * them. A list of page settings does not look like that, which is the point —
 * an unlabelled column of the site's own words must never become a document.
 */
function shareTurnsReader(provider: DocumentProvider): (parsed: unknown) => ParseResult {
  return (parsed) => {
    const source = turnSource(parsed)
    if (!source) return notParsed('This value is not a list of conversation turns.')

    const notes: string[] = []
    const messages: NormalizedMessage[] = []
    for (const item of source.list) {
      const message = asRecord(item)
      if (!message) continue
      const at = `Turn ${messages.length + 1}`
      const role = roleOfMessage(message, notes, at)
      if (role === null) continue
      const content = turnBlocks(
        message.content ?? message.text ?? message.parts ?? message.message,
        notes,
        at,
        provider,
      )
      if (content.length === 0) continue

      const kept: Record<string, unknown> = {}
      const uuid = asText(message.id) ?? asText(message.uuid)
      if (uuid) kept.source_message_id = uuid
      const model = asText(message.model) ?? asText(message.model_slug)
      if (model) kept.model_slug = model

      messages.push({
        id: newId(),
        role,
        content,
        sequence: messages.length,
        timestamp: timestampFrom(message.create_time, message.created_at, message.timestamp),
        metadata: Object.keys(kept).length > 0 ? kept : undefined,
      })
    }

    const asked = messages.some((message) => message.role === 'user')
    const answered = messages.some((message) => message.role === 'assistant')
    if (messages.length < 2 || !asked || !answered) {
      return notParsed('This list does not hold a conversation between two speakers.')
    }

    const first = messages[0]
    return {
      ok: true,
      results: [
        buildResult({
          title: asText(source.record?.title) ?? asText(source.record?.name) ?? titleFrom(firstLineOf(first)),
          provider,
          messages,
          warnings: notes,
          sourceId: asText(source.record?.id) ?? asText(source.record?.uuid),
          createdAt: timestampFrom(source.record?.create_time, source.record?.created_at),
        }),
      ],
    }
  }
}

/** Where a list of turns lives, and what the object holding it says about it. */
function turnSource(parsed: unknown): { list: unknown[]; record: JsonRecord | null } | null {
  const record = asRecord(parsed)
  if (record) {
    for (const key of ['messages', 'turns', 'chat_messages', 'conversation_turns']) {
      const list = asArray(record[key])
      if (list.length > 0) return { list, record }
    }
    return null
  }
  if (Array.isArray(parsed) && parsed.length > 0) return { list: parsed, record: null }
  return null
}

/** The speaker a list entry names, or nothing when it names none. */
function roleOfMessage(message: JsonRecord, notes: string[], at: string): MessageRole | null {
  const label = (
    asString(message.role) ??
    asString(message.sender) ??
    asString(asRecord(message.author)?.role) ??
    asString(asRecord(message.message)?.role) ??
    ''
  )
    .trim()
    .toLowerCase()
  if (!label) return null
  if (USER_LABELS.test(label)) return 'user'
  if (ASSISTANT_LABELS.test(label)) return 'assistant'
  if (label === 'system') return 'system'
  notes.push(
    `${at}: this page calls the speaker “${shorten(label, 30)}”, which is not a role PromptPaper keeps, so it is stored as a system turn — check it before saving.`,
  )
  return 'system'
}

/** The site a page belongs to, spelled the way a person reads it. */
const PROVIDER_WORD: Record<DocumentProvider, string> = {
  chatgpt: 'ChatGPT',
  claude: 'Claude',
  gemini: 'Gemini',
  generic: 'the provider',
}

/** The keys a turn's words can sit under, in the order the pages use them. */
const TURN_TEXT_KEYS = ['text', 'content', 'parts', 'message', 'markdown', 'value']

/**
 * One turn's body, in the order the page wrote it.
 *
 * Text is collected and scanned as markdown rather than element by element,
 * so a code fence or a table that spans two parts of one reply stays one
 * block. A part that carries no words — an upload, a widget the site ran —
 * becomes a `file` or `unsupported` block with a note, because the turn the
 * user read is still there even when this page cannot bring its contents.
 */
function turnBlocks(
  value: unknown,
  notes: string[],
  at: string,
  provider: DocumentProvider,
): ContentBlock[] {
  if (typeof value === 'string') return extractBlocks(value)
  if (Array.isArray(value)) {
    const blocks: ContentBlock[] = []
    let pending = ''
    for (const each of value) {
      if (typeof each === 'string') {
        pending = pending ? `${pending}\n\n${each}` : each
        continue
      }
      const inner = turnBlocks(each, notes, at, provider)
      if (inner.length === 0) continue
      if (pending) {
        blocks.push(...extractBlocks(pending))
        pending = ''
      }
      blocks.push(...inner)
    }
    if (pending) blocks.push(...extractBlocks(pending))
    return blocks
  }

  const record = asRecord(value)
  if (!record) return []

  const pointer = asText(record.asset_pointer) ?? asText(record.image_asset_pointer)
  if (pointer) {
    notes.push(
      `${at}: ${shorten(pointer, 60)} points at a file this page does not carry, so it is kept as a reference.`,
    )
    return [
      {
        kind: 'file',
        name: asText(record.filename) ?? asText(record.name) ?? shorten(pointer, 40),
        mimeType: asText(record.mimetype) ?? asText(record.mime_type),
        note: `${pointer} is a reference; the bytes are not in this page.`,
      },
    ]
  }

  const type = asText(record.type) ?? asText(record.content_type) ?? ''
  if (type === 'code') {
    const code = asText(record.code) ?? asText(record.text) ?? ''
    return [{ kind: 'code', code, language: asText(record.language) ?? 'text' }]
  }

  for (const key of TURN_TEXT_KEYS) {
    if (record[key] === undefined) continue
    const blocks = turnBlocks(record[key], notes, at, provider)
    if (blocks.length > 0) return blocks
  }

  if (type.length > 0) {
    notes.push(
      `${at}: a ${type} element of this turn has no words in this page, so it is kept as a marker rather than dropped.`,
    )
    return [
      {
        kind: 'unsupported',
        reason: `${PROVIDER_WORD[provider]} ${type} element`,
        elementType: type,
      },
    ]
  }
  return []
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

/** Ask each reader, in order of confidence, whether any value here is a
 *  conversation.
 *
 *  The readers come first, not the values: a ChatGPT page can hold both its
 *  `mapping` tree and a flat list of every version of every turn, and the
 *  tree names the branch actually being read. Trying the site's own reader
 *  across the whole page before falling back to the generic list is what
 *  keeps that choice on the side of exactness. */
function readCandidates(
  values: unknown[],
  provider: DocumentProvider,
  nodeLimit = MAX_NODES,
): FoundConversations | null {
  const nodes: unknown[] = []
  for (const value of values.slice(0, MAX_PAYLOADS)) {
    if (value === undefined || value === null) continue
    nodes.push(...treeOf(value, nodeLimit))
  }
  for (const reader of readersFor(provider)) {
    for (const node of nodes) {
      const result = reader(node)
      if (result.ok && result.results.some((each) => each.messages.length > 0)) return result
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

/** How far the walk goes through a resolved table. Every cell of a long
 *  thread is in it, and the conversation sits several levels under the
 *  route's own envelope, so the ordinary bound is far too small here. */
const MAX_TABLE_NODES = 8_000

/** Whether a response is a framework's table of cells rather than a page.
 *
 *  The tell is the line after the first: a row written as its type, the slot
 *  it fills and its JSON. No provider's export file is written that way, and
 *  reading one as a table would turn its numbers into indexes and its
 *  conversation into nothing. */
function isTurboStream(contentType: string, body: string): boolean {
  if (contentType.includes('text/x-script')) return true
  if (body.startsWith('<')) return false
  const first = body.indexOf('\n')
  return first > 0 && /^[A-Za-z]\d+:/.test(body.slice(first + 1, first + 40))
}

/**
 * Conversation-shaped data in a page of scripts.
 *
 * A route's own data — the flat table React Router hands back when a share
 * address is asked for `.data` — is resolved first, because it is the
 * provider's description of the thread and needs no guessing. A JSON body is
 * read whole next, since a link that answers with data needs no digging
 * either. Otherwise every inline script is opened, in order: its JSON values,
 * the values those scripts carry as strings, the signal tables whose values
 * name their own types, Google's `AF_initDataCallback` arrays and the joined
 * React Server chunks are all offered to the reader belonging to the site the
 * link names, then to the generic list reader, then to the other two providers
 * so that a link which redirects is still read.
 *
 * `DOMParser` is only touched on the script-scanning path, which keeps the
 * data path readable in a page with no browser around.
 */
function fromPayloads(page: SharePage): FoundConversations | null {
  if (isTurboStream(page.contentType, page.body)) {
    const decoded = decodeTurboStream(page.body)
    if (decoded === undefined) return null
    return readCandidates([decoded], page.provider, MAX_TABLE_NODES)
  }

  if (page.contentType.includes('application/json') || !/[<>]/.test(page.body.slice(0, 512))) {
    const direct = readCandidates(parseAsJson(page.body), page.provider)
    if (direct) return direct
  }
  if (!/<script/i.test(page.body)) return null

  const doc = new DOMParser().parseFromString(page.body, 'text/html')
  const candidates: unknown[] = []
  let flight = ''
  for (const element of Array.from(doc.querySelectorAll('script:not([src])'))) {
    const text = element.textContent ?? ''
    if (!text.trim()) continue
    const found = payloadsIn(text)
    candidates.push(...found)
    for (const quoted of quotedPayloads(text)) candidates.push(...payloadsIn(quoted))
    // A signal table's values are typed rather than keyed, so they have to be
    // put back into ordinary objects before any reader recognises them.
    for (const value of found) candidates.push(...octaneValues(value))
    for (const value of afInitDataValues(text)) candidates.push(value)
    flight += flightChunks(text)
    if (candidates.length >= MAX_PAYLOADS) break
  }
  // Flight rows close only once the chunks are joined, so this scan has no
  // equivalent on the per-script path above.
  if (flight) {
    candidates.push(...payloadsIn(flight))
    for (const quoted of quotedPayloads(flight)) candidates.push(...payloadsIn(quoted))
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
}

/* ------------------------------------------------------------------ *
 * where one turn ends and the next begins
 * ------------------------------------------------------------------ */

const TURN_HINT =
  /(^|[^a-z])(message|messages|msg|turn|conversation|chat-item|response|prompt|bubble|answer|question)([^a-z]|$)/i

/**
 * The elements a page marks as holding one turn.
 *
 * A turn is only taken where the site itself says one sits: the attribute
 * naming its speaker, the identifier it gives the message, its own test id, or
 * the element a chat is conventionally written as. Everything else on a share
 * page is shaped the same way as the conversation — the navigation, the cookie
 * note and the prompt to sign up are all paragraphs and lists too — so this
 * list is what keeps those out of a document.
 */
const TURN_MARKERS = [
  ...ROLE_ATTRIBUTES.map((name) => `[${name}]`),
  '[data-message-id]',
  '[data-message-uuid]',
  '[data-test-id*="message"]',
  '[data-testid*="message"]',
  '[data-test*="message"]',
  '[data-testid*="conversation-turn"]',
  'article',
].join(', ')

/** The furniture of a site rather than its chat, where it is not holding one. */
const STRUCTURAL_CHROME = [
  'header',
  'nav',
  'footer',
  'aside',
  '[role="navigation"]',
  '[role="banner"]',
  '[role="contentinfo"]',
  '[role="dialog"]',
  '[aria-modal="true"]',
  'form',
]

/** Decoration that never carries a turn's words: a control, a picture of an
 *  icon, a panel the page keeps hidden until it is opened. */
const DECORATION_CHROME = 'button, svg, [hidden], select'

/** Names sites give their own prompts and notices. A container called this is
 *  not a conversation, whatever is inside it says. */
const CHROME_NAME =
  /(cookie|consent|paywall|sign[-_]?(?:up|in)|log[-_]?in|register|onboarding|upsell|promo|download[-_]?app|app[-_]?banner|to[-_]?ast)/i

/** Whether this element is, or holds, a turn the page marked. */
const keepsTurn = (element: Element): boolean =>
  element.matches(TURN_MARKERS) || !!element.querySelector(TURN_MARKERS)

/**
 * The parts of a page that belong to the site, taken out before it is read.
 *
 * Structural furniture is only removed when it is not itself a turn, not
 * holding one and not standing inside one, because some chats put their
 * speaker's name in a `<header>` inside the turn — losing that would turn a
 * labelled thread into an unlabelled one. A control is a different thing: no
 * provider writes a reply inside a button, and the words on one ("Copy",
 * "Good response", "Sign up") are the page talking, not the conversation.
 */
function stripChrome(root: Element): void {
  const guarded = [...STRUCTURAL_CHROME, '[class], [id]']
  for (const selector of guarded) {
    for (const element of Array.from(root.querySelectorAll(selector))) {
      if (selector === '[class], [id]' && !CHROME_NAME.test(`${element.className} ${element.id}`)) {
        continue
      }
      if (keepsTurn(element) || element.closest(TURN_MARKERS)) continue
      element.remove()
    }
  }
  for (const element of Array.from(root.querySelectorAll(DECORATION_CHROME))) {
    if (!keepsTurn(element)) element.remove()
  }
}

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

/** Containers the page marks as turns, with those that only wrap others gone. */
function turnContainers(root: Element): Element[] {
  const found = new Set<Element>()
  for (const element of Array.from(root.querySelectorAll(TURN_MARKERS))) {
    if (hasProse(element)) found.add(element)
  }
  for (const element of Array.from(root.querySelectorAll('*'))) {
    if (TURN_HINT.test(`${element.className} ${element.id}`) && hasProse(element)) found.add(element)
  }
  const kept = [...found]
  return kept.filter(
    (element) => !kept.some((other) => other !== element && element.contains(other)),
  )
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
 * A container becomes a turn only when the page marks it as one. A thread the
 * page does not mark is reported as not read rather than written as one large
 * message, because the words of a page that has not said who spoke are the
 * site's own — its menu, its notice, its prompt to sign up — and a document
 * made of them would be an import that invented a conversation.
 */
function messagesFromMarkup(root: Element, counters: Counters): NormalizedMessage[] {
  const messages: NormalizedMessage[] = []

  for (const container of turnContainers(root)) {
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

/** What is said when a page gives neither a payload nor a marked turn. This
 *  is the answer that keeps an import from writing a page of menu items and
 *  legal text into a document and calling it a conversation. */
const NO_TURNS_NOTE =
  'Could not extract conversation messages from this share link. The provider may require JavaScript rendering or blocked automated access—please copy-paste the conversation or upload your export file instead.'

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
    .querySelectorAll('script, style, template, svg, head')
    .forEach((each) => each.remove())
  // A page that renders its own thread keeps the server-written words in a
  // `<noscript>` beside the empty container its scripts fill in. Inside a turn
  // the page marks, those are the reply; outside one, a noscript is only a
  // notice to the reader, which is not anyone's side of a conversation.
  for (const each of Array.from(doc.querySelectorAll('noscript'))) {
    if (each.closest(TURN_MARKERS)) each.replaceWith(...Array.from(each.childNodes))
    else each.remove()
  }
  const root = doc.querySelector('main') ?? doc.body
  if (!root) return notParsed(NO_TURNS_NOTE)

  const words = (root.textContent ?? '').replace(/\s+/g, ' ').trim()
  if (words.length === 0) return notParsed(SHELL_NOTE)
  if (BOT_CHALLENGE.test(words)) return notParsed(CHALLENGE_NOTE)

  stripChrome(root)
  const counters: Counters = { images: 0, widgets: 0, unaddressed: 0, unlabelled: 0 }
  const messages = messagesFromMarkup(root, counters)
  if (messages.length < 2) return notParsed(NO_TURNS_NOTE)

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
