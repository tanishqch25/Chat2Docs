import { extractBlocks } from '@/lib/parsers/blockExtractor'
import { buildResult, titleFrom } from '@/lib/parsers/envelope'
import { newId } from '@/services/documentService'
import type { DocumentProvider, MessageRole, NormalizedMessage } from '@/types/document'
import type { ParsedConversationResult } from '@/types/import'

/**
 * Copy-and-paste import.
 *
 * A pasted thread has no schema, so the only safe boundaries are the ones
 * the text itself states: a speaker label at the start of a line, or a
 * heading that names a speaker. Anything else — splitting on blank lines,
 * alternating turns, guessing who talked — would invent structure the user
 * did not paste, so it is not done. With no labels at all the whole paste is
 * kept as a single turn and the preview invites the user to set the
 * boundaries themselves.
 */

interface Marker {
  role: MessageRole
  /** The label as written, kept so provider detection stays honest. */
  label: string
}

const LABELS: { re: RegExp; role: MessageRole }[] = [
  { re: /^(you|user|human|prompt)$/i, role: 'user' },
  { re: /^(chatgpt|assistant|gemini|claude|model|ai|bot)$/i, role: 'assistant' },
  { re: /^(system|tool)$/i, role: 'system' },
]

/** `You:` / `**You:**` / `## You` / `### ChatGPT:` at the start of a line. */
function matchMarker(line: string): { marker: Marker; rest: string } | null {
  const heading = /^[ \t]*(#{1,6})[ \t]+(.*)$/.exec(line)
  const body = heading ? heading[2]! : line
  const bold = /^[ \t]*\*\*(.+?)\*\*[ \t]*:?[ \t]*(.*)$/.exec(body)
  const plain = /^[ \t]*([^:\n]{1,24}):[ \t]*(.*)$/.exec(body)
  const candidate = bold ?? plain
  if (!candidate) return null
  const label = candidate[1]!.trim().replace(/[ \t]+$/, '')
  const found = LABELS.find((entry) => entry.re.test(label))
  if (!found) return null
  return { marker: { role: found.role, label }, rest: (candidate[2] ?? '').replace(/^[ \t]+/, '') }
}

const FENCE_LINE = /^[ \t]*(`{3,}|~{3,})/

const providerOf = (labels: string[]): DocumentProvider => {
  const text = labels.join(' ').toLowerCase()
  if (/chatgpt|gpt/.test(text)) return 'chatgpt'
  if (/gemini/.test(text)) return 'gemini'
  if (/claude/.test(text)) return 'claude'
  return 'generic'
}

export function parsePaste(text: string, hint?: DocumentProvider): ParsedConversationResult {
  const warnings: string[] = []
  const lines = text.split('\n')
  const turns: { marker: Marker; lines: string[] }[] = []
  const labels: string[] = []
  let current: { marker: Marker; lines: string[] } | null = null
  let insideFence = false
  let opensWithText = false

  for (const line of lines) {
    if (FENCE_LINE.test(line)) insideFence = !insideFence

    const hit = insideFence ? null : matchMarker(line)
    if (hit) {
      // A marker inside a code sample is part of the sample, not a speaker.
      if (current) turns.push(current)
      current = { marker: hit.marker, lines: hit.rest.length > 0 ? [hit.rest] : [] }
      labels.push(hit.marker.label)
      continue
    }

    if (!current) {
      if (line.trim().length === 0) continue
      // Text before the first label still belongs to the thread, and it is
      // reported rather than folded silently into the turn below it.
      current = { marker: { role: 'user', label: '' }, lines: [line] }
      opensWithText = true
      continue
    }
    current.lines.push(line)
  }
  if (current) turns.push(current)

  if (labels.length === 0) {
    // Not one label in the whole paste: the only honest reading is that it
    // is all one voice, and the user is told the boundaries are theirs to
    // set. Splitting it into alternating turns would invent a conversation.
    warnings.push(
      'No speaker labels were found, so the whole paste is kept as one turn. Set the boundaries below before saving.',
    )
  } else if (opensWithText) {
    warnings.push(
      'The paste opens with lines before any speaker label. They are kept as their own turn.',
    )
  }

  const messages: NormalizedMessage[] = []
  let dropped = 0
  for (const turn of turns) {
    const body = turn.lines.join('\n')
    if (body.trim().length === 0) {
      dropped += 1
      continue
    }
    messages.push({
      id: newId(),
      role: turn.marker.role,
      content: extractBlocks(body),
      sequence: messages.length,
    })
  }
  if (dropped > 0) {
    warnings.push(
      `${dropped} empty turn${dropped === 1 ? '' : 's'} left after splitting the paste and ${dropped === 1 ? 'was' : 'were'} dropped — no text was removed with them.`,
    )
  }

  const provider = hint ?? providerOf(labels)
  const firstUser = messages.find((message) => message.role === 'user')
  const firstLine = (firstUser?.content[0] as { text?: string } | undefined)?.text ?? lines[0] ?? ''

  return buildResult({
    title: titleFrom(firstLine),
    provider,
    messages,
    warnings,
  })
}
