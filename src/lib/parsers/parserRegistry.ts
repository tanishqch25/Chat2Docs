import { claudeConversations } from '@/lib/parsers/claudeParser'
import { chatgptConversations, parseChatgptArchive } from '@/lib/parsers/chatgptParser'
import { notParsed, type ParseResult } from '@/lib/parsers/envelope'
import { parseHtmlFile, parseTextFile } from '@/lib/parsers/fileParser'
import { geminiConversations } from '@/lib/parsers/geminiParser'
import { asRecord, asText } from '@/lib/parsers/json'
import type { ParsedConversationResult } from '@/types/import'

/**
 * One door for every upload.
 *
 * The workspace hands over a File and gets back conversations or a reason.
 * Which provider a file came from is decided by what is inside it, not by
 * what the user chose, because an export renamed in the Downloads folder is
 * still the same export — and a wrong guess about a ChatGPT archive should
 * not come back as unreadable Gemini data.
 *
 * A JSON body is tried against each reader in turn and the first that finds
 * its own shape wins. That is the only place the choice happens; the
 * parsers themselves never know about each other.
 */

/** What the drop zone and the file input both promise. */
export const ACCEPTED_EXTENSIONS = ['.json', '.zip', '.md', '.markdown', '.txt', '.html', '.htm']

const single = (result: ParsedConversationResult): ParseResult => ({ ok: true, results: [result] })

const extensionOf = (name: string) => (name.split('.').pop() ?? '').toLowerCase()

/** A library backup is a PromptPaper file about documents, not a conversation. */
function isPromptPaperBackup(parsed: unknown): boolean {
  const record = asRecord(parsed)
  return record !== null && asText(record.app) === 'PromptPaper'
}

const JSON_READERS: { label: string; read: (parsed: unknown) => ParseResult }[] = [
  { label: 'ChatGPT', read: chatgptConversations },
  { label: 'Claude', read: claudeConversations },
  { label: 'Gemini', read: geminiConversations },
]

export async function parseUploadedFile(file: File): Promise<ParseResult> {
  if (file.size === 0) return notParsed(`${file.name} is empty.`)
  const extension = extensionOf(file.name)

  // Archives are ChatGPT's shape for an export; no other provider's has
  // arrived in a form this build can read.
  if (extension === 'zip') {
    const outcome = await parseChatgptArchive(await file.arrayBuffer())
    return outcome.ok ? outcome : notParsed(`${file.name}: ${outcome.reason}`)
  }

  if (extension === 'md' || extension === 'markdown' || extension === 'txt') {
    return single(parseTextFile(await file.text()))
  }
  if (extension === 'html' || extension === 'htm') {
    return single(parseHtmlFile(await file.text()))
  }
  if (extension !== 'json') {
    return notParsed(
      `${file.name} is not a file PromptPaper reads. Give it a conversation export as .json, a ChatGPT .zip archive, or the words themselves as .md, .txt or .html.`,
    )
  }

  const text = await file.text()
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch (error) {
    return notParsed(
      `${file.name} is not readable JSON${error instanceof Error ? `. ${error.message}` : '. It may have been cut short while downloading.'}`,
    )
  }

  if (isPromptPaperBackup(parsed)) {
    return notParsed(
      `${file.name} is a PromptPaper library backup, not a provider export. Restore it from the library panel at /documents.`,
    )
  }

  for (const reader of JSON_READERS) {
    const outcome = reader.read(parsed)
    if (outcome.ok) return outcome
  }
  return notParsed(
    `No conversation was found in ${file.name}. It is not a ChatGPT, Claude or Gemini export this build recognises — paste the words, or upload a .md, .txt or .html export instead.`,
  )
}
