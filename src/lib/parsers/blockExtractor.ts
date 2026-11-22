import type { ContentBlock } from '@/types/conversation'

/**
 * The deterministic markdown scanner every parser shares.
 *
 * It reads line by line and only ever moves text from one block into
 * another: nothing is rewritten, re-flowed or dropped. A line that matches
 * no rule joins the paragraph it belongs to, and a paragraph is emitted with
 * its newlines intact, so `blocksToText` of the result equals the input.
 *
 * No LLM and no heuristics that guess at meaning sit behind this. That is the
 * whole reason Exact Conversation can promise the same bytes back.
 */

const FENCE = /^(\s*)(`{3,}|~{3,})[ \t]*(.*)$/
const HEADING = /^(#{1,6})[ \t]+(.*)$/
const QUOTE = /^([ \t]*)>[ \t]?(.*)$/
const UNORDERED = /^([ \t]*)[-*+][ \t]+(.*)$/
const ORDERED = /^([ \t]*)\d+[.)][ \t]+(.*)$/
const TABLE_SEPARATOR = /^[ \t]*\|?[ \t]*:?-{1,}:?[ \t]*(\|[ \t]*:?-{1,}:?[ \t]*)*\|?[ \t]*$/
const MATH_FENCE = /^[ \t]*(\$\$+)(.*)$/

const isBlank = (line: string) => line.trim().length === 0

const isTableRow = (line: string) => line.includes('|')

function cells(line: string): string[] {
  return line
    .trim()
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map((cell) => cell.trim())
}

/** Closing fence: same marker character, at least as long, nothing after it. */
function closesFence(line: string, marker: string, length: number): boolean {
  const match = new RegExp(`^[ \\t]*\\${marker[0]!}{${length},}[ \\t]*$`).exec(line)
  return match !== null
}

export function extractBlocks(text: string): ContentBlock[] {
  const blocks: ContentBlock[] = []
  const lines = text.split('\n')
  let paragraph: string[] = []
  let index = 0

  const flush = () => {
    if (paragraph.length === 0) return
    blocks.push({ kind: 'text', text: paragraph.join('\n') })
    paragraph = []
  }

  while (index < lines.length) {
    const line = lines[index]!

    const fence = FENCE.exec(line)
    if (fence) {
      const [, , marker, info] = fence
      const collected: string[] = []
      index += 1
      // An unterminated fence keeps everything after it as code rather than
      // pretending the rest of the message was prose.
      while (index < lines.length && !closesFence(lines[index]!, marker!, marker!.length)) {
        collected.push(lines[index]!)
        index += 1
      }
      index += 1
      flush()
      blocks.push({
        kind: 'code',
        code: collected.join('\n'),
        language: (info ?? '').trim().split(/\s+/)[0] || 'text',
      })
      continue
    }

    const math = MATH_FENCE.exec(line)
    if (math) {
      const [, opener, rest] = math
      const closed = rest.trimEnd().endsWith(opener!) && rest.trim().length > opener!.length
      const body = closed ? rest.trim().slice(0, -opener!.length) : rest
      const collected = body.length > 0 ? [body] : []
      if (!closed) {
        index += 1
        while (index < lines.length) {
          const next = lines[index]!
          index += 1
          if (next.trim().endsWith(opener!)) {
            const tail = next.trim().slice(0, -opener!.length)
            if (tail.length > 0) collected.push(tail)
            break
          }
          collected.push(next)
        }
      } else {
        index += 1
      }
      flush()
      blocks.push({ kind: 'math', expression: collected.join('\n'), display: true })
      continue
    }

    const heading = HEADING.exec(line)
    if (heading) {
      flush()
      blocks.push({
        kind: 'heading',
        level: heading[1]!.length as 1 | 2 | 3 | 4 | 5 | 6,
        text: heading[2]!.trim(),
      })
      index += 1
      continue
    }

    // A pipe table is only a table when the GFM separator row follows it.
    if (
      isTableRow(line) &&
      index + 1 < lines.length &&
      TABLE_SEPARATOR.test(lines[index + 1]!) &&
      lines[index + 1]!.includes('-')
    ) {
      const headers = cells(line)
      index += 2
      const rows: string[][] = []
      while (index < lines.length && isTableRow(lines[index]!) && !isBlank(lines[index]!)) {
        rows.push(cells(lines[index]!))
        index += 1
      }
      flush()
      blocks.push({ kind: 'table', headers, rows })
      continue
    }

    if (QUOTE.test(line)) {
      const collected: string[] = []
      while (index < lines.length) {
        const quote = QUOTE.exec(lines[index]!)
        if (!quote) break
        collected.push(quote[2]!)
        index += 1
      }
      flush()
      blocks.push({ kind: 'blockquote', text: collected.join('\n') })
      continue
    }

    const unordered = UNORDERED.exec(line)
    const ordered = unordered ? null : ORDERED.exec(line)
    if (unordered || ordered) {
      // One list type per block: a number after a bullet is a different list,
      // so it ends this one instead of being folded into it.
      const isOrdered = ordered !== null
      const items: string[] = []
      while (index < lines.length) {
        const next = lines[index]!
        const match = isOrdered ? ORDERED.exec(next) : UNORDERED.exec(next)
        if (match) {
          items.push(match[2]!)
          index += 1
          continue
        }
        // An indented line under an item belongs to that item, kept with its
        // own newline rather than folded into the sentence above it.
        if (items.length > 0 && !isBlank(next) && /^[ \t]+\S/.test(next)) {
          items[items.length - 1] = `${items[items.length - 1]}\n${next.trim()}`
          index += 1
          continue
        }
        break
      }
      flush()
      blocks.push({ kind: 'list', ordered: isOrdered, items })
      continue
    }

    if (isBlank(line)) {
      flush()
      index += 1
      continue
    }

    paragraph.push(line)
    index += 1
  }

  flush()
  return blocks
}
