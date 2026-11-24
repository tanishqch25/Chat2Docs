import * as db from '@/lib/storage/db'
import type { ContentBlock, InlineRun } from '@/types/conversation'
import {
  DOCUMENT_MODES,
  DOCUMENT_PROVIDERS,
  DOCUMENT_SCHEMA_VERSION,
  MESSAGE_ROLES,
} from '@/types/document'
import type {
  BackupEnvelope,
  DocumentMode,
  DocumentProvider,
  LocalDocument,
  MessageRole,
  NormalizedMessage,
} from '@/types/document'

/**
 * Domain operations for the local library: everything that decides what a
 * valid document is, as distinct from the mechanics of asking the browser to
 * hold it. Storage failures arrive here as the errors from `db.ts` and are
 * passed on untouched, so the UI explains them in one place.
 *
 * Two rules run through this file. Derived fields — `messageCount`,
 * `sizeBytes`, `sequence` — are always recalculated on a write and never
 * trusted from a draft or a backup file. And content is never rewritten on
 * the user's behalf: a message holding blocks the local editor cannot
 * represent is carried through exactly as it was.
 */

/** One line of the conversation as the composer holds it. */
export interface DraftTurn {
  key: string
  role: MessageRole
  text: string
  /** Kept so editing a document does not restamp when each turn happened. */
  timestamp?: string
  /** A message the local editor cannot rewrite, because it holds more than
   *  text. Held verbatim instead of being flattened into `text`. */
  keep?: NormalizedMessage
}

export interface DocumentDraft {
  title: string
  provider: DocumentProvider
  mode: DocumentMode
  turns: DraftTurn[]
}

export type RestoreStrategy = 'merge' | 'replace'

export interface RestoreSummary {
  restored: number
  added: number
  updated: number
  removed: number
}

export type BackupReport =
  | { ok: true; documents: LocalDocument[] }
  | { ok: false; issues: string[] }

const UNTITLED = 'Untitled document'

/** The block kinds a backup may carry, and the fields each one needs. A
 *  block missing one of these is corrupt, not merely unfamiliar. */
const BLOCK_FIELDS: Record<string, string[]> = {
  text: ['text'],
  markdown: ['source'],
  rich: ['runs'],
  heading: ['level', 'text'],
  list: ['ordered', 'items'],
  blockquote: ['text'],
  code: ['code'],
  table: ['headers', 'rows'],
  math: ['expression', 'display'],
  link: ['href', 'label'],
  image: ['alt'],
  file: ['name'],
  unsupported: ['reason'],
}

const encoder = new TextEncoder()

/** crypto.randomUUID is only handed to secure contexts, so a plain-HTTP
 *  origin on a LAN address has to fall back to the same generator by hand.
 *  Both paths produce a version-4 identifier. */
export function newId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  const bytes = new Uint8Array(16)
  crypto.getRandomValues(bytes)
  bytes[6] = (bytes[6] & 0x0f) | 0x40
  bytes[8] = (bytes[8] & 0x3f) | 0x80
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

/** UTF-8 bytes of the serialized record, which is the size the browser
 *  actually has to hold — not the character count, which understates any
 *  document with accents, emoji or CJK in it. */
function measureBytes(
  document: Pick<LocalDocument, 'title' | 'provider' | 'mode' | 'messages'>,
): number {
  return encoder.encode(JSON.stringify(document)).length
}

/** A message the local editor can put back the way it found it. */
export function isEditableMessage(message: NormalizedMessage): boolean {
  return message.content.every((block) => block.kind === 'text' || block.kind === 'markdown')
}

export function messageText(message: NormalizedMessage): string {
  return message.content
    .map((block) => (block.kind === 'text' ? block.text : block.kind === 'markdown' ? block.source : ''))
    .join('\n\n')
}

function toMessage(turn: DraftTurn, sequence: number): NormalizedMessage {
  if (turn.keep) return { ...turn.keep, sequence }
  const content: ContentBlock[] = [{ kind: 'markdown', source: turn.text }]
  const timestamp = turn.timestamp ?? new Date().toISOString()
  return { id: turn.key, role: turn.role, content, sequence, timestamp }
}

/** Turns that hold nothing are not messages. Text is stored as typed: no
 *  trimming, no rewrapping, no joining. */
export function toMessages(turns: DraftTurn[]): NormalizedMessage[] {
  return turns
    .filter((turn) => turn.keep !== undefined || turn.text.length > 0)
    .map(toMessage)
}

function stamped(
  base: Pick<LocalDocument, 'title' | 'provider' | 'mode' | 'messages'>,
  id: string,
  createdAt: string,
  updatedAt: string,
): LocalDocument {
  return {
    id,
    ...base,
    messageCount: base.messages.length,
    sizeBytes: measureBytes(base),
    createdAt,
    updatedAt,
  }
}

/** Newest edited first. */
export async function listDocuments(): Promise<LocalDocument[]> {
  const documents = await db.getAllDocuments()
  return documents.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
}

export async function createDocument(draft: DocumentDraft): Promise<LocalDocument> {
  const messages = toMessages(draft.turns)
  const now = new Date().toISOString()
  const document = stamped(
    {
      title: draft.title.trim() || UNTITLED,
      provider: draft.provider,
      mode: draft.mode,
      messages,
    },
    newId(),
    now,
    now,
  )
  await db.putDocument(document)
  return document
}

/**
 * Write a parsed conversation straight into the library.
 *
 * The composer works in editable turns; an import works in blocks, and a
 * code block must not be flattened to pass through the same door. Only the
 * derived fields are recalculated here — the blocks go in exactly as the
 * parser read them, which is what "no silent drops" means in practice.
 */
export interface ImportedDocumentInput {
  title: string
  provider: DocumentProvider
  messages: NormalizedMessage[]
}

export async function createImportedDocument(
  input: ImportedDocumentInput,
): Promise<LocalDocument> {
  const now = new Date().toISOString()
  const messages = input.messages.map((message, index) => ({
    ...message,
    id: message.id || newId(),
    sequence: index,
  }))
  const document = stamped(
    {
      title: input.title.trim() || UNTITLED,
      provider: input.provider,
      // An import is always the exact thread. A parser never restructures on
      // the user's behalf; only the transform page does, and only into a new
      // record through createDerivedDocument.
      mode: 'exact',
      messages,
    },
    newId(),
    now,
    now,
  )
  await db.putDocument(document)
  return document
}

/**
 * Write a restructured document as a new record.
 *
 * This is the only way a mode other than `exact` enters the library, and it
 * is a create, never an update: the conversation it was made from keeps its
 * own row, its own `exact` mode and its own timestamps, so a generated
 * document can be deleted without a second thought and the original can
 * always be opened again unchanged. `mode` is required rather than defaulted
 * — an import decides nothing on the user's behalf, and a transform knows
 * which mode it was asked for.
 */
export interface DerivedDocumentInput {
  title: string
  provider: DocumentProvider
  mode: DocumentMode
  messages: NormalizedMessage[]
}

export async function createDerivedDocument(input: DerivedDocumentInput): Promise<LocalDocument> {
  const now = new Date().toISOString()
  const messages = input.messages.map((message, index) => ({
    ...message,
    id: message.id || newId(),
    sequence: index,
  }))
  const document = stamped(
    {
      title: input.title.trim() || UNTITLED,
      provider: input.provider,
      mode: input.mode,
      messages,
    },
    newId(),
    now,
    now,
  )
  await db.putDocument(document)
  return document
}

/** A whole record written in the composer's shape — text turns, not blocks,
 *  so a code block has to be flattened to come through here. Editing lives at
 *  `/editor/:documentId`, which hands back blocks and does not need this. */
export async function updateDocument(id: string, draft: DocumentDraft): Promise<LocalDocument> {
  const existing = await db.getDocument(id)
  if (!existing) throw new Error('That document is not in this browser any more.')
  const messages = toMessages(draft.turns)
  const document = stamped(
    {
      title: draft.title.trim() || UNTITLED,
      provider: draft.provider,
      mode: draft.mode,
      messages,
    },
    id,
    existing.createdAt,
    new Date().toISOString(),
  )
  await db.putDocument(document)
  return document
}

/**
 * What the editor writes, as distinct from what the composer writes.
 *
 * The composer works in lines of text and so has to flatten; the editor
 * works in blocks and hands back the whole message list. Only the derived
 * fields and `sequence` are recalculated here — a role, a timestamp, a
 * metadata note and every block the editor could not touch go back exactly
 * as they came, which is what makes an edit safe to save.
 */
export interface DocumentContent {
  title: string
  messages: NormalizedMessage[]
}

export async function saveDocumentContent(
  id: string,
  content: DocumentContent,
): Promise<LocalDocument> {
  const existing = await db.getDocument(id)
  if (!existing) throw new Error('That document is not in this browser any more.')
  const messages = content.messages.map((message, index) => ({
    ...message,
    id: message.id || newId(),
    sequence: index,
  }))
  const document = stamped(
    {
      title: content.title.trim() || UNTITLED,
      // Provider and mode are decisions an import or the composer made;
      // editing prose is not a reason to change either.
      provider: existing.provider,
      mode: existing.mode,
      messages,
    },
    id,
    existing.createdAt,
    new Date().toISOString(),
  )
  await db.putDocument(document)
  return document
}

/**
 * A second document that starts out identical.
 *
 * Nothing is written to the original, and the copy's blocks are cloned
 * rather than shared, so editing one library record cannot reach into the
 * other one already open in another tab.
 */
export async function duplicateDocument(id: string): Promise<LocalDocument> {
  const existing = await db.getDocument(id)
  if (!existing) throw new Error('That document is not in this browser any more.')
  const now = new Date().toISOString()
  const document = stamped(
    {
      title: `${existing.title} (Copy)`,
      provider: existing.provider,
      mode: existing.mode,
      messages: structuredClone(existing.messages),
    },
    newId(),
    now,
    now,
  )
  await db.putDocument(document)
  return document
}

export async function deleteDocument(id: string): Promise<void> {
  await db.deleteDocument(id)
}

export async function deleteEverything(): Promise<number> {
  const documents = await db.getAllDocuments()
  await db.clearDocuments()
  return documents.length
}

/** What the library itself holds, in bytes. `navigator.storage` reports the
 *  whole origin, which includes caches this app does not own. */
export function libraryFootprint(documents: LocalDocument[]): number {
  return documents.reduce((total, document) => total + document.sizeBytes, 0)
}

export async function storageEstimate(): Promise<StorageEstimate | null> {
  if (typeof navigator === 'undefined' || !navigator.storage?.estimate) return null
  try {
    return await navigator.storage.estimate()
  } catch {
    return null
  }
}

export function serialiseBackup(documents: LocalDocument[]): string {
  const envelope: BackupEnvelope = {
    app: 'PromptPaper',
    schemaVersion: DOCUMENT_SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    documentCount: documents.length,
    documents,
  }
  return JSON.stringify(envelope, null, 2)
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const isNonEmptyString = (value: unknown): value is string =>
  typeof value === 'string' && value.length > 0

const isIso = (value: unknown): value is string =>
  typeof value === 'string' && !Number.isNaN(Date.parse(value))

function oneOf<T extends string>(value: unknown, allowed: readonly T[]): value is T {
  return typeof value === 'string' && (allowed as readonly string[]).includes(value)
}

/** A paragraph the editor formatted: words, each with its marks beside them. */
function isRuns(value: unknown): value is InlineRun[] {
  return Array.isArray(value) && value.every((run) => isRecord(run) && typeof run.text === 'string')
}

function readBlocks(value: unknown, where: string, issues: string[]): ContentBlock[] | null {
  if (!Array.isArray(value)) {
    issues.push(`${where}: content is not a list of blocks.`)
    return null
  }
  const blocks: ContentBlock[] = []
  for (const [index, entry] of value.entries()) {
    const at = `${where} block ${index + 1}`
    if (!isRecord(entry) || !isNonEmptyString(entry.kind)) {
      issues.push(`${at}: no block kind.`)
      continue
    }
    const required = BLOCK_FIELDS[entry.kind]
    if (!required) {
      issues.push(`${at}: "${entry.kind}" is not a block type PromptPaper understands.`)
      continue
    }
    const missing = required.filter((field) => entry[field] === undefined)
    if (missing.length > 0) {
      issues.push(`${at} (${entry.kind}): missing ${missing.join(', ')}.`)
      continue
    }
    // A rich block is the one kind whose field is a list of objects, so it
    // is checked one level deeper: a paragraph of runs with no words in them
    // would reach every renderer and draw nothing.
    if (entry.kind === 'rich' && !isRuns(entry.runs)) {
      issues.push(`${at} (rich): runs is not a list of words with marks.`)
      continue
    }
    blocks.push(entry as unknown as ContentBlock)
  }
  return blocks.length === value.length ? blocks : null
}

function readMessage(
  value: unknown,
  documentIndex: number,
  index: number,
  issues: string[],
): NormalizedMessage | null {
  const where = `Document ${documentIndex + 1}, message ${index + 1}`
  if (!isRecord(value)) {
    issues.push(`${where}: not an object.`)
    return null
  }
  if (!isNonEmptyString(value.id)) {
    issues.push(`${where}: no identifier.`)
    return null
  }
  if (!oneOf(value.role, MESSAGE_ROLES)) {
    issues.push(`${where}: role "${String(value.role)}" is not user, assistant or system.`)
    return null
  }
  if (value.timestamp !== undefined && !isIso(value.timestamp)) {
    issues.push(`${where}: timestamp is not a date.`)
    return null
  }
  if (value.metadata !== undefined && !isRecord(value.metadata)) {
    issues.push(`${where}: metadata is not a set of key/value pairs.`)
    return null
  }
  const content = readBlocks(value.content, where, issues)
  if (!content) return null
  return {
    id: value.id,
    role: value.role,
    content,
    // Re-derived on restore; the number in the file is only ever a hint.
    sequence: index,
    timestamp: value.timestamp,
    metadata: value.metadata as Record<string, unknown> | undefined,
  }
}

function readDocument(
  value: unknown,
  index: number,
  issues: string[],
): LocalDocument | null {
  const where = `Document ${index + 1}`
  if (!isRecord(value)) {
    issues.push(`${where}: not an object.`)
    return null
  }
  if (!isNonEmptyString(value.id)) {
    issues.push(`${where}: no identifier.`)
    return null
  }
  if (typeof value.title !== 'string') {
    issues.push(`${where}: no title.`)
    return null
  }
  if (!oneOf(value.provider, DOCUMENT_PROVIDERS)) {
    issues.push(
      `${where}: provider "${String(value.provider)}" is not one of ${DOCUMENT_PROVIDERS.join(', ')}.`,
    )
    return null
  }
  if (!oneOf(value.mode, DOCUMENT_MODES)) {
    issues.push(
      `${where}: mode "${String(value.mode)}" is not one of ${DOCUMENT_MODES.join(', ')}.`,
    )
    return null
  }
  if (!isIso(value.createdAt) || !isIso(value.updatedAt)) {
    issues.push(`${where}: createdAt and updatedAt must both be dates.`)
    return null
  }
  if (!Array.isArray(value.messages)) {
    issues.push(`${where}: messages is not a list.`)
    return null
  }
  const messages = value.messages
    .map((message, position) => readMessage(message, index, position, issues))
    .filter((message): message is NormalizedMessage => message !== null)
  if (messages.length !== value.messages.length) return null

  return stamped(
    { title: value.title, provider: value.provider, mode: value.mode, messages },
    value.id,
    value.createdAt,
    value.updatedAt,
  )
}

/**
 * Read a backup file without touching the library.
 *
 * Nothing is half-applied: a single malformed document rejects the whole
 * file, with the specific field named, because a partial restore would leave
 * the user with a library they cannot tell the difference in.
 */
export function parseBackup(text: string): BackupReport {
  const issues: string[] = []
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch (error) {
    return {
      ok: false,
      issues: [
        `That file is not readable JSON. ${error instanceof Error ? error.message : 'It may be truncated or corrupted.'}`,
      ],
    }
  }

  if (!isRecord(parsed)) return { ok: false, issues: ['The file is not a PromptPaper backup.'] }
  if (parsed.app !== 'PromptPaper') {
    return {
      ok: false,
      issues: [
        `This backup came from "${String(parsed.app ?? 'an unknown app')}", not PromptPaper.`,
      ],
    }
  }
  if (parsed.schemaVersion !== DOCUMENT_SCHEMA_VERSION) {
    return {
      ok: false,
      issues: [
        `It uses schema version ${String(parsed.schemaVersion)}; this build reads version ${DOCUMENT_SCHEMA_VERSION}.`,
      ],
    }
  }
  if (!Array.isArray(parsed.documents)) {
    return { ok: false, issues: ['The file has no list of documents.'] }
  }
  if (
    typeof parsed.documentCount === 'number' &&
    parsed.documentCount !== parsed.documents.length
  ) {
    return {
      ok: false,
      issues: [
        `The file says it holds ${parsed.documentCount} documents but contains ${parsed.documents.length}.`,
      ],
    }
  }

  const documents = parsed.documents
    .map((document, index) => readDocument(document, index, issues))
    .filter((document): document is LocalDocument => document !== null)

  const ids = new Set<string>()
  for (const document of documents) {
    if (ids.has(document.id)) issues.push(`Two documents share the identifier ${document.id}.`)
    ids.add(document.id)
  }

  if (issues.length > 0 || documents.length !== parsed.documents.length) {
    return { ok: false, issues: issues.length > 0 ? issues : ['The file could not be read.'] }
  }

  return { ok: true, documents }
}

/**
 * Write a validated backup into the library.
 *
 * `merge` keeps everything already there and lets the file win on matching
 * identifiers; `replace` clears the library first. Either way the documents
 * go in as one transaction, so an interrupted restore cannot leave half a
 * library behind.
 */
export async function restoreLibrary(
  incoming: LocalDocument[],
  strategy: RestoreStrategy,
): Promise<RestoreSummary> {
  const existing = await db.getAllDocuments()
  const current = new Map(existing.map((document) => [document.id, document]))

  if (strategy === 'replace') {
    await db.clearDocuments()
    await db.putDocuments(incoming)
    return {
      restored: incoming.length,
      added: incoming.length,
      updated: 0,
      removed: existing.length,
    }
  }

  let added = 0
  let updated = 0
  for (const document of incoming) {
    if (current.has(document.id)) updated += 1
    else added += 1
    current.set(document.id, document)
  }
  const merged = [...current.values()]
  await db.putDocuments(merged)

  return { restored: incoming.length, added, updated, removed: 0 }
}
