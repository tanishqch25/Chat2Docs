import type { LocalDocument } from '@/types/document'

/**
 * IndexedDB persistence, and nothing else.
 *
 * This file owns the connection, the schema and the requests. It does not
 * calculate sizes, validate backups or know what a document means — that is
 * the document service above it — so a future change of storage engine has
 * one small file to replace.
 *
 * Everything here rejects rather than throws where it can, and every
 * rejection is one of the two error classes below, so the UI can explain a
 * failure instead of crashing on it. Private browsing is the reason: Safari
 * and some hardened Firefox builds refuse IndexedDB outright, and PromptPaper
 * has no server to fall back to.
 */

const DB_NAME = 'PromptPaperDB'
const DB_VERSION = 1
const STORE = 'documents'

/** Storage cannot be opened at all, or was blocked by another tab. */
export class StorageUnavailableError extends Error {}

/** The browser refused a write because the quota is spent. */
export class StorageFullError extends Error {}

/** Held at module scope so React's double-invoked effects, and every page
 *  component, share one connection instead of racing to open a second. */
let opening: Promise<IDBDatabase> | null = null

function describe(reason: unknown, fallback: string) {
  const name = (reason as DOMException | null)?.name
  if (name === 'QuotaExceededError' || name === 'NotAllowedError') {
    return new StorageFullError(
      'The browser would not accept the write. Its storage for this site is full, or this browser blocks it in private windows.',
    )
  }
  return new StorageUnavailableError(fallback)
}

function committed(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve()
    tx.onabort = () => reject(describe(tx.error, 'The browser would not save that document.'))
    tx.onerror = () => reject(describe(tx.error, 'The browser would not save that document.'))
  })
}

export function openDatabase(): Promise<IDBDatabase> {
  if (opening) return opening

  opening = new Promise<IDBDatabase>((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(
        new StorageUnavailableError(
          'This browser has no local storage available, so documents cannot be kept here.',
        ),
      )
      return
    }

    let open: IDBOpenDBRequest
    try {
      open = indexedDB.open(DB_NAME, DB_VERSION)
    } catch {
      reject(
        new StorageUnavailableError(
          'This browser would not open local storage. Private windows often block it.',
        ),
      )
      return
    }

    open.onupgradeneeded = () => {
      const db = open.result
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: 'id' })
        store.createIndex('updatedAt', 'updatedAt')
        store.createIndex('createdAt', 'createdAt')
        store.createIndex('provider', 'provider')
      }
    }
    open.onsuccess = () => resolve(open.result)
    open.onerror = () =>
      reject(
        describe(
          open.error,
          'This browser would not open local storage. Private windows often block it.',
        ),
      )
    open.onblocked = () =>
      reject(
        new StorageUnavailableError(
          'Another PromptPaper tab is holding the library open. Close it and reload.',
        ),
      )
  })

  // A failed open must not be cached for the life of the tab, or one blocked
  // first load would leave the workspace dead until a restart.
  opening.catch(() => {
    opening = null
  })

  return opening
}

async function write(
  run: (store: IDBObjectStore) => void,
): Promise<void> {
  const db = await openDatabase()
  const tx = db.transaction(STORE, 'readwrite')
  // The transaction settling is the promise, not the request: a failed
  // request aborts the transaction, and waiting for it would report success
  // on a write that never reached the disk.
  run(tx.objectStore(STORE))
  await committed(tx)
}

export async function getAllDocuments(): Promise<LocalDocument[]> {
  const db = await openDatabase()
  const store = db.transaction(STORE, 'readonly').objectStore(STORE)
  const open = store.getAll()
  return new Promise((resolve, reject) => {
    open.onsuccess = () => resolve(open.result)
    open.onerror = () =>
      reject(new StorageUnavailableError('The browser would not read the library.'))
  })
}

/** One record by identifier, when the caller needs the current copy rather
 *  than the whole library — `createdAt` survives an edit only if the edit
 *  reads it first. */
export async function getDocument(id: string): Promise<LocalDocument | undefined> {
  const db = await openDatabase()
  const store = db.transaction(STORE, 'readonly').objectStore(STORE)
  const open = store.get(id)
  return new Promise((resolve, reject) => {
    open.onsuccess = () => resolve(open.result as LocalDocument | undefined)
    open.onerror = () =>
      reject(new StorageUnavailableError('The browser would not read that document.'))
  })
}

/** One record, written on its own. */
export async function putDocument(document: LocalDocument): Promise<void> {
  await write((store) => {
    store.put(document)
  })
}

/** Many records in a single transaction, so a restore is all or nothing. */
export async function putDocuments(documents: LocalDocument[]): Promise<void> {
  if (documents.length === 0) return
  await write((store) => {
    for (const document of documents) store.put(document)
  })
}

export async function deleteDocument(id: string): Promise<void> {
  await write((store) => {
    store.delete(id)
  })
}

export async function clearDocuments(): Promise<void> {
  await write((store) => {
    store.clear()
  })
}
