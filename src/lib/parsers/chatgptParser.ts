import { extractBlocks } from '@/lib/parsers/blockExtractor'
import { buildResult, notParsed, titleFrom, type ParseResult } from '@/lib/parsers/envelope'
import {
  asArray,
  asNumber,
  asRecord,
  asString,
  asText,
  isFlagged,
  shorten,
  timestampFrom,
  type JsonRecord,
} from '@/lib/parsers/json'
import { newId } from '@/services/documentService'
import type { ContentBlock } from '@/types/conversation'
import type { MessageRole, NormalizedMessage } from '@/types/document'
import type { ParsedConversationResult } from '@/types/import'

/**
 * ChatGPT export reader.
 *
 * Three shapes arrive here, because OpenAI has shipped all three: one
 * conversation object (the export button on a chat), a list of them
 * (`conversations.json` in the account archive), and the archive itself — a
 * `.zip`, unwrapped in the browser and never leaving it.
 *
 * What the user sees is decided by the DAG. A ChatGPT conversation is not a
 * list but a tree of regenerations and edits held in `mapping`, where every
 * node names its `parent` and the conversation names the `current_node` on
 * screen. Walking backwards from that node rebuilds the branch actually
 * read, in order. Everything off it is counted and reported rather than
 * quietly removed: a regenerated reply is content the user wrote.
 *
 * No model is called and no text is rewritten. An element that cannot be
 * represented becomes an `unsupported` or `file` block plus a warning, so
 * the turn still exists in the saved document.
 */

/** OpenAI marks the root of the tree with a NUL string, not an absent field. */
const NULL_PARENT = '\u0000'

/** Content types ChatGPT describes as readable text. */
const TEXTUAL = new Set(['text', 'multimodal_text'])

const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? '' : 's'}`

const basename = (path: string) => path.split('/').pop() ?? path

/** A pointer to bytes this export does not carry: an upload, a generated image. */
function attachmentBlock(pointer: string, part: JsonRecord, notes: string[], at: string): ContentBlock {
  const name =
    asText(part.filename) ?? asText(part.name) ?? asText(part.file_id) ?? shorten(pointer, 40)
  notes.push(
    `${at}: ${shorten(pointer, 60)} points at a file this export does not carry, so it is kept as a reference.`,
  )
  return {
    kind: 'file',
    name,
    mimeType: asText(part.mimetype) ?? asText(part.mime_type),
    sizeBytes: asNumber(part.bytes) ?? asNumber(part.size_bytes),
    note: `${pointer} is a reference; the bytes are not in this export.`,
  }
}

/**
 * One turn's parts, in the order the export lists them.
 *
 * A reply often arrives split into several text parts, so consecutive text
 * is scanned together rather than part by part: a code fence that straddles
 * two parts stays one fence, which is the difference between preserving a
 * block of code and preserving a mangled one.
 */
function blocksFromParts(parts: unknown[], notes: string[], at: string): ContentBlock[] {
  const blocks: ContentBlock[] = []
  let pending: string[] = []

  const flush = () => {
    if (pending.length === 0) return
    blocks.push(...extractBlocks(pending.join('\n\n')))
    pending = []
  }

  for (const part of parts) {
    if (typeof part === 'string') {
      pending.push(part)
      continue
    }
    const record = asRecord(part)
    if (!record) {
      flush()
      notes.push(`${at}: a piece of this turn was not text and could not be read from the export.`)
      continue
    }

    const pointer =
      asText(record.asset_pointer) ??
      asText(record.image_asset_pointer) ??
      asText(record.sandbox_file)
    if (pointer) {
      flush()
      blocks.push(attachmentBlock(pointer, record, notes, at))
      continue
    }

    const type = asText(record.content_type) ?? ''
    if (type === 'search_link') {
      const href = asText(record.url) ?? asText(record.source_url)
      const label = asText(record.title) ?? href
      if (href && label) {
        flush()
        blocks.push({ kind: 'link', href, label })
        continue
      }
    }

    const inline = asText(record.text) ?? asText(record.content)
    if (inline !== undefined) {
      pending.push(inline)
      // Canvas and browse widgets sometimes do carry their words in the
      // export. The words are kept; the widget around them is what is lost,
      // and that is worth saying out loud.
      if (type.length > 0 && !TEXTUAL.has(type)) {
        notes.push(
          `${at}: a ${type} element of this turn did carry text, so the words are kept; the element itself is not drawn.`,
        )
      }
      continue
    }

    flush()
    notes.push(
      `${at}: a ${type || 'unrecognised'} part of this turn has no text in the export, so it is kept as a marker.`,
    )
    blocks.push({
      kind: 'unsupported',
      reason: `ChatGPT ${type || 'unrecognised'} element`,
      elementType: type.length > 0 ? type : undefined,
    })
  }

  flush()
  return blocks
}

function blocksFromContent(content: unknown, notes: string[], at: string): ContentBlock[] {
  if (typeof content === 'string') return extractBlocks(content)

  const record = asRecord(content)
  if (!record) {
    if (Array.isArray(content)) return blocksFromParts(content, notes, at)
    notes.push(`${at}: the export gave this turn a body that could not be read.`)
    return []
  }

  const type = asText(record.content_type) ?? ''

  if (type === 'code') {
    const code = asArray(record.parts)
      .filter((part) => typeof part === 'string')
      .join('\n')
    return [{ kind: 'code', code, language: asText(record.language) ?? 'text' }]
  }

  if (type === 'file_reference') {
    return [attachmentBlock(asText(record.pointer) ?? 'attachment', record, notes, at)]
  }

  if (type === 'error' || type === 'user_error') {
    const detail = asText(record.error_code) ?? asText(record.message)
    notes.push(
      `${at}: ChatGPT recorded an error for this turn${detail ? ` (${shorten(detail, 60)})` : ''}. The turn is kept; nothing was answered.`,
    )
    return [
      {
        kind: 'unsupported',
        reason: detail
          ? `ChatGPT error: ${shorten(detail, 60)}`
          : 'ChatGPT recorded an error for this turn',
        elementType: type,
      },
    ]
  }

  // Canvas edits, tool calls, browse output: real turns in the product,
  // described by the export as something other than text.
  if (type.length > 0 && !TEXTUAL.has(type)) {
    notes.push(
      `${at}: a ${type} element of this turn has no text in the export, so it is kept as a marker rather than dropped.`,
    )
    return [{ kind: 'unsupported', reason: `ChatGPT ${type} element`, elementType: type }]
  }

  const single = asText(record.text)
  if (single !== undefined && !Array.isArray(record.parts)) return extractBlocks(single)
  return blocksFromParts(asArray(record.parts), notes, at)
}

const parentPointer = (node: JsonRecord): string | undefined => {
  const parent = asString(node.parent)
  return parent && parent !== NULL_PARENT ? parent : undefined
}

const childPointers = (node: JsonRecord): string[] =>
  asArray(node.children).filter(
    (child): child is string => typeof child === 'string' && child !== NULL_PARENT,
  )

/**
 * The identifiers on the branch, oldest first.
 *
 * `current_node` is what makes a ChatGPT import exact rather than a guess.
 * The mapping holds every version ever generated; only the chain of parents
 * beneath this node is the conversation the user read.
 */
function branchIds(
  nodes: Map<string, JsonRecord>,
  currentNode: string | undefined,
  notes: string[],
): string[] {
  if (currentNode && nodes.has(currentNode)) {
    const chain: string[] = []
    let id: string | undefined = currentNode
    // A damaged tree can point a parent back at itself; the chain is what
    // stops that from becoming an endless walk.
    while (id && nodes.has(id) && !chain.includes(id)) {
      chain.push(id)
      id = parentPointer(nodes.get(id)!)
    }
    return chain.reverse()
  }

  notes.push(
    'This export does not name the message you were reading, so the newest reply at each fork was followed.',
  )
  const roots = [...nodes.keys()].filter((id) => parentPointer(nodes.get(id)!) === undefined)
  if (roots.length === 0) return []
  if (roots.length > 1) {
    notes.push(
      `${plural(roots.length, 'separate message tree')} in this conversation; only the first was read.`,
    )
  }
  const chain: string[] = []
  let id: string | undefined = roots[0]
  while (id && nodes.has(id) && !chain.includes(id)) {
    chain.push(id)
    const children = childPointers(nodes.get(id)!)
    // The last child is the newest answer at that point in the thread.
    id = children.length > 0 ? children[children.length - 1] : undefined
  }
  return chain
}

function roleOf(author: unknown, notes: string[], at: string): MessageRole {
  const label = (asString(author) ?? asString(asRecord(author)?.role) ?? '').toLowerCase()
  if (label === 'user' || label === 'assistant' || label === 'system') return label
  notes.push(
    `${at}: the export labels this speaker "${label || 'nothing'}", which is not a role PromptPaper keeps, so it is stored as a system turn.`,
  )
  return 'system'
}

/**
 * The branch as stored messages.
 *
 * `create_time` and `model_slug` are the two things an export knows that a
 * paste cannot: when each turn happened, and which model answered it. Both
 * are kept — the timestamp on the message, the slug and the source node
 * identifier in its metadata — because preserving the conversation includes
 * preserving what the file said about it.
 */
function messagesFromBranch(
  branch: string[],
  nodes: Map<string, JsonRecord>,
  conversation: JsonRecord,
  notes: string[],
): NormalizedMessage[] {
  const fallbackSlug = asText(conversation.model_slug)
  const messages: NormalizedMessage[] = []
  let blank = 0
  let hidden = 0

  for (const id of branch) {
    const turn = asRecord(nodes.get(id)!.message)
    // The tree's root node holds no message; it is only a hinge.
    if (!turn) continue

    const at = `Turn ${messages.length + 1}`
    const metadata = asRecord(turn.metadata)
    const absolute = asRecord(asRecord(metadata?.timestamp_)?.absolute)
    const isHidden = isFlagged(metadata?.is_visually_hidden_from_conversation)
    const content = blocksFromContent(turn.content, notes, at)
    if (content.length === 0) {
      blank += 1
      continue
    }

    const kept: Record<string, unknown> = { source_node_id: id }
    const slug = asText(metadata?.model_slug) ?? fallbackSlug
    if (slug) kept.model_slug = slug
    const status = asText(turn.status)
    if (status && status !== 'success') kept.status = status
    if (isHidden) kept.hidden_from_conversation = true
    if (isHidden) hidden += 1

    messages.push({
      id: newId(),
      role: isHidden ? 'system' : roleOf(turn.author, notes, at),
      content,
      sequence: messages.length,
      timestamp: timestampFrom(absolute?.sys, turn.create_time, turn.created_at),
      metadata: kept,
    })
  }

  if (blank > 0) {
    notes.push(
      blank === 1
        ? '1 message on this branch held nothing ChatGPT exported, so it is not shown. No text went with it.'
        : `${plural(blank, 'message')} on this branch held nothing ChatGPT exported, so they are not shown. No text went with them.`,
    )
  }
  if (hidden > 0) {
    notes.push(
      hidden === 1
        ? 'One turn was marked hidden from the conversation by ChatGPT — context it was given, not something either side said. Kept as a system turn.'
        : `${plural(hidden, 'turn')} were marked hidden from the conversation by ChatGPT — context it was given, not something either side said. Kept as system turns.`,
    )
  }
  return messages
}

/** One entry of an export, which is either a whole chat or the only chat. */
function conversationResult(raw: JsonRecord, position: number): ParsedConversationResult | null {
  const history = asRecord(raw.history)
  const mapping = asRecord(history?.mapping) ?? asRecord(raw.mapping)
  if (!mapping) return null

  const nodes = new Map<string, JsonRecord>()
  for (const [key, value] of Object.entries(mapping)) {
    const node = asRecord(value)
    if (node) nodes.set(key, node)
  }
  if (nodes.size === 0) return null

  const notes: string[] = []
  const branch = branchIds(
    nodes,
    asText(history?.current_node) ?? asText(raw.current_node),
    notes,
  )
  const messages = messagesFromBranch(branch, nodes, raw, notes)
  if (messages.length === 0) return null

  const onPath = new Set(branch)
  const offBranch = [...nodes.keys()].filter(
    (id) => !onPath.has(id) && asRecord(nodes.get(id)!.message) !== null,
  ).length
  if (offBranch > 0) {
    notes.push(
      offBranch === 1
        ? 'One message in this conversation sits on a branch that was not read — a reply regenerated or a prompt edited. Only the branch you were reading is imported.'
        : `${plural(offBranch, 'message')} in this conversation sit on other branches — replies regenerated, prompts edited. Only the branch you were reading is imported.`,
    )
  }

  const firstText = messages[0]!.content.find(
    (block): block is Extract<ContentBlock, { kind: 'text' }> => block.kind === 'text',
  )
  return buildResult({
    title: asText(raw.title) ?? titleFrom(firstText?.text ?? '', 'Untitled ChatGPT conversation'),
    provider: 'chatgpt',
    messages,
    warnings: notes,
    sourceId: asText(raw.id) ?? `chatgpt-conversation-${position + 1}`,
    createdAt: timestampFrom(raw.create_time, raw.create),
  })
}

/**
 * A ChatGPT JSON body, whether it holds one chat or every chat.
 *
 * An account file is an array; the export button gives an object. Both are
 * the same reader, because the only difference is how many times it runs.
 */
export function chatgptConversations(parsed: unknown): ParseResult {
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
      'No ChatGPT conversation was found in this JSON. A ChatGPT export keeps its messages in a "mapping" of nodes — if this is another provider\'s file, choose that source instead.',
    )
  }

  const notes =
    unreadable > 0
      ? [
          unreadable === 1
            ? '1 entry in this file could not be read as a ChatGPT conversation and is not listed. Nothing was saved for it.'
            : `${plural(unreadable, 'entry')} in this file could not be read as a ChatGPT conversation and are not listed. Nothing was saved for them.`,
        ]
      : undefined
  return { ok: true, results, notes }
}

/** A `conversations.json`, or the single-conversation file the button gives. */
function parseChatgptJson(text: string): ParseResult {
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch (error) {
    return notParsed(
      `ChatGPT exports are JSON, and this file is not readable JSON. ${error instanceof Error ? error.message : ''}`.trim(),
    )
  }
  return chatgptConversations(parsed)
}

/**
 * The account archive, read in the browser.
 *
 * `conversations.json` is the index and lists every chat, so the
 * per-conversation files beside it are reported as skipped rather than
 * imported twice. What else the archive holds — account, projects, memories
 * — is not conversation content, and the user is told that instead of being
 * left to wonder whether PromptPaper read it.
 */
export async function parseChatgptArchive(bytes: ArrayBuffer): Promise<ParseResult> {
  // Loaded only for an actual .zip, so the unzipping library never sits in
  // the bundle every visitor downloads to read a paste.
  const { default: JSZip } = await import('jszip')
  const zip = await JSZip.loadAsync(bytes).catch(() => null)
  if (!zip) {
    return notParsed(
      'This archive could not be opened. It may not be a .zip file, or the download may have been cut short.',
    )
  }

  const jsonFiles = Object.entries(zip.files).filter(
    ([path, file]) => !file.dir && path.toLowerCase().endsWith('.json'),
  )
  const isIndex = (path: string) => /^conversations(?:-\d+)?\.json$/i.test(basename(path))
  const indexFiles = jsonFiles.filter(([path]) => isIndex(path))
  const chatFiles = jsonFiles.filter(([path]) => !isIndex(path) && /conversation/i.test(path))
  const chosen = indexFiles.length > 0 ? indexFiles : chatFiles

  if (chosen.length === 0) {
    return notParsed(
      'No ChatGPT conversation file is inside this archive. An OpenAI export keeps them in conversations.json or in a conversations/ folder.',
    )
  }

  const notes: string[] = []
  if (indexFiles.length > 0 && chatFiles.length > 0) {
    notes.push(
      chatFiles.length === 1
        ? '1 file under conversations/ was not read separately — conversations.json already lists that chat.'
        : `${plural(chatFiles.length, 'file')} under conversations/ were not read separately — conversations.json already lists those chats.`,
    )
  }
  const other = jsonFiles.length - chosen.length - (indexFiles.length > 0 ? chatFiles.length : 0)
  if (other > 0) {
    notes.push(
      other === 1
        ? '1 other JSON file in the archive — account, project or memory data — holds no conversation and was not imported.'
        : `${plural(other, 'other JSON file')} in the archive — account, project and memory data — hold no conversation and were not imported.`,
    )
  }

  const results: ParsedConversationResult[] = []
  for (const [path, file] of chosen) {
    const outcome = parseChatgptJson(await file.async('string'))
    if (outcome.ok) results.push(...outcome.results)
    else notes.push(`${basename(path)}: ${outcome.reason}`)
  }

  if (results.length === 0) {
    return notParsed(
      notes[notes.length - 1] ?? 'This archive holds no ChatGPT conversation that could be read.',
    )
  }
  return { ok: true, results, notes }
}
