import type { DocumentMode, DocumentProvider, MessageRole } from '@/types/document'

/** Labels for the values that are stored as slugs. The stored form stays
 *  ASCII and stable for backups; only the display changes. */
export const PROVIDER_LABEL: Record<DocumentProvider, string> = {
  chatgpt: 'ChatGPT',
  gemini: 'Gemini',
  claude: 'Claude',
  generic: 'Generic',
}

export const ROLE_LABEL: Record<MessageRole, string> = {
  user: 'You',
  assistant: 'AI reply',
  system: 'System',
}

export const MODE_LABEL: Record<DocumentMode, string> = {
  exact: 'Exact conversation',
  study_notes: 'Study notes',
  interview_prep: 'Interview prep',
  custom: 'Custom',
}

const pad = (value: number) => String(value).padStart(2, '0')

/** Bytes as they read on a disk panel: whole numbers until they cannot be,
 *  and never a unit smaller than the byte. */
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return '0 B'
  if (bytes < 1024) return `${bytes} B`
  const kb = bytes / 1024
  if (kb < 1024) return `${kb < 10 ? kb.toFixed(1) : Math.round(kb)} KB`
  return `${(kb / 1024).toFixed(2)} MB`
}

export function formatDateTime(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return 'Unknown date'
  return date.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

/** promptpaper-backup-2026-11-21.json, in the reader's own date. */
export function backupFileName(at: Date = new Date()): string {
  return `promptpaper-backup-${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())}.json`
}
