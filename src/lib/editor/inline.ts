import { isFollowableHref } from '@/lib/links'
import type { InlineRun } from '@/types/conversation'

/**
 * The words of a paragraph, in the two shapes they are kept in.
 *
 * `InlineRun` is what the store holds and what every format draws; the
 * inline node is what the editor's document model holds while someone is
 * typing. This file is the only place that knows both, and it imports
 * nothing from TipTap — so an exporter can read a paragraph without the
 * editor's weight arriving in its bundle, and a TipTap upgrade cannot change
 * what a stored document means.
 *
 * The conversion loses nothing on purpose: a mark this product has no word
 * for is dropped while its words are kept, because the alternative is a file
 * that will not open.
 */

/** The formatting a stored run can carry. */
export type MarkName = 'bold' | 'italic' | 'code' | 'link'

/** A run of words as the editor's document model holds it. */
export interface InlineNode {
  type: string
  text?: string
  marks?: { type: string; attrs?: Record<string, unknown> }[]
}

/** A line the reader broke with Shift+Enter, in the shape a string holds it. */
export const LINE_BREAK = '\n'

const MARK_FOR: { key: keyof Omit<InlineRun, 'text'>; mark: MarkName }[] = [
  { key: 'bold', mark: 'bold' },
  { key: 'italic', mark: 'italic' },
  { key: 'code', mark: 'code' },
]

export function runsToInline(runs: InlineRun[]): InlineNode[] {
  const nodes: InlineNode[] = []
  for (const run of runs) {
    if (run.text === LINE_BREAK && !run.bold && !run.italic && !run.code && !run.href) {
      nodes.push({ type: 'hardBreak' })
      continue
    }
    if (run.text.length === 0) continue
    const marks: { type: string; attrs?: Record<string, unknown> }[] = MARK_FOR.filter((entry) =>
      run[entry.key],
    ).map((entry) => ({ type: entry.mark }))
    if (run.href && isFollowableHref(run.href)) marks.push({ type: 'link', attrs: { href: run.href } })
    nodes.push(marks.length > 0 ? { type: 'text', text: run.text, marks } : { type: 'text', text: run.text })
  }
  return nodes
}

export function inlineToRuns(nodes: InlineNode[]): InlineRun[] {
  const runs: InlineRun[] = []
  for (const node of nodes) {
    if (node.type === 'hardBreak') {
      runs.push({ text: LINE_BREAK })
      continue
    }
    const text = node.text ?? ''
    if (text.length === 0) continue
    const run: InlineRun = { text }
    for (const mark of node.marks ?? []) {
      if (mark.type === 'bold') run.bold = true
      else if (mark.type === 'italic') run.italic = true
      else if (mark.type === 'code') run.code = true
      else if (mark.type === 'link') {
        const href = mark.attrs?.href
        if (typeof href === 'string' && isFollowableHref(href)) run.href = href
      }
    }
    runs.push(run)
  }
  return runs
}

/** The paragraph as one string, which is what an outline line reads. */
export function runsToPlainText(runs: InlineRun[]): string {
  return runs.map((run) => run.text).join('')
}

/** Words with no formatting on them are a `text` block, not a `rich` one. */
export function runsArePlain(runs: InlineRun[]): boolean {
  return runs.every((run) => !run.bold && !run.italic && !run.code && !run.href)
}

/** A paragraph holding a line break and nothing else is still plain. */
export function textToRuns(text: string): InlineRun[] {
  const lines = text.split(LINE_BREAK)
  const runs: InlineRun[] = []
  lines.forEach((line, index) => {
    if (index > 0) runs.push({ text: LINE_BREAK })
    if (line.length > 0) runs.push({ text: line })
  })
  return runs
}
