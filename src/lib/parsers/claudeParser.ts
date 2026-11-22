import { extractBlocks } from '@/lib/parsers/blockExtractor'
import { buildResult, notParsed, titleFrom, type ParseResult } from '@/lib/parsers/envelope'
import { asArray, asNumber, asRecord, asString, asText, shorten, timestampFrom, type JsonRecord } from '@/lib/parsers/json'
import { newId } from '@/services/documentService'
import type { ContentBlock } from '@/types/conversation'
import type { MessageRole, NormalizedMessage } from '@/types/document'
import type { ParsedConversationResult } from '@/types/import'

/**
 * Claude export reader.
 *
 * Claude has used a few shapes for the same chat: `chat_messages` from the
 * per-conversation download, a plain `messages` list from the account
 * export, and the same list wrapped in a `chat` or `conversation` object.
 * They differ in where the list lives, not in what a message holds, so this
 * file unwraps first and reads once.
 *
 * A message's body is either a string or a list of typed blocks — text,
 * tool use, images, attachments. Text goes through the same scanner as
 * everything else; the rest becomes a `file` or `unsupported` block with a
 * warning. Nothing that the export wrote down is discarded on the way past.
 */

const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? '' : 's'}`

/** Bytes an inline base64 payload holds, counted without decoding it. */
function inlineBytes(value: string): number | undefined {
  const cleaned = value.replace(/^data:[^,]*,/, '').replace(/\s+/g, '')
  if (cleaned.length === 0) return undefined
  // Three characters per byte, minus the padding the encoder added at the end.
  const padding = cleaned.endsWith('==') ? 2 : cleaned.endsWith('=') ? 1 : 0
  return Math.max(0, Math.floor((cleaned.length * 3) / 4) - padding)
}

/** An image, document or attachment, whether the bytes came with it or not. */
function mediaBlock(record: JsonRecord, notes: string[], at: string): ContentBlock {
  const source = asRecord(record.source) ?? record
  const data = asText(source.data) ?? asText(source.base64)
  const url = asText(source.url) ?? asText(source.link)
  const mimeType = asText(source.media_type) ?? asText(record.mime_type)
  const name =
    asText(record.title) ??
    asText(record.filename) ??
    asText(record.name) ??
    (mimeType ? `attachment.${mimeType.split('/')[1] ?? 'bin'}` : 'attachment')

  if (data !== undefined) {
    notes.push(
      `${at}: a ${mimeType ?? 'binary'} file is carried inline in this export. Its size is kept; an Exact Conversation document does not store the bytes yet.`,
    )
    return {
      kind: 'file',
      name,
      mimeType,
      sizeBytes: inlineBytes(data),
      note: 'Inline attachment in the export, kept as a reference until binary assets are stored.',
    }
  }

  notes.push(
    `${at}: ${shorten(url ?? name, 40)} is named by this export but its bytes are not in it, so it is kept as a reference.`,
  )
  return {
    kind: 'file',
    name,
    mimeType,
    sizeBytes: asNumber(record.size_bytes) ?? asNumber(record.size),
    note: url ? `${url} is a reference; the bytes are not in this export.` : 'Claude names this file; the bytes are not in this export.',
  }
}

/** The typed blocks Claude puts inside a message, in order. */
function blocksFromBlocks(parts: unknown[], notes: string[], at: string): ContentBlock[] {
  const blocks: ContentBlock[] = []
  let pending: string[] = []

  const flush = () => {
    if (pending.length === 0) return
    // The export does not record how its text blocks were separated, so a
    // blank line is used: every character survives, and a code fence that
    // spans two blocks is scanned as one fence.
    blocks.push(...extractBlocks(pending.join('\n\n')))
    pending = []
  }

  const markUnsupported = (type: string) => {
    flush()
    notes.push(`${at}: a ${type} block of this turn is Claude's own element, not text, so it is kept as a marker.`)
    blocks.push({ kind: 'unsupported', reason: `Claude ${type} block`, elementType: type })
  }

  for (const part of parts) {
    if (typeof part === 'string') {
      pending.push(part)
      continue
    }
    const record = asRecord(part)
    if (!record) {
      flush()
      notes.push(`${at}: a block of this message is not something Claude describes as content.`)
      continue
    }

    const type = asText(record.type) ?? ''
    if (type === 'image' || type === 'document' || type === 'file' || type === 'attachment') {
      flush()
      blocks.push(mediaBlock(record, notes, at))
      continue
    }

    const text = asText(record.text) ?? asText(record.thinking)
    if (type === 'thinking' || type === 'redacted_thinking') {
      if (text !== undefined) {
        notes.push(`${at}: the export includes the model's reasoning text for this turn. It is kept exactly as written.`)
        pending.push(text)
      } else markUnsupported(type)
      continue
    }
    if (type === 'tool_result') {
      const inner = asArray(record.content)
      if (inner.length > 0) {
        blocks.push(...blocksFromBlocks(inner, notes, at))
      } else if (typeof record.content === 'string') {
        pending.push(record.content)
      } else markUnsupported(type)
      continue
    }
    if (text !== undefined) {
      pending.push(text)
      // A cited reply carries its sources next to the sentence, and a source
      // is a link the user can still follow, so they are kept as blocks.
      const cited = asArray(record.citations)
      if (cited.length > 0) {
        flush()
        for (const entry of cited) {
          const citation = asRecord(entry)
          const href = citation ? asText(citation.url) : undefined
          const label = citation ? asText(citation.title) : undefined
          if (href && label) {
            blocks.push({ kind: 'link', href, label })
            continue
          }
          notes.push(`${at}: a citation in this turn names no web address, so it is kept as a marker.`)
          blocks.push({ kind: 'unsupported', reason: 'Claude citation with no URL', elementType: 'citation' })
        }
      }
      continue
    }
    if (type === '' || type === 'text') {
      flush()
      notes.push(`${at}: a block of this turn holds no text that could be read from the export.`)
      blocks.push({ kind: 'unsupported', reason: 'Claude block with no readable text', elementType: type.length > 0 ? type : undefined })
      continue
    }
    markUnsupported(type)
  }

  flush()
  return blocks
}

/** One Claude message, from whichever field the export kept its body in. */
function blocksOf(message: JsonRecord, notes: string[], at: string): ContentBlock[] {
  if (Array.isArray(message.content)) return blocksFromBlocks(message.content, notes, at)
  if (typeof message.content === 'string') return extractBlocks(message.content)
  if (Array.isArray(message.text)) return blocksFromBlocks(message.text, notes, at)
  if (typeof message.text === 'string') return extractBlocks(message.text)
  if (message.content !== undefined || message.text !== undefined) {
    notes.push(
      `${at}: Claude wrote this turn in a shape this reader could not parse, so it is kept as a marker instead of being left out.`,
    )
    return [{ kind: 'unsupported', reason: 'Claude turn in an unreadable shape' }]
  }
  return []
}

/** `sender: human|assistant` is the export's own wording for who talked. */
function roleOf(message: JsonRecord, notes: string[], at: string): MessageRole {
  const label = (
    asString(message.sender) ??
    asString(message.role) ??
    asString(asRecord(message.author)?.role) ??
    ''
  ).toLowerCase()
  if (label === 'human' || label === 'user') return 'user'
  if (label === 'assistant' || label === 'ai' || label === 'bot') return 'assistant'
  if (label === 'system') return 'system'
  if (label) {
    notes.push(
      `${at}: the export calls this speaker "${label}", which is not a role PromptPaper keeps. It is stored as a system turn — check it before saving.`,
    )
    return 'system'
  }
  notes.push(
    `${at}: the export does not say who wrote this turn. It is stored as an assistant turn — check it before saving.`,
  )
  return 'assistant'
}

function messagesFromList(items: unknown[], notes: string[]): NormalizedMessage[] {
  const messages: NormalizedMessage[] = []
  let blank = 0

  for (const item of items) {
    const message = asRecord(item)
    if (!message) continue

    const at = `Turn ${messages.length + 1}`
    const content = blocksOf(message, notes, at)
    if (content.length === 0) {
      blank += 1
      continue
    }

    // Claude lists attachments beside the message rather than inside it, so
    // they arrive after the text they came with.
    for (const entry of asArray(message.attachments ?? message.files)) {
      const attachment = asRecord(entry)
      if (attachment) content.push(mediaBlock(attachment, notes, at))
    }

    const kept: Record<string, unknown> = {}
    const uuid = asText(message.uuid) ?? asText(message.id)
    if (uuid) kept.source_message_id = uuid
    const model = asText(message.model) ?? asText(message.model_name)
    if (model) kept.model_slug = model

    messages.push({
      id: newId(),
      role: roleOf(message, notes, at),
      content,
      sequence: messages.length,
      timestamp: timestampFrom(
        message.created_at,
        message.createdAt,
        message.create_time,
        message.timestamp,
      ),
      metadata: Object.keys(kept).length > 0 ? kept : undefined,
    })
  }

  if (blank > 0) {
    notes.push(
      blank === 1
        ? '1 message in this export held no content at all, so it is not shown. Nothing was taken from the others.'
        : `${plural(blank, 'message')} in this export held no content at all, so they are not shown. Nothing was taken from the others.`,
    )
  }
  return messages
}

/**
 * One conversation, however the export wrapped it.
 *
 * A per-chat download puts `chat_messages` at the top level; the account
 * export nests the same list inside `chat` or `conversation`. The list is
 * the same either way, so only the unwrapping differs.
 */
function conversationResult(raw: JsonRecord, position: number): ParsedConversationResult | null {
  const nested = asRecord(raw.chat) ?? asRecord(raw.conversation) ?? asRecord(raw.chat_data)
  const from = (source: JsonRecord) =>
    asArray(source.chat_messages).length > 0 ? asArray(source.chat_messages) : asArray(source.messages)
  const list = from(raw).length > 0 ? from(raw) : nested ? from(nested) : []
  if (list.length === 0) return null

  const notes: string[] = []
  const messages = messagesFromList(list, notes)
  if (messages.length === 0) return null

  // A model named once for the chat still describes every reply in it.
  const named = asText(raw.model_name) ?? asText(raw.model) ?? asText(nested?.model_name)
  if (named && messages.every((message) => message.metadata?.model_slug === undefined)) {
    for (const message of messages) {
      message.metadata = { ...message.metadata, model_slug: named }
    }
  }

  const firstText = messages[0]!.content.find(
    (block): block is Extract<ContentBlock, { kind: 'text' }> => block.kind === 'text',
  )
  return buildResult({
    title:
      asText(raw.title) ??
      asText(raw.name) ??
      asText(nested?.title) ??
      titleFrom(firstText?.text ?? '', 'Untitled Claude conversation'),
    provider: 'claude',
    messages,
    warnings: notes,
    sourceId: asText(raw.uuid) ?? asText(raw.id) ?? `claude-conversation-${position + 1}`,
    createdAt: timestampFrom(raw.created_at, raw.create_time, nested?.created_at),
  })
}

export function claudeConversations(parsed: unknown): ParseResult {
  const items = Array.isArray(parsed) ? parsed : [parsed]
  const results: ParsedConversationResult[] = []
  let unreadable = 0

  items.forEach((item, position) => {
    const record = asRecord(item)
    if (!record) return
    const result = conversationResult(record, position)
    if (result) results.push(result)
    else unreadable += 1
  })

  if (results.length === 0) {
    return notParsed(
      'No Claude conversation was found in this JSON. A Claude export keeps its turns in a "chat_messages" or "messages" list — if this is another provider\'s file, choose that source instead.',
    )
  }

  const notes =
    unreadable > 0
      ? [
          unreadable === 1
            ? '1 entry in this file could not be read as a Claude conversation and is not listed. Nothing was saved for it.'
            : `${plural(unreadable, 'entry')} in this file could not be read as a Claude conversation and are not listed. Nothing was saved for them.`,
        ]
      : undefined
  return { ok: true, results, notes }
}
