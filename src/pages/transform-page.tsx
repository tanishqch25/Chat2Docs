import * as React from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { ArrowRight } from 'lucide-react'

import { ByokPanel } from '@/components/transform/byok-panel'
import { GeneratePanel } from '@/components/transform/generate-panel'
import { ModePicker } from '@/components/transform/mode-picker'
import { Notice, StepRail } from '@/components/transform/transform-steps'
import type { TransformStep } from '@/types/transform'
import { Container } from '@/components/layout/container'
import { Eyebrow } from '@/components/layout/section-header'
import { buttonVariants } from '@/components/ui/button-variants'
import { useDocuments } from '@/hooks/useDocuments'
import { AiCancelledError, generateMarkdown } from '@/lib/ai/aiClient'
import { BLANK_SETTINGS, clearAiSettings, loadAiSettings, saveAiSettings } from '@/lib/ai/aiSettings'
import type { AiSettings } from '@/lib/ai/aiSettings'
import { AI_MODES, buildPrompt, derivedTitle, toDerivedContent } from '@/lib/ai/documentModes'
import type { AiMode, CustomBrief, GeneratedDocument } from '@/lib/ai/documentModes'

const EMPTY_BRIEF: CustomBrief = { customTitle: '', instructions: '', audienceTone: '' }

/**
 * The opt-in AI modes.
 *
 * Three steps in one page, because the three questions a restructuring asks
 * are separate and in order: what to make, whether you are willing to send
 * this conversation anywhere, and whether the answer is worth keeping. Each
 * gets its own screen, and none of them happens by itself.
 *
 * Two rules hold the whole thing honest. Nothing leaves the tab until
 * Generate is pressed with a key that was typed — the request is built here
 * and sent from here, with no PromptPaper server in between. And the answer
 * becomes a new record beside the conversation, never a change to it, so the
 * exact thread can always be opened again and every mode that restructures
 * says so in its own first message.
 */
function MissingState({ documentId, problem }: { documentId?: string; problem: string | null }) {
  return (
    <Container className="py-16 sm:py-24">
      <div className="flex max-w-xl flex-col gap-5">
        <Eyebrow>AI document modes</Eyebrow>
        <h1 className="text-heading font-semibold text-foreground">
          {problem ? 'The library could not be read' : 'No document at this address'}
        </h1>
        <p className="text-body text-muted">
          {problem ??
            `PromptPaper looked in this browser for the document ${documentId ?? 'you asked for'} and did not find it. ` +
              'Restructuring works on what is stored here, so there is nothing to restructure until ' +
              'a conversation has been imported or written — and a document lives where it was saved.'}
        </p>
        <div className="flex flex-wrap gap-3">
          <Link to="/documents" className={buttonVariants({ variant: 'primary' })}>
            Back to the library <ArrowRight aria-hidden className="size-4" />
          </Link>
          <Link to="/import" className={buttonVariants({ variant: 'outline' })}>
            Import a conversation
          </Link>
        </div>
      </div>
    </Container>
  )
}

function TransformPage() {
  const { documentId } = useParams()
  const [search] = useSearchParams()
  const library = useDocuments()
  const record = library.documents.find((each) => each.id === documentId)

  const [step, setStep] = React.useState<TransformStep>('mode')
  // Import can hand a conversation straight to one mode, and an address that
  // names a mode this page does not have starts at the choice it was already
  // going to show rather than picking a task for the visitor.
  const wanted = search.get('mode')
  const [mode, setMode] = React.useState<AiMode>(
    wanted && (AI_MODES as readonly string[]).includes(wanted) ? (wanted as AiMode) : 'study_notes',
  )
  const [custom, setCustom] = React.useState<CustomBrief>(EMPTY_BRIEF)
  const [settings, setSettings] = React.useState<AiSettings>(() => loadAiSettings())
  /** The key panel's fields. Held here rather than inside the panel because
   *  clearing storage has to clear the fields in the same moment, and an
   *  effect that copies one into the other would be a second, lagging truth. */
  const [draft, setDraft] = React.useState<AiSettings>(() => loadAiSettings())
  const [result, setResult] = React.useState<GeneratedDocument | null>(null)
  const [title, setTitle] = React.useState('')
  const [generating, setGenerating] = React.useState(false)
  /** Why a request or a write failed, kept apart from `error`: a provider
   *  refusing a key belongs to the answer panel, a browser refusing storage
   *  belongs to the page. */
  const [askError, setAskError] = React.useState<string | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const [saving, setSaving] = React.useState(false)
  const [savedRecord, setSavedRecord] = React.useState<{ id: string; title: string } | null>(null)
  const abort = React.useRef<AbortController | null>(null)

  // Navigating away is a cancellation: a request that answers to a page that
  // is gone would write into state nobody is reading.
  React.useEffect(() => () => abort.current?.abort(), [])

  const hasKey = settings.apiKey.trim() !== ''
  const furthest: TransformStep = hasKey ? 'generate' : 'key'

  const changeMode = (next: AiMode) => {
    setMode(next)
    setResult(null)
    setSavedRecord(null)
    setError(null)
    setAskError(null)
  }

  const changeCustom = (patch: Partial<CustomBrief>) => {
    setCustom((current) => ({ ...current, ...patch }))
    setResult(null)
  }

  const persistKey = () => {
    setError(null)
    try {
      saveAiSettings(draft)
      // Read it back rather than trusting the fields: what is in storage is
      // what Generate will use, and the two must never be described apart.
      setSettings(loadAiSettings())
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : 'This browser would not keep the key.')
    }
  }

  const clearKey = () => {
    clearAiSettings()
    setSettings(BLANK_SETTINGS)
    setDraft(BLANK_SETTINGS)
    setResult(null)
    setSavedRecord(null)
    setError(null)
    setAskError(null)
    setStep('key')
  }

  const generate = async () => {
    if (!record) return
    const controller = new AbortController()
    abort.current = controller
    setStep('generate')
    setGenerating(true)
    setError(null)
    setAskError(null)
    setResult(null)
    setSavedRecord(null)

    try {
      const markdown = await generateMarkdown(
        settings,
        buildPrompt({ mode, document: record, custom }),
        controller.signal,
      )
      const derived = toDerivedContent(markdown, {
        mode,
        model: settings.model,
        provider: settings.provider,
        at: new Date().toISOString(),
        originalTitle: record.title,
      })
      setResult(derived)
      setTitle(derivedTitle(mode, record.title, mode === 'custom' ? custom.customTitle : undefined))
    } catch (problem) {
      setAskError(
        problem instanceof AiCancelledError
          ? 'Generation cancelled. Nothing came back, so nothing was kept.'
          : problem instanceof Error
            ? problem.message
            : 'The request failed in a way PromptPaper has no words for.',
      )
    } finally {
      abort.current = null
      setGenerating(false)
    }
  }

  const keep = async () => {
    if (!record || !result) return
    setAskError(null)
    setSaving(true)
    const created = await library.createDerived({
      title,
      provider: record.provider,
      mode,
      messages: result.messages,
    })
    setSaving(false)
    // A refused write is already in `library.problem`; a saved one needs its
    // own address, which is what these links are for.
    if (created) setSavedRecord({ id: created.id, title: created.title })
  }

  if (library.status === 'loading') {
    return (
      <Container className="py-16 sm:py-24">
        <p className="text-body text-muted" role="status">
          Reading this browser’s library…
        </p>
      </Container>
    )
  }

  if (!record) return <MissingState documentId={documentId} problem={library.problem} />

  return (
    <Container className="flex flex-col gap-10 py-14 lg:py-20">
      <div className="flex flex-col items-start gap-5">
        <Eyebrow>AI document modes</Eyebrow>
        <h1 className="max-w-[20ch] text-heading-lg font-bold text-balance text-foreground">
          Restructure {record.title}
        </h1>
        <p className="max-w-[66ch] text-body-lg text-muted">
          Study notes, interview preparation, or a document you describe — made from a conversation
          this browser already holds, with your own API key and no PromptPaper account.
        </p>
        <ul className="flex flex-col gap-2 text-caption text-muted">
          <li>
            The exact conversation is never rewritten. A restructured document is saved as a new
            record, and opens by saying it was written by AI.
          </li>
          <li>
            Your key stays in this browser’s site storage: not in a document, not in a backup file,
            and not sent anywhere except the provider you name.
          </li>
          <li>Nothing is asked of any model until you press Generate.</li>
        </ul>
      </div>

      <StepRail step={step} furthest={furthest} onJump={setStep} />

      {error ? <Notice tone="problem" text={error} onDismiss={() => setError(null)} /> : null}
      {library.problem && library.problem !== error ? (
        <Notice tone="problem" text={library.problem} onDismiss={library.dismissProblem} />
      ) : null}

      {step === 'mode' ? (
        <ModePicker
          document={record}
          mode={mode}
          custom={custom}
          onMode={changeMode}
          onCustom={changeCustom}
          onContinue={() => setStep('key')}
        />
      ) : step === 'key' ? (
        <ByokPanel
          draft={draft}
          saved={settings}
          onChange={setDraft}
          onSave={persistKey}
          onClear={clearKey}
          onBack={() => setStep('mode')}
          onContinue={() => setStep('generate')}
        />
      ) : (
        <GeneratePanel
          document={record}
          mode={mode}
          custom={custom}
          settings={settings}
          generating={generating}
          busy={saving}
          result={result}
          error={askError}
          title={title}
          savedRecord={savedRecord}
          onTitle={setTitle}
          onGenerate={() => void generate()}
          onCancel={() => abort.current?.abort()}
          onBack={() => setStep('key')}
          onSave={() => void keep()}
        />
      )}
    </Container>
  )
}

export { TransformPage }
