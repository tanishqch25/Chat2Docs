import * as React from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, ClipboardPaste, FileUp } from 'lucide-react'

import { ConversationCard } from '@/components/import/conversation-card'
import { ConversationPicker } from '@/components/import/conversation-picker'
import { FileNotes } from '@/components/import/file-notes'
import { PastePanel } from '@/components/import/paste-panel'
import { UploadPanel } from '@/components/import/upload-panel'
import {
  candidateFromResult,
  draftFromResult,
  isSavable,
  mergeUp,
  removeAt,
  setRole,
  setTitle,
} from '@/components/import/draft'
import type { ImportDraft } from '@/components/import/draft'
import type { ImportCandidate } from '@/components/import/types'
import { Container } from '@/components/layout/container'
import { Eyebrow } from '@/components/layout/section-header'
import { Button } from '@/components/ui/button'
import { buttonVariants } from '@/components/ui/button-variants'
import { parseUploadedFile } from '@/lib/parsers/parserRegistry'
import { parsePaste } from '@/lib/parsers/pasteParser'
import { createImportedDocument } from '@/services/documentService'
import type { MessageRole } from '@/types/document'

const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? '' : 's'}`

/** Where the workspace is in its own flow, and which input is showing.
 *  `saved` is the end of a run: the conversations are in the library, and
 *  the reader chooses where to go on from there. */
type Stage = 'input' | 'picking' | 'review' | 'saved'
type Tab = 'paste' | 'upload'

const TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
  {
    id: 'paste',
    label: 'Paste a conversation',
    icon: <ClipboardPaste aria-hidden className="size-4" />,
  },
  { id: 'upload', label: 'Upload an export', icon: <FileUp aria-hidden className="size-4" /> },
]

/**
 * The import workspace.
 *
 * Two inputs, one review. Whether a thread arrives as text or as a provider
 * download, it becomes the same envelope of messages and blocks, gets
 * counted in the open, and only then becomes a document — so there is one
 * place where a person can see what is about to be kept.
 *
 * Nothing here asks a model anything. The reading is line-by-line, field-by-
 * field code running in this tab, which is why a thread holding an API key,
 * a password or a diagnosis can be brought in without a copy leaving the
 * device.
 */
function ImportPage() {
  // What landed in the library on the last save, kept so the next screen
  // can name it: an address to open, and the titles beside it.
  const [saved, setSaved] = React.useState<{ id: string; title: string }[]>([])
  const [tab, setTab] = React.useState<Tab>('paste')
  const [stage, setStage] = React.useState<Stage>('input')
  const [pasted, setPasted] = React.useState('')
  const [candidates, setCandidates] = React.useState<ImportCandidate[]>([])
  const [drafts, setDrafts] = React.useState<ImportDraft[]>([])
  const [problems, setProblems] = React.useState<string[]>([])
  const [notes, setNotes] = React.useState<string[]>([])
  const [failure, setFailure] = React.useState<string | null>(null)
  const [busy, setBusy] = React.useState(false)

  const patch = (key: string, change: (draft: ImportDraft) => ImportDraft) =>
    setDrafts((current) => current.map((draft) => (draft.key === key ? change(draft) : draft)))

  /** One conversation read straight into review, which is the usual case. */
  const review = (candidate: ImportCandidate) => {
    setCandidates([candidate])
    setDrafts([draftFromResult(candidate)])
    setStage('review')
  }

  const readPaste = () => {
    setFailure(null)
    setProblems([])
    setNotes([])
    const result = parsePaste(pasted)
    if (result.messages.length === 0) {
      setFailure(
        'That text holds no words to import — a speaker label with nothing after it is not a conversation yet.',
      )
      return
    }
    review(candidateFromResult(result))
  }

  const readFiles = async (files: File[]) => {
    setBusy(true)
    setFailure(null)
    const collected: ImportCandidate[] = []
    const reasons: string[] = []
    const fileNotes: string[] = []
    for (const file of files) {
      try {
        const outcome = await parseUploadedFile(file)
        if (!outcome.ok) {
          reasons.push(outcome.reason)
          continue
        }
        fileNotes.push(...(outcome.notes ?? []))
        for (const result of outcome.results) {
          if (result.messages.length === 0) {
            reasons.push(`${file.name} was read, but it holds no messages.`)
            continue
          }
          collected.push(candidateFromResult(result, file.name))
        }
      } catch (error) {
        // A file the browser would not hand over, or a reader that met
        // something unexpected in it. Either way the other files still run.
        reasons.push(
          `${file.name} could not be read${error instanceof Error ? `. ${error.message}` : '.'}`,
        )
      }
    }
    setBusy(false)
    setProblems(reasons)
    setNotes(fileNotes)

    if (collected.length === 0) return
    if (collected.length === 1) {
      const [only] = collected
      if (only) review(only)
      return
    }
    setCandidates(collected)
    setStage('picking')
  }

  const confirmPicked = (keys: string[]) => {
    const chosen = new Set(keys)
    setDrafts(candidates.filter((candidate) => chosen.has(candidate.key)).map(draftFromResult))
    setStage('review')
  }

  /** Back to the input with nothing half-written anywhere. */
  const startOver = () => {
    setStage('input')
    setDrafts([])
    setCandidates([])
    setProblems([])
    setNotes([])
    setFailure(null)
    setPasted('')
    setSaved([])
  }

  const save = async () => {
    setBusy(true)
    setFailure(null)
    const kept: { id: string; title: string }[] = []
    try {
      for (const draft of drafts) {
        const savedRecord = await createImportedDocument({
          title: draft.title,
          provider: draft.provider,
          messages: draft.messages,
        })
        kept.push({ id: savedRecord.id, title: savedRecord.title })
      }
    } catch (error) {
      setBusy(false)
      // A batch can stop partway, and saying which half landed is the
      // difference between a confusing error and a lost afternoon.
      setFailure(
        `${error instanceof Error ? error.message : 'This browser refused the write.'} ${
          kept.length > 0
            ? `${kept.length} of ${drafts.length} conversations were saved before that.`
            : 'Nothing was saved.'
        }`,
      )
      return
    }
    setSaved(kept)
    setStage('saved')
    setBusy(false)
  }

  const savable = drafts.length > 0 && drafts.every(isSavable)

  const empty = drafts.filter((draft) => draft.messages.length === 0).length
  const untitled = drafts.filter((draft) => draft.title.trim().length === 0).length

  return (
    <Container className="flex flex-col gap-12 py-14 lg:py-20">
      <div className="flex flex-col items-start gap-5">
        <Eyebrow>Deterministic import</Eyebrow>
        <h1 className="max-w-[20ch] text-heading-lg font-bold text-balance text-foreground">
          Bring a conversation in
        </h1>
        <p className="max-w-[62ch] text-body-lg text-muted">
          Paste a thread, or drop the file you downloaded from ChatGPT, Claude or Gemini.
          PromptPaper reads it here, shows every message it found, and only then lets you save.
        </p>
        <ul className="flex flex-col gap-2 text-caption text-muted">
          {[
            'No model is involved: the reading is line by line, in this browser.',
            'Nothing is summarised, reworded, reordered or silently left out.',
            'Images and attachments stay in the export. Their references are kept and named.',
          ].map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      </div>

      {failure ? (
        <div
          role="alert"
          className="flex flex-wrap items-center gap-4 rounded-product border border-border bg-input p-5"
        >
          <p className="min-w-0 flex-1 text-body text-foreground">{failure}</p>
          <Button variant="ghost" size="sm" onClick={() => setFailure(null)}>
            Dismiss
          </Button>
        </div>
      ) : null}

      {/* The upload panel says all this too, but it is no longer on screen
          once the conversations are listed. */}
      {stage === 'input' ? null : <FileNotes problems={problems} notes={notes} />}

      {stage === 'input' ? (
        <div className="flex flex-col gap-6">
          <div
            role="tablist"
            aria-label="How the conversation arrives"
            className="flex flex-wrap gap-2 border-b border-border pb-4"
          >
            {TABS.map((entry) => {
              const on = entry.id === tab
              return (
                <button
                  key={entry.id}
                  type="button"
                  role="tab"
                  id={`import-tab-${entry.id}`}
                  aria-selected={on}
                  aria-controls={`import-panel-${entry.id}`}
                  onClick={() => setTab(entry.id)}
                  className={
                    on
                      ? 'flex items-center gap-2 rounded-badge border border-signal-blue bg-badge-bg px-3.5 py-2 text-body-sm font-medium text-deep-cobalt'
                      : 'flex items-center gap-2 rounded-badge border border-border bg-card px-3.5 py-2 text-body-sm font-medium text-muted transition-colors hover:border-mist-gray hover:text-foreground'
                  }
                >
                  {entry.icon}
                  {entry.label}
                </button>
              )
            })}
          </div>

          {/* Both panels stay mounted: text typed into one is not thrown
              away by looking at the other. */}
          <div
            role="tabpanel"
            id="import-panel-paste"
            aria-labelledby="import-tab-paste"
            hidden={tab !== 'paste'}
          >
            <PastePanel value={pasted} onChange={setPasted} onPreview={readPaste} />
          </div>
          <div
            role="tabpanel"
            id="import-panel-upload"
            aria-labelledby="import-tab-upload"
            hidden={tab !== 'upload'}
          >
            <UploadPanel
              busy={busy}
              problems={problems}
              notes={notes}
              onFiles={(files) => void readFiles(files)}
            />
          </div>
        </div>
      ) : stage === 'picking' ? (
        <ConversationPicker
          candidates={candidates}
          onConfirm={confirmPicked}
          onBack={() => setStage('input')}
        />
      ) : stage === 'saved' ? (
        <div className="flex flex-col gap-5 rounded-product border border-border bg-input p-6">
          <h2 className="text-heading-sm font-bold text-foreground">
            {plural(saved.length, 'conversation')} saved in this browser
          </h2>
          <p className="text-body-sm text-muted">
            {saved.map((each) => each.title).join(' · ')} — every message and block, in order, in
            the local library. The export preview lays the same content on a page and writes it out
            as PDF, Word, HTML, Markdown or text.
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <Link
              to={`/export/${saved[0]?.id ?? ''}`}
              className={buttonVariants({ variant: 'primary' })}
            >
              Open the export preview <ArrowRight aria-hidden className="size-4" />
            </Link>
            <Link
              to="/documents"
              state={{ imported: saved.length }}
              className={buttonVariants({ variant: 'outline' })}
            >
              See them in the library
            </Link>
            <Button variant="ghost" onClick={startOver}>
              Import another
            </Button>
          </div>
          {saved.length > 1 ? (
            <p className="text-caption text-muted">
              The preview opens one document at a time. The rest are in the library, each with its
              own Export.
            </p>
          ) : null}
        </div>
      ) : (
        <div className="flex flex-col gap-8">
          <div className="flex flex-col gap-2">
            <h2 className="text-heading-sm font-bold text-foreground">
              {drafts.length === 0
                ? 'Nothing left to check'
                : drafts.length === 1
                  ? 'Check what was found'
                  : `Check ${drafts.length} conversations`}
            </h2>
            {drafts.length > 0 ? (
              <p className="text-body-sm text-muted">
                Nothing has been saved yet. Fix a speaker or a boundary, then write these into this
                browser.
              </p>
            ) : null}
          </div>

          <div className="flex flex-col gap-6">
            {drafts.map((draft, position) => (
              <ConversationCard
                key={draft.key}
                draft={draft}
                position={position}
                total={drafts.length}
                onTitle={(title) => patch(draft.key, (target) => setTitle(target, title))}
                onRole={(index, role: MessageRole) =>
                  patch(draft.key, (target) => setRole(target, index, role))
                }
                onMerge={(index) => patch(draft.key, (target) => mergeUp(target, index))}
                onRemove={(index) => patch(draft.key, (target) => removeAt(target, index))}
                onDrop={() =>
                  setDrafts((current) => current.filter((other) => other.key !== draft.key))
                }
              />
            ))}
          </div>

          {drafts.length === 0 ? (
            <p className="text-body text-muted">
              Every conversation has been removed from this import.{' '}
              <button
                type="button"
                className="font-medium text-signal-blue underline underline-offset-4"
                onClick={() => setStage(candidates.length > 1 ? 'picking' : 'input')}
              >
                Go back
              </button>{' '}
              and tick them again, or start over with another file.
            </p>
          ) : (
            <div className="flex flex-wrap items-center gap-4">
              <Button onClick={() => void save()} disabled={!savable || busy}>
                {busy
                  ? 'Saving…'
                  : `Save ${drafts.length === 1 ? 'conversation' : `${drafts.length} conversations`} to Local Library`}
              </Button>
              <Button variant="ghost" onClick={startOver} className="text-muted hover:text-foreground">
                Clear and start over
              </Button>
              {!savable && !busy ? (
                <p className="text-caption text-muted">
                  {empty > 0
                    ? `${plural(empty, 'conversation')} ${empty === 1 ? 'has' : 'have'} no messages left, and an empty document is not worth keeping.`
                    : untitled > 0
                      ? `${plural(untitled, 'conversation')} ${untitled === 1 ? 'needs' : 'need'} a title before ${
                          untitled === 1 ? 'it is' : 'they are'
                        } saved.`
                      : null}
                </p>
              ) : null}
            </div>
          )}
        </div>
      )}
    </Container>
  )
}

export { ImportPage }
