import { Link, useParams } from 'react-router-dom'
import { ArrowRight } from 'lucide-react'

/* The editor's own surface — the prose rules TipTap's content is drawn with.
   KaTeX's stylesheet comes with the app shell instead of here, because the
   library, the document modes and the export preview typeset the same math
   blocks and all of them need it. */
import '@/styles/editor.css'

import { Container } from '@/components/layout/container'
import { EditorWorkspace } from '@/components/editor/editor-workspace'
import { buttonVariants } from '@/components/ui/button-variants'
import { useDocuments } from '@/hooks/useDocuments'

/**
 * Where a saved document is rewritten.
 *
 * The library, the import and the export all keep a conversation exactly as
 * it was given; this is the one surface that lets a reader change it. That
 * makes it the surface a mistake can cost something on, so the rules here
 * are the strict ones: nothing is written until Save is asked for, a block
 * the editor cannot express is shown as a card and handed back untouched,
 * and leaving with unsaved words asks first.
 *
 * Nothing in this page sends a word anywhere either. The document is read
 * out of IndexedDB in this browser, edited in this browser, and written back
 * to the same store — which is why an editor can be trusted with a thread
 * nobody would want to have to explain to a service.
 */

function MissingState({ documentId, problem }: { documentId?: string; problem: string | null }) {
  return (
    <Container className="py-16 sm:py-24">
      <div className="flex max-w-xl flex-col gap-5">
        <span className="text-caption font-semibold tracking-[0.16em] text-slate-gray uppercase">
          Editor
        </span>
        <h1 className="text-heading font-semibold text-foreground">
          {problem ? 'The library could not be read' : 'No document at this address'}
        </h1>
        <p className="text-body text-muted">
          {problem ??
            `PromptPaper looked in this browser for the document ${documentId ?? 'you asked for'} and did not find it. ` +
              'It may have been deleted, or the address may have come from another browser — ' +
              'a document lives where it was saved.'}
        </p>
        <Link to="/documents" className={`${buttonVariants({ variant: 'primary' })} self-start`}>
          Back to the library <ArrowRight aria-hidden className="size-4" />
        </Link>
      </div>
    </Container>
  )
}

function EditorPage() {
  const { documentId } = useParams()
  const library = useDocuments()
  const { documents, status, problem } = library

  if (status === 'loading') {
    return (
      <Container className="py-16 sm:py-24">
        <p className="text-body text-muted" role="status">
          Reading this browser’s library…
        </p>
      </Container>
    )
  }

  const record = documents.find((each) => each.id === documentId)
  if (!record) return <MissingState documentId={documentId} problem={problem} />

  // One workspace per document: opening a second document must not inherit
  // the first one's sections, its title, or an undo history that is wrong.
  return (
    <Container className="py-10 sm:py-14">
      <EditorWorkspace key={record.id} document={record} library={library} />
    </Container>
  )
}

export { EditorPage }
