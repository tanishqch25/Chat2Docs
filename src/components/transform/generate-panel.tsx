import { Link } from 'react-router-dom'
import { ArrowLeft, ArrowRight, ExternalLink, Square, Sparkles } from 'lucide-react'

import { BlockView } from '@/components/documents/block-view'
import { Panel } from '@/components/transform/transform-steps'
import { Button } from '@/components/ui/button'
import { buttonVariants } from '@/components/ui/button-variants'
import { Field, Input } from '@/components/ui/field'
import { AI_PROVIDER_LABEL } from '@/lib/ai/aiSettings'
import type { AiSettings } from '@/lib/ai/aiSettings'
import { AI_MODE_INFO, sourceStats } from '@/lib/ai/documentModes'
import type { AiMode, CustomBrief, GeneratedDocument } from '@/lib/ai/documentModes'
import { MODE_LABEL, ROLE_LABEL, formatDateTime } from '@/lib/format'
import type { LocalDocument, NormalizedMessage } from '@/types/document'

interface GeneratePanelProps {
  document: LocalDocument
  mode: AiMode
  custom: CustomBrief
  settings: AiSettings
  generating: boolean
  busy: boolean
  /** The last answer, parsed. Null means nothing has been asked yet, or the
   *  ask failed — the reason arrives separately, as `error`. */
  result: GeneratedDocument | null
  error: string | null
  title: string
  savedRecord: { id: string; title: string } | null
  onTitle: (value: string) => void
  onGenerate: () => void
  onCancel: () => void
  onBack: () => void
  onSave: () => void
}

function PreviewMessage({ message }: { message: NormalizedMessage }) {
  return (
    <li className="flex flex-col gap-3 rounded-product border border-border bg-input p-5">
      <p className="flex items-center gap-3">
        <span className="text-caption font-semibold tracking-[0.16em] text-slate-gray uppercase">
          {ROLE_LABEL[message.role]}
        </span>
        {message.timestamp ? (
          <span className="text-caption text-muted">{formatDateTime(message.timestamp)}</span>
        ) : null}
      </p>
      <div className="flex flex-col gap-3">
        {message.content.map((block, index) => (
          <BlockView key={index} block={block} />
        ))}
      </div>
    </li>
  )
}

/**
 * Step three: ask, read, then decide whether to keep.
 *
 * The request summary is written out before the button, in the present
 * tense, because the one thing a user should never have to wonder is what is
 * about to leave their machine. After the answer, the preview is the stored
 * document itself — the same block renderer the library uses — so what is
 * reviewed is what would be saved, and the Save button cannot surprise
 * anyone.
 *
 * Saving is a separate press. A generated document is not in the library
 * until someone says so, and deleting it later leaves the conversation it
 * came from exactly where it was.
 */
function GeneratePanel({
  document: record,
  mode,
  custom,
  settings,
  generating,
  busy,
  result,
  error,
  title,
  savedRecord,
  onTitle,
  onGenerate,
  onCancel,
  onBack,
  onSave,
}: GeneratePanelProps) {
  const stats = sourceStats(record)
  const info = AI_MODE_INFO[mode]
  const asking = `${AI_PROVIDER_LABEL[settings.provider]} · ${settings.model}`

  return (
    <Panel
      title={`Make the ${info.label.toLowerCase()}`}
      description={
        <>
          One request, this conversation, {asking}. Nothing is written to the library until you
          press Save as New Document, and {record.title} stays stored as {MODE_LABEL[record.mode]}
          whichever way this goes.
        </>
      }
      footer={
        savedRecord ? (
          <>
            <Link
              to={`/editor/${savedRecord.id}`}
              className={buttonVariants({ variant: 'primary' })}
            >
              Open in editor <ExternalLink aria-hidden className="size-4" />
            </Link>
            <Link to={`/export/${savedRecord.id}`} className={buttonVariants({ variant: 'outline' })}>
              Export it <ArrowRight aria-hidden className="size-4" />
            </Link>
            <Link to="/documents" className={buttonVariants({ variant: 'ghost' })}>
              Back to the library
            </Link>
          </>
        ) : (
          <>
            <Button variant="ghost" onClick={onBack} className="text-muted hover:text-foreground">
              <ArrowLeft aria-hidden className="size-4" />
              Key
            </Button>
            {generating ? (
              <Button variant="outline" onClick={onCancel}>
                <Square aria-hidden className="size-4" />
                Cancel
              </Button>
            ) : (
              <Button onClick={onGenerate} disabled={busy}>
                <Sparkles aria-hidden className="size-4" />
                {result ? 'Generate again' : 'Generate Document'}
              </Button>
            )}
          </>
        )
      }
    >
      {savedRecord ? (
        <div className="flex flex-col gap-3 rounded-product border border-border bg-badge-bg p-5">
          <h3 className="text-body font-semibold text-deep-cobalt">
            Saved as “{savedRecord.title}”
          </h3>
          <p className="max-w-[70ch] text-body-sm text-deep-cobalt/90">
            It is a new document in this browser, beside the conversation it was made from. The
            original is still in the library with every message it had.
          </p>
        </div>
      ) : null}

      {generating ? (
        <p role="status" aria-live="polite" className="text-body text-muted">
          Asking {settings.model} to restructure {stats.messages} messages. Cancel stops the request
          and keeps nothing.
        </p>
      ) : null}

      {error ? (
        <div
          role="alert"
          className="flex flex-col gap-2 rounded-product border border-border bg-input p-5"
        >
          <p className="text-body text-foreground">{error}</p>
          <p className="text-caption text-muted">
            Nothing was saved, and the original document is untouched.
          </p>
        </div>
      ) : null}

      {result && !savedRecord ? (
        <>
          <div className="flex flex-wrap items-center justify-between gap-4">
            <h3 className="text-body font-semibold text-foreground">Structured preview</h3>
            <p className="text-caption text-muted">
              {result.blocks.length} blocks from {result.markdown.length.toLocaleString()} characters
              of Markdown · {settings.model} · {formatDateTime(result.at)}
            </p>
          </div>

          <ol className="flex flex-col gap-4">
            {result.messages.map((message) => (
              <PreviewMessage key={message.id} message={message} />
            ))}
          </ol>

          <Field
            label="Title for the new document"
            htmlFor="derived-title"
            hint="The disclosure notice above is stored as the document’s first message, so it travels into the preview, the editor and every export."
          >
            <Input id="derived-title" value={title} onChange={(event) => onTitle(event.target.value)} />
          </Field>

          <div className="flex flex-wrap items-center gap-4">
            <Button onClick={onSave} disabled={busy || title.trim() === ''}>
              Save as New Document
            </Button>
            {mode === 'custom' && custom.customTitle.trim() === '' ? (
              <p className="text-caption text-muted">
                A custom document with no title is a document nobody can find again.
              </p>
            ) : null}
          </div>
        </>
      ) : null}
    </Panel>
  )
}

export { GeneratePanel }
