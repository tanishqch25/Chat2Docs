import { extractBlocks } from '@/lib/parsers/blockExtractor'
import { buildResult, notParsed, titleFrom, type ParseResult } from '@/lib/parsers/envelope'
import { asArray, asRecord, asText, shorten, timestampFrom, type JsonRecord } from '@/lib/parsers/json'
import { newId } from '@/services/documentService'
import type { ContentBlock } from '@/types/conversation'
import type { MessageRole, NormalizedMessage } from '@/types/document'
import type { ParsedConversationResult } from '@/types/import'

/**
 * Gemini export reader.
 *
 * Google Takeout gives Gemini conversations as `userData` entries whose
 * `conversation.turn` lists hold a `prompt` and one or more `response`
 * objects. Older exports, and the JSON a user can save from a chat, put the
 * same exchange under `User` and `Model` keys instead. Both are read here.
 *
 * A turn can carry several responses, because Gemini offers alternatives and
 * the file keeps all of them without saying which one was kept. They are all
 * imported and counted in a warning: picking one would mean deciding for the
 * user which of their own replies they wanted.
 */

const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? '' : 's'}`

/** Text out of whichever of Gemini's three ways of writing it was used. */
function blocksOf(value: unknown, notes: string[], at: string): ContentBlock[] {
  const blocks: ContentBlock[] = []
  let pending: string[] = []

  const flush = () => {
    if (pending.length === 0) return
    blocks.push(...extractBlocks(pending.join('\n\n')))
    pending = []
  }

  const visit = (item: unknown) => {
    if (typeof item === 'string') {
      pending.push(item)
      return
    }
    // Gemini nests its text lists without warning: a turn can hold a list of
    // objects that each hold a list of strings. Going one level deep would
    // silently drop the third.
    if (Array.isArray(item)) {
      item.forEach(visit)
      return
    }
    const record = asRecord(item)
    if (!record) {
      if (item !== null && item !== undefined) {
        flush()
        notes.push(`${at}: a piece of this turn is written as a ${typeof item} in the export, which carries no words to keep.`)
        blocks.push({ kind: 'unsupported', reason: `Gemini text written as ${typeof item}` })
      }
      return
    }
    if (record.text !== undefined) {
      visit(record.text)
      return
    }
    // A response with no text is Gemini's own machinery — a tool run, a
    // canvas, generated media. The element is named, not invented.
    const kind = asText(record.messageType) ?? asText(record.type) ?? asText(record.kind)
    flush()
    notes.push(
      `${at}: a ${kind ?? 'textless'} part of this turn is a Gemini element rather than text, so it is kept as a marker.`,
    )
    blocks.push({
      kind: 'unsupported',
      reason: `Gemini ${kind ?? 'unreadable'} element`,
      elementType: kind,
    })
  }

  visit(value)
  flush()
  return blocks
}

const pushMessage = (
  messages: NormalizedMessage[],
  role: MessageRole,
  content: ContentBlock[],
  timestamp?: string,
) => {
  if (content.length === 0) return
  messages.push({ id: newId(), role, content, sequence: messages.length, timestamp })
}

/** Takeout: one exchange is a prompt plus every response kept for it. */
function messagesFromTurns(turns: unknown[], notes: string[]): NormalizedMessage[] {
  const messages: NormalizedMessage[] = []
  let alternatives = 0

  for (const item of turns) {
    const turn = asRecord(item)
    if (!turn) continue

    const at = `Turn ${messages.length + 1}`
    const prompt = asRecord(turn.prompt)
    pushMessage(
      messages,
      'user',
      blocksOf(prompt?.text ?? turn.prompt, notes, at),
      timestampFrom(prompt?.createTime, turn.timestamp),
    )

    const responses = (Array.isArray(turn.response) ? asArray(turn.response) : [turn.response]).filter(
      (response) => response !== undefined && response !== null,
    )
    if (responses.length > 1) alternatives += responses.length - 1
    for (const entry of responses) {
      const response = asRecord(entry)
      pushMessage(
        messages,
        'assistant',
        blocksOf(response?.text ?? entry, notes, `Turn ${messages.length + 1}`),
        timestampFrom(response?.createTime, response?.timestamp),
      )
    }
  }

  if (alternatives > 0) {
    notes.push(
      alternatives === 1
        ? '1 alternative response sits in these turns. The export does not say which answer was kept, so it is imported too — remove it if you did not read it.'
        : `${plural(alternatives, 'alternative response')} sit in these turns. The export does not say which answer was kept, so all are imported — remove the ones you did not read.`,
    )
  }
  return messages
}

/** The older shape, where one record holds one exchange under User/Model. */
function messagesFromPairs(pairs: JsonRecord[], notes: string[]): NormalizedMessage[] {
  const messages: NormalizedMessage[] = []
  for (const pair of pairs) {
    const at = `Turn ${messages.length + 1}`
    pushMessage(messages, 'user', blocksOf(pair.User, notes, at), timestampFrom(pair.timestamp, pair.created_at))
    // One timestamp per exchange: the reply is stamped with the same moment,
    // which is what the file actually says.
    pushMessage(messages, 'assistant', blocksOf(pair.Model, notes, at), timestampFrom(pair.timestamp, pair.created_at))
  }
  return messages
}

const isPair = (record: JsonRecord) => record.User !== undefined || record.Model !== undefined

/**
 * What a file says about a conversation, apart from its turns.
 *
 * The title can sit on the entry or inside `conversation`, and an older
 * export names neither — so the title is derived from the first thing the
 * user typed, which is what PromptPaper does with a paste.
 */
function assemble(
  facts: { title?: string; sourceId?: string; createdAt?: string },
  messages: NormalizedMessage[],
  notes: string[],
): ParsedConversationResult | null {
  if (messages.length === 0) return null
  const firstText = messages[0]!.content.find(
    (block): block is Extract<ContentBlock, { kind: 'text' }> => block.kind === 'text',
  )
  return buildResult({
    title: facts.title ?? titleFrom(firstText?.text ?? '', 'Untitled Gemini conversation'),
    provider: 'gemini',
    messages,
    warnings: notes,
    sourceId: facts.sourceId,
    createdAt: facts.createdAt,
  })
}

const namedFile = (entry: unknown): string => {
  const file = asRecord(entry)
  if (!file) return 'file'
  return shorten(asText(file.fileName) ?? asText(file.filename) ?? asText(file.name) ?? 'file', 30)
}

/** Files Gemini generated beside the chat, named by the export but not carried in it. */
function noteConversationFiles(
  conversation: JsonRecord,
  raw: JsonRecord,
  notes: string[],
): void {
  const files = asArray(conversation.aifile_infos ?? raw.aifile_infos)
  if (files.length === 0) return
  notes.push(
    files.length === 1
      ? `1 file is listed beside this conversation (${files.map(namedFile).join(', ')}). The JSON names it without carrying it, so it is not part of the document.`
      : `${plural(files.length, 'file')} are listed beside this conversation (${files
          .map(namedFile)
          .join(', ')}). The JSON names them without carrying them, so they are not part of the document.`,
  )
}

const recordsOnly = (values: unknown[]): JsonRecord[] =>
  values.map(asRecord).filter((record): record is JsonRecord => record !== null)

function conversationResult(raw: JsonRecord, position: number): ParsedConversationResult | null {
  const conversation = asRecord(raw.conversation) ?? raw
  const notes: string[] = []
  const turns = asArray(conversation.turn)
  const messages =
    turns.length > 0
      ? messagesFromTurns(turns, notes)
      : isPair(conversation)
        ? messagesFromPairs([conversation], notes)
        : []
  noteConversationFiles(conversation, raw, notes)
  return assemble(
    {
      title: asText(raw.title) ?? asText(conversation.title),
      sourceId: asText(raw.conversationId) ?? asText(raw.id) ?? `gemini-conversation-${position + 1}`,
      createdAt: timestampFrom(raw.create_time, raw.creation_time, conversation.timestamp),
    },
    messages,
    notes,
  )
}

export function geminiConversations(parsed: unknown): ParseResult {
  const top = asRecord(parsed)
  const results: ParsedConversationResult[] = []

  if (top) {
    const userData = recordsOnly(asArray(top.userData))
    const conversations = userData.length > 0 ? userData : [top]
    conversations.forEach((record, position) => {
      const result = conversationResult(record, position)
      if (result) results.push(result)
    })
  } else {
    const entries = recordsOnly(asArray(parsed))
    if (entries.length > 0 && entries.every(isPair)) {
      // An array of User/Model exchanges is one conversation, not one
      // conversation per exchange.
      const pairNotes: string[] = []
      const result = assemble(
        { sourceId: 'gemini-conversation-1' },
        messagesFromPairs(entries, pairNotes),
        pairNotes,
      )
      if (result) results.push(result)
    } else {
      entries.forEach((record, position) => {
        const result = conversationResult(record, position)
        if (result) results.push(result)
      })
    }
  }

  if (results.length === 0) {
    return notParsed(
      'No Gemini conversation was found in this JSON. A Takeout file keeps its exchanges in a "turn" list under "userData"; an older export uses "User" and "Model" entries. If this is another provider\'s file, choose that source instead.',
    )
  }
  return { ok: true, results }
}
