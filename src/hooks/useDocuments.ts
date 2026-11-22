import { useCallback, useEffect, useState } from 'react'

import { StorageFullError, StorageUnavailableError } from '@/lib/storage/db'
import type { LocalDocument } from '@/types/document'
import type {
  DerivedDocumentInput,
  DocumentContent,
  DocumentDraft,
  RestoreStrategy,
} from '@/services/documentService'
import {
  createDerivedDocument,
  createDocument,
  deleteDocument,
  deleteEverything,
  duplicateDocument,
  libraryFootprint,
  listDocuments,
  restoreLibrary,
  saveDocumentContent,
  storageEstimate,
  updateDocument,
} from '@/services/documentService'

export type LibraryStatus = 'loading' | 'ready' | 'unavailable'

interface Snapshot {
  documents: LocalDocument[]
  estimate: StorageEstimate | null
  status: LibraryStatus
  problem: string | null
}

/** What the browser said when it refused. */
function describeFailure(error: unknown): string {
  if (error instanceof StorageUnavailableError || error instanceof StorageFullError) {
    return error.message
  }
  return error instanceof Error
    ? error.message
    : 'The browser would not open its local storage, so there is no library to show.'
}

/** A read that never throws: the library is either there or explained. */
async function readLibrary(): Promise<Snapshot> {
  try {
    const [documents, estimate] = await Promise.all([listDocuments(), storageEstimate()])
    return { documents, estimate, status: 'ready', problem: null }
  } catch (error) {
    return { documents: [], estimate: null, status: 'unavailable', problem: describeFailure(error) }
  }
}

/**
 * The library as React state.
 *
 * Every mutation goes through here so the list, the footprint and the quota
 * reading are always the ones matching what is actually on disk: the service
 * is called, then the whole library is read back, rather than the new record
 * being stitched into the old array by hand. That costs one IndexedDB read
 * per write and means the panel cannot drift from the truth.
 *
 * A storage failure becomes a message and, when the store cannot be opened
 * at all, an `unavailable` status — never an exception that reaches render.
 */
export function useDocuments() {
  const [documents, setDocuments] = useState<LocalDocument[]>([])
  const [status, setStatus] = useState<LibraryStatus>('loading')
  const [problem, setProblem] = useState<string | null>(null)
  const [estimate, setEstimate] = useState<StorageEstimate | null>(null)

  const apply = useCallback((snapshot: Snapshot) => {
    setDocuments(snapshot.documents)
    setEstimate(snapshot.estimate)
    setStatus(snapshot.status)
  }, [])

  useEffect(() => {
    // Reading IndexedDB is an effect in the true sense: the library exists
    // outside React, and the only honest time to ask it what is in there is
    // after the first paint. Nothing is set synchronously here.
    let alive = true
    void readLibrary().then((snapshot) => {
      if (!alive) return
      apply(snapshot)
      if (snapshot.problem) setProblem(snapshot.problem)
    })
    return () => {
      alive = false
    }
  }, [apply])

  const sync = useCallback(async () => {
    const snapshot = await readLibrary()
    apply(snapshot)
    return snapshot
  }, [apply])

  /** Runs a write, reads the library back, and reports what went wrong.
   *  Null means the action did not happen — the message is already on
   *  screen, so the caller only has to stop. */
  const run = useCallback(
    async <T,>(action: () => Promise<T>): Promise<T | null> => {
      try {
        const result = await action()
        await sync()
        return result
      } catch (error) {
        // Re-read first: a refused write may still have changed what is
        // stored, and the explanation belongs to the state after it.
        const snapshot = await sync()
        setProblem(snapshot.status === 'unavailable' ? (snapshot.problem ?? describeFailure(error)) : describeFailure(error))
        return null
      }
    },
    [sync],
  )

  const create = useCallback((draft: DocumentDraft) => run(() => createDocument(draft)), [run])

  const update = useCallback(
    (id: string, draft: DocumentDraft) => run(() => updateDocument(id, draft)),
    [run],
  )

  /** The transform's write: a new record beside the one it came from. */
  const createDerived = useCallback(
    (input: DerivedDocumentInput) => run(() => createDerivedDocument(input)),
    [run],
  )

  /** The editor's write: whole message lists, blocks and all. */
  const saveContent = useCallback(
    (id: string, content: DocumentContent) => run(() => saveDocumentContent(id, content)),
    [run],
  )

  const duplicate = useCallback((id: string) => run(() => duplicateDocument(id)), [run])

  // Returning the identifier gives the caller one honest way to tell a
  // finished delete from a refused one, instead of comparing undefined.
  const remove = useCallback(
    (id: string) =>
      run(async () => {
        await deleteDocument(id)
        return id
      }),
    [run],
  )

  const clearAll = useCallback(() => run(() => deleteEverything()), [run])

  const restore = useCallback(
    (incoming: LocalDocument[], strategy: RestoreStrategy) =>
      run(() => restoreLibrary(incoming, strategy)),
    [run],
  )

  return {
    status,
    documents,
    estimate,
    footprint: libraryFootprint(documents),
    problem,
    dismissProblem: () => setProblem(null),
    create,
    update,
    createDerived,
    saveContent,
    duplicate,
    remove,
    clearAll,
    restore,
  }
}

export type DocumentsApi = ReturnType<typeof useDocuments>
