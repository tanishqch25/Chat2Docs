/**
 * The inline scanner.
 *
 * A conversation arrives holding marks the reader never meant to see: the
 * LaTeX delimiters ChatGPT writes around a formula, the two stars around a
 * bold word, and the tags the site used to draw a badge or an illustration.
 * This file turns one of those strings into the pieces it is really made
 * of, so every renderer can draw the piece instead of its markers.
 *
 * It is a scanner, not an interpreter: a fixed list of shapes, each tried at
 * each position in one pass, and anything that does not match one of them
 * stays the words it was. Nothing is re-flowed and nothing is dropped — the
 * words of every piece are always recoverable from it, which is what lets a
 * format that cannot draw a badge still write what the badge said.
 *
 * The tokens carry text, not HTML. Escaping, address checking and typesetting
 * belong to the renderer, because only a renderer knows whether it is
 * writing a page, a Word file or a plain-text one.
 */

export type InlineToken =
  | { kind: 'text'; text: string }
  | { kind: 'bold'; text: string }
  | { kind: 'italic'; text: string }
  | { kind: 'code'; text: string }
  | { kind: 'link'; text: string; href: string }
  | { kind: 'math'; expression: string; display: boolean }
  | { kind: 'badge'; text: string }
  | { kind: 'illustration'; text: string }
  | { kind: 'cite'; text: string; href?: string }
  | { kind: 'divider' }

/** A shape, matched at the current position rather than searched for. */
interface Rule {
  re: RegExp
  /** Null means the shape is markup that carries no words of its own and
   *  leaves the text around it where it was. */
  make: (match: RegExpExecArray) => InlineToken | null
}

/** `key="value"` or `key='value'` inside an opening tag. */
export function attributesOf(source: string): Record<string, string> {
  const out: Record<string, string> = {}
  for (const pair of source.matchAll(/([A-Za-z_][\w:-]*)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) {
    out[pair[1]!.toLowerCase()] = pair[2] ?? pair[3] ?? ''
  }
  return out
}

/** A formula has to hold something. `\(\)` is two delimiters, not maths. */
const mathToken = (expression: string, display: boolean): InlineToken | null => {
  const trimmed = expression.trim()
  return trimmed.length > 0
    ? { kind: 'math', expression: trimmed, display }
    : { kind: 'text', text: display ? `\\[${expression}\\]` : `\\(${expression}\\)` }
}

const words = (value: string | undefined): string => (value ?? '').replace(/\s+/g, ' ').trim()

/** Marks inside a mark: `**read \`this\` now**` is one bold phrase, and the
 *  backticks around its code are as unwanted as the stars around it. */
const plain = (value: string | undefined): string => words(inlinePlainText(value ?? ''))

/** The first attribute named that carries a word. */
const firstWord = (attributes: Record<string, string>, keys: string[]): string => {
  for (const key of keys) {
    const value = words(attributes[key])
    if (value.length > 0) return value
  }
  return ''
}

const RULES: Rule[] = [
  // Display maths the site writes in escaped brackets, then the inline pair
  // beside it. Both are tried before a backslash is taken as a character.
  { re: /\\\[([\s\S]+?)\\\]/y, make: (m) => mathToken(m[1]!, true) },
  { re: /\\\(([\s\S]+?)\\\)/y, make: (m) => mathToken(m[1]!, false) },
  // Inline code before a star, so a backtick-wrapped `*` stays the character
  // it names rather than opening emphasis.
  { re: /`([^`\n]+)`/y, make: (m) => ({ kind: 'code', text: m[1]! }) },
  { re: /\*\*([^\n]+?)\*\*/y, make: (m) => ({ kind: 'bold', text: plain(m[1]) }) },
  { re: /\*(?!\s)([^*\n]+?)(?<!\s)\*/y, make: (m) => ({ kind: 'italic', text: plain(m[1]) }) },
  {
    re: /\[([^\]\n]*)\]\(\s*([^()\s]+)\s*\)/y,
    make: (m) => ({ kind: 'link', text: m[1] ?? '', href: m[2]! }),
  },
  // ChatGPT's own drawing instructions. The words inside a badge are kept and
  // the tag that positioned it is not; a divider becomes a rule; an image the
  // site drew from a query becomes that query; a citation keeps what it cites
  // and never the internal reference the export gave it.
  { re: /<\s*divider\b[^>]*\/?\s*>/iy, make: () => ({ kind: 'divider' }) },
  {
    re: /<\s*badge\b[^>]*>([\s\S]+?)<\s*\/\s*badge\s*>/iy,
    make: (m) => {
      const text = plain(m[1])
      return text.length > 0 ? { kind: 'badge', text } : null
    },
  },
  {
    re: /<\s*async(?:imagegroup|image)\b([^>]*)\/?\s*>/iy,
    make: (m) => {
      const attributes = attributesOf(m[1]!)
      const query = firstWord(attributes, ['query', 'alt', 'title', 'prompt', 'name'])
      return query.length > 0 ? { kind: 'illustration', text: query } : null
    },
  },
  {
    re: /<\s*filecite\b([^>]*)\/?\s*>/iy,
    make: (m) => {
      const attributes = attributesOf(m[1]!)
      const text = firstWord(attributes, ['title', 'name', 'filename', 'source', 'query'])
      const href = firstWord(attributes, ['url', 'href', 'link'])
      if (text.length === 0 && href.length === 0) return null
      return href.length > 0 ? { kind: 'cite', text: text || href, href } : { kind: 'badge', text }
    },
  },
  // Wrappers that hold other marks: unwrapped, so what they carried reads as
  // the paragraph it was.
  { re: /<\s*\/?\s*(?:box|row|col|column|grid|stack|container)\b[^>]*\/?\s*>/iy, make: () => null },
]

const STARTS = new Set(['\\', '`', '*', '[', '<'])

/** One pass, first shape that fits at each position wins. */
export function tokenizeInline(source: string): InlineToken[] {
  const tokens: InlineToken[] = []
  let buffer = ''
  let index = 0

  const flush = () => {
    if (buffer.length === 0) return
    tokens.push({ kind: 'text', text: buffer })
    buffer = ''
  }

  while (index < source.length) {
    const character = source[index]!
    let rule: Rule | null = null
    let match: RegExpExecArray | null = null

    if (STARTS.has(character)) {
      for (const candidate of RULES) {
        candidate.re.lastIndex = index
        const found = candidate.re.exec(source)
        if (found && found[0].length > 0) {
          rule = candidate
          match = found
          break
        }
      }
    }

    if (!rule || !match) {
      buffer += character
      index += 1
      continue
    }

    const end = match.index + match[0].length
    const token = rule.make(match)
    flush()
    if (token) tokens.push(token)
    else {
      // A wrapper between two words keeps them apart; between two lines it
      // leaves the break the paragraph already has.
      const before = source[match.index - 1] ?? ''
      const after = source[end] ?? ''
      if (before.trim().length > 0 && after.trim().length > 0) tokens.push({ kind: 'text', text: ' ' })
    }
    index = end
  }

  flush()
  return mergeAdjacentText(tokens)
}

/** Two marks can end beside each other with nothing between them, and one
 *  run of words is one token, so a renderer never splits a word in two. */
function mergeAdjacentText(tokens: InlineToken[]): InlineToken[] {
  const out: InlineToken[] = []
  for (const token of tokens) {
    const last = out[out.length - 1]
    if (last && last.kind === 'text' && token.kind === 'text') last.text += token.text
    else out.push(token)
  }
  return out.filter((token) => token.kind !== 'text' || token.text.length > 0)
}

/** The words a piece of prose says, with every mark drawn off it. */
export function tokensToPlainText(tokens: InlineToken[]): string {
  return tokens
    .map((token) => {
      if (token.kind === 'divider') return ''
      if (token.kind === 'math') return token.expression
      if (token.kind === 'illustration') return `Illustration: ${token.text}`
      if (token.kind === 'cite') return token.href ? `${token.text} (${token.href})` : token.text
      return token.text
    })
    .join('')
}

export function inlinePlainText(source: string): string {
  return tokensToPlainText(tokenizeInline(source))
}
