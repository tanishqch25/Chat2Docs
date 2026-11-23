import { jsonSpan } from './json'
import type { JsonRecord } from './json'

/**
 * The data a page hands to its own scripts, put back into plain values.
 *
 * A share page is not one document but several: the markup a browser ends up
 * drawing, and the payload the framework on that site shipped to be drawn
 * from. The payload is the provider's own description of the thread, so it is
 * what an exact import wants — but each site encodes it in its own way, and
 * none of those ways is JSON a reader can take whole. Four are decoded here,
 * because four are what the supported sites ship:
 *
 * - React Router v7 single-fetch, which ChatGPT answers at `<share url>.data`:
 *   one flat array of cells, every value written as that cell's index, plus
 *   typed rows after the first line. A `mapping` key is `_75`, a reply is
 *   `_1043`, and the numbers mean nothing until they are looked up.
 * - Octane signal tables, which the same site writes into its HTML: values
 *   tagged by their own type — `["string","hello"]`, `["object",[["k", …]]]`.
 * - `AF_initDataCallback`, Google's way of naming a JSON array inside a
 *   JavaScript call, whose contents are positional rather than keyed.
 * - React Server `__next_f` chunks, which Claude splits into quoted runs that
 *   have to be joined back together before any value in them closes.
 *
 * Two rules hold all four honest. A decoder either returns whole values or
 * returns nothing: a half-resolved payload would reach the preview looking
 * like a conversation with pieces missing. And nothing here decides what a
 * conversation *is* — that stays with the same deterministic readers that
 * read a provider's own export file, so an import from a link and an import
 * from a download are read by one code path, not two.
 */

/** Cells resolved before a payload is given up on. A thread is a few tens of
 *  thousands; a page that needs a million is not a thread. */
const MAX_CELLS = 500_000

/** How deep the reference graph is followed before the page is refused. */
const MAX_DEPTH = 3_000

/** Values collected from one page, so a page of configurations cannot crowd
 *  the conversation out of the search. */
const MAX_VALUES = 40

/* ------------------------------------------------------------------ *
 * React Router v7 single-fetch (`text/x-script`)
 * ------------------------------------------------------------------ */

/** What a negative index stands for: the values JSON cannot carry. */
const SENTINELS: Record<string, unknown> = {
  '-1': undefined,
  '-2': Number.NaN,
  '-3': Number.POSITIVE_INFINITY,
  '-4': Number.NEGATIVE_INFINITY,
  '-5': null,
  '-6': -0,
  '-7': '',
}

/** Tags whose whole payload is one further cell, so the cell is the value. */
const PASSTHROUGH_TAGS = new Set(['P', 'R', 'o', 'U'])

/** Tags the transport uses for anything other than a plain value. A tag this
 *  reader does not settle becomes its decoded payload, which no conversation
 *  reader mistakes for a turn. */
const KNOWN_TAGS = new Set([
  ...PASSTHROUGH_TAGS,
  'D',
  'S',
  'M',
  'E',
  'H',
  'f',
  'F',
  'B',
  'N',
  'w',
  'W',
  'I',
  'b64',
  'Ab',
  'IA',
  'T',
  'Error',
  'SanitizedError',
  'Date',
  'RegExp',
  'URL',
  'Map',
  'Set',
  'Headers',
  'FormData',
  'Blob',
  'BigInt',
])

interface Row {
  tag: string
  value: unknown
}

interface Table {
  cells: unknown[]
  rows: Map<number, Row>
  used: number
  /** The chain being resolved right now, so a promise that points at itself
   *  is answered instead of recursed into forever. */
  path: Set<unknown>
}

const isoOf = (value: unknown): unknown => {
  const ms = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(ms)) return value
  const date = new Date(ms)
  return Number.isNaN(date.getTime()) ? value : date.toISOString()
}

/** One cell of the flat array, looked up by index. */
function cell(table: Table, index: number): unknown {
  if (index < 0) return SENTINELS[String(index)] ?? null
  const row = table.rows.get(index)
  if (row) {
    const settled = settle(table, row.value)
    return row.tag === 'D' ? isoOf(settled) : settled
  }
  return settle(table, table.cells[index])
}

/** A number is an index; anything else is the value itself.
 *
 *  The distinction is the whole format: ChatGPT writes every string, object
 *  and array once into the flat array and refers to it by position after that.
 *  Reading a position as a string — or a string as a position — is what turns
 *  a thread into a page of numbers. */
function settle(table: Table, node: unknown): unknown {
  if (typeof node === 'number' && Number.isInteger(node)) return cell(table, node)
  if (node === null || typeof node !== 'object') return node
  if (table.path.has(node) || table.path.size > MAX_DEPTH) return undefined
  if (++table.used > MAX_CELLS) throw new RangeError('turbo-stream payload too large')
  table.path.add(node)
  try {
    if (Array.isArray(node)) return arrayNode(table, node)
    return objectNode(table, node as JsonRecord)
  } finally {
    table.path.delete(node)
  }
}

function arrayNode(table: Table, node: unknown[]): unknown {
  const tag = node[0]
  if (typeof tag === 'string' && KNOWN_TAGS.has(tag)) {
    const rest = node.slice(1).map((each) => settle(table, each))
    if (tag === 'D') return isoOf(rest[0])
    if (PASSTHROUGH_TAGS.has(tag)) return rest[0]
    return rest
  }
  return node.map((each) => settle(table, each))
}

/** Keys are slots too: `_75` means the cell at 75, which holds the word
 *  `mapping`. Reading the key literally is how a decoding yields `_75`. */
function objectNode(table: Table, node: JsonRecord): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(node)) {
    const slot = /^_(-?\d+)$/.exec(key)
    if (slot) {
      const name = settle(table, Number(slot[1]))
      out[typeof name === 'string' ? name : String(name)] = settle(table, value)
      continue
    }
    out[key] = settle(table, value)
  }
  return out
}

/**
 * The conversation object behind a `.data` response.
 *
 * The first line is the flat array; every line after it is a deferred value
 * written as its type, its slot in the array, and its JSON. Both halves are
 * needed: a ChatGPT share route keeps its `mapping` in the array and its
 * settled answer in a row.
 */
export function decodeTurboStream(body: string): unknown {
  const first = body.indexOf('\n')
  const headLine = first === -1 ? body : body.slice(0, first)
  let cells: unknown
  try {
    cells = JSON.parse(headLine)
  } catch {
    return undefined
  }
  if (!Array.isArray(cells)) return undefined

  const rows = new Map<number, Row>()
  const tail = first === -1 ? '' : body.slice(first + 1)
  for (const line of tail.split('\n')) {
    const row = /^([A-Za-z])(\d+):([\s\S]*)$/.exec(line)
    if (!row) continue
    try {
      rows.set(Number(row[2]), { tag: row[1]!, value: JSON.parse(row[3] ?? 'null') })
    } catch {
      /* A row this reader cannot open is a value the page kept for itself. */
    }
  }

  const table: Table = { cells, rows, used: 0, path: new Set() }
  try {
    return settle(table, cells[0])
  } catch {
    return undefined
  }
}

/* ------------------------------------------------------------------ *
 * Octane signal tables
 * ------------------------------------------------------------------ */

type Decoded = { ok: true; value: unknown } | { ok: false }

const NOTHING: Decoded = { ok: false }

/**
 * One value of the type-tagged form the document uses.
 *
 * `["string","hello"]` is hello and `["null"]` is nothing, so a value says
 * what it is instead of leaving the reader to guess. The tags are matched
 * exactly, and a value that does not fit the grammar is reported as not
 * encoded at all rather than decoded halfway: a page full of ordinary arrays
 * must not become a page full of invented strings.
 */
function decodeTagged(node: unknown, budget: { used: number; depth: number }): Decoded {
  if (!Array.isArray(node) || node.length === 0) return NOTHING
  if (typeof node[0] !== 'string') return NOTHING
  if (budget.depth > MAX_DEPTH || ++budget.used > MAX_CELLS) return NOTHING
  const tag = node[0]
  const body = node[1]
  const next = { used: budget.used, depth: budget.depth + 1 }

  if (tag === 'null') return node.length === 1 ? { ok: true, value: null } : NOTHING
  if (tag === 'undefined') return node.length === 1 ? { ok: true, value: undefined } : NOTHING
  if (tag === 'string') return node.length === 2 && typeof body === 'string' ? { ok: true, value: body } : NOTHING
  if (tag === 'number') return node.length === 2 && typeof body === 'number' ? { ok: true, value: body } : NOTHING
  if (tag === 'boolean') return node.length === 2 && typeof body === 'boolean' ? { ok: true, value: body } : NOTHING

  if (tag === 'array') {
    if (!Array.isArray(body)) return NOTHING
    const items: unknown[] = []
    for (const each of body) {
      const decoded = decodeTagged(each, next)
      if (!decoded.ok) return NOTHING
      items.push(decoded.value)
    }
    return { ok: true, value: items }
  }

  if (tag === 'object') {
    if (!Array.isArray(body)) return NOTHING
    const out: Record<string, unknown> = {}
    for (const pair of body) {
      if (!Array.isArray(pair) || pair.length !== 2 || typeof pair[0] !== 'string') return NOTHING
      const decoded = decodeTagged(pair[1], next)
      if (!decoded.ok) return NOTHING
      out[pair[0]] = decoded.value
    }
    return { ok: true, value: out }
  }

  return NOTHING
}

/**
 * Every value a signal table carries, put back into plain form.
 *
 * The table is a list of `{key, value}` entries under one or more scopes, and
 * only an entry whose value fits the tagged grammar is taken, so the page's
 * own configuration — which uses the same shape of object, but holds ordinary
 * strings — is left alone. What comes back is the conversation state the
 * browser would have drawn, offered to the same readers as an export file.
 */
export function octaneValues(parsed: unknown): unknown[] {
  const out: unknown[] = []
  // The table can sit under a dozen levels of the page's own configuration,
  // so the walk is bounded by nodes rather than by depth alone: a script with
  // two hundred thousand objects in it is a bundler, not a conversation.
  let seen = 0
  const visit = (node: unknown, depth: number): void => {
    if (depth > MAX_DEPTH || out.length >= MAX_VALUES || ++seen > MAX_CELLS) return
    if (Array.isArray(node)) {
      for (const each of node) visit(each, depth + 1)
      return
    }
    if (node === null || typeof node !== 'object') return
    const record = node as JsonRecord
    const key = record.key
    if (typeof key === 'string' && 'value' in record && Object.keys(record).length <= 4) {
      const decoded = decodeTagged(record.value, { used: 0, depth: 0 })
      // A single string or number is a setting, not a conversation; only the
      // composites can hold turns, and only they are worth offering.
      if (
        decoded.ok &&
        decoded.value !== null &&
        typeof decoded.value === 'object' &&
        out.length < MAX_VALUES
      ) {
        out.push(decoded.value)
      }
    }
    for (const value of Object.values(record)) visit(value, depth + 1)
  }
  visit(parsed, 0)
  return out
}

/* ------------------------------------------------------------------ *
 * Google's AF_initDataCallback
 * ------------------------------------------------------------------ */

/**
 * The arrays inside a page's `AF_initDataCallback` calls.
 *
 * Google writes its data as one JSON array in the middle of a JavaScript
 * call, keyed by `data:` rather than quoted, so an ordinary JSON scan of the
 * script finds the call and then gives up on it. The array itself is
 * positional, which is why the reader that takes it over has to know which
 * position says who spoke.
 */
export function afInitDataValues(text: string): unknown[] {
  const out: unknown[] = []
  let at = 0
  while (out.length < MAX_VALUES) {
    const call = text.indexOf('AF_initDataCallback', at)
    if (call === -1) break
    const label = text.indexOf('data:', call)
    if (label === -1) break
    let start = label + 'data:'.length
    while (start < text.length && /[\s]/.test(text[start]!)) start += 1
    const span = jsonSpan(text, start)
    if (span) {
      try {
        out.push(JSON.parse(span))
      } catch {
        /* Not JSON after all: this call was something else wearing the name. */
      }
      at = start + span.length
      continue
    }
    at = label + 5
  }
  return out
}

/* ------------------------------------------------------------------ *
 * React Server `__next_f` chunks
 * ------------------------------------------------------------------ */

/** The quoted run starting at `from`, with its escapes resolved. */
function quotedRun(text: string, from: number): { value: string; end: number } | null {
  if (text[from] !== '"') return null
  let end = from + 1
  while (end < text.length) {
    if (text[end] === '\\') {
      end += 2
      continue
    }
    if (text[end] === '"') break
    end += 1
  }
  const inner = text.slice(from + 1, end)
  if (end >= text.length && inner.length === 0) return null
  try {
    return { value: JSON.parse(`"${inner}"`) as string, end: end + 1 }
  } catch {
    return null
  }
}

/**
 * The React Server payload of a script, with its chunks joined back together.
 *
 * A flight payload is one document cut into pieces and pushed a piece at a
 * time, and a value that opens in one chunk closes in another. Reading each
 * chunk on its own therefore finds nothing to parse; the chunks are
 * concatenated in document order first, which is the order the framework
 * itself puts them back in.
 */
export function flightChunks(text: string): string {
  const parts: string[] = []
  let at = 0
  let total = 0
  while (parts.length < MAX_VALUES * 40) {
    const call = text.indexOf('__next_f.push(', at)
    if (call === -1) break
    const quote = text.indexOf('"', call)
    if (quote === -1) break
    const run = quotedRun(text, quote)
    if (!run) {
      at = quote + 1
      continue
    }
    parts.push(run.value)
    total += run.value.length
    at = run.end
    // A page that keeps pushing past a few megabytes of chunks is not a
    // conversation, and joining it would only cost the tab its frame.
    if (total > 8_000_000) break
  }
  return parts.join('')
}
