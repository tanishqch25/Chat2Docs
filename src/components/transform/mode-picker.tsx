import { ArrowRight, Sparkles } from 'lucide-react'

import { Panel, StatRow } from '@/components/transform/transform-steps'
import { Button } from '@/components/ui/button'
import { Field, Input, Textarea } from '@/components/ui/field'
import { AI_MODE_INFO, AI_MODES, sourceStats } from '@/lib/ai/documentModes'
import type { AiMode, CustomBrief } from '@/lib/ai/documentModes'
import { PROVIDER_LABEL } from '@/lib/format'
import { cn } from '@/lib/utils'
import type { LocalDocument } from '@/types/document'

interface ModePickerProps {
  document: LocalDocument
  mode: AiMode
  custom: CustomBrief
  onMode: (mode: AiMode) => void
  onCustom: (patch: Partial<CustomBrief>) => void
  onContinue: () => void
}

/**
 * Step one: what to make, from what is already stored.
 *
 * The three modes are drawn as the same list rather than three buttons
 * because they differ in what they produce, and the difference has to be
 * read before it is chosen. What the source actually holds is counted here,
 * above the choice, because the length of a thread is the thing that decides
 * whether a request is worth spending.
 *
 * Nothing here sends anything anywhere. The key is the next step, and no key
 * means no request — by construction, not by a warning.
 */
function ModePicker({ document: record, mode, custom, onMode, onCustom, onContinue }: ModePickerProps) {
  const stats = sourceStats(record)
  const briefIncomplete =
    mode === 'custom' &&
    (custom.customTitle.trim() === '' || custom.instructions.trim() === '')

  return (
    <Panel
      title="What should PromptPaper make from this?"
      description={
        <>
          {`“${record.title}” is stored as ${PROVIDER_LABEL[record.provider]} · exact conversation. `}
          A restructured document is written beside it as a new record. The exact conversation is
          never rewritten, so this thread stays openable and exportable in full whichever mode you
          choose.
        </>
      }
    >
      <StatRow
        items={[
          { label: 'Messages', value: String(stats.messages) },
          { label: 'Blocks', value: String(stats.blocks) },
          { label: 'Code', value: String(stats.code) },
          { label: 'Tables', value: String(stats.tables) },
          { label: 'Equations', value: String(stats.equations) },
          { label: 'Characters', value: stats.characters.toLocaleString() },
        ]}
      />

      <fieldset className="flex flex-col gap-3">
        <legend className="sr-only">Document mode</legend>
        {AI_MODES.map((key) => {
          const info = AI_MODE_INFO[key]
          const on = key === mode
          return (
            <label key={key} className="cursor-pointer">
              <input
                type="radio"
                name="transform-mode"
                value={key}
                checked={on}
                onChange={() => onMode(key)}
                className="peer sr-only"
              />
              <span
                className={cn(
                  'flex flex-col gap-2 rounded-product border p-5 transition-colors',
                  'peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-signal-blue',
                  on
                    ? 'border-signal-blue bg-badge-bg'
                    : 'border-border bg-input hover:border-mist-gray',
                )}
              >
                <span className="flex items-center gap-2">
                  <Sparkles
                    aria-hidden
                    className={on ? 'size-4 text-deep-cobalt' : 'size-4 text-slate-gray'}
                  />
                  <b className="text-body font-semibold text-foreground">{info.label}</b>
                </span>
                <span className="max-w-[70ch] text-body-sm text-muted">{info.blurb}</span>
              </span>
            </label>
          )
        })}
      </fieldset>

      {mode === 'custom' ? (
        <div className="flex flex-col gap-5 rounded-product border border-border bg-pebble p-5">
          <p className="text-caption font-semibold tracking-[0.16em] text-slate-gray uppercase">
            Your brief
          </p>
          <Field label="Document title" htmlFor="custom-title">
            <Input
              id="custom-title"
              value={custom.customTitle}
              onChange={(event) => onCustom({ customTitle: event.target.value })}
              placeholder="e.g. Weekend read: gradient descent"
            />
          </Field>
          <Field
            label="What to pull out"
            htmlFor="custom-instructions"
            hint="Ask for the shape you want. The conversation stays the only source of facts, so a request for outside knowledge is answered with a note that the thread does not cover it."
          >
            <Textarea
              id="custom-instructions"
              value={custom.instructions}
              onChange={(event) => onCustom({ instructions: event.target.value })}
              placeholder="Lead with the decision, keep the two code samples, list what changed between the first and last answer."
            />
          </Field>
          <Field label="Reader and tone" htmlFor="custom-audience">
            <Input
              id="custom-audience"
              value={custom.audienceTone}
              onChange={(event) => onCustom({ audienceTone: event.target.value })}
              placeholder="A new teammate, plainly. Or revision notes, terse."
            />
          </Field>
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-4">
        <Button onClick={onContinue} disabled={briefIncomplete}>
          Continue
          <ArrowRight aria-hidden className="size-4" />
        </Button>
        {briefIncomplete ? (
          <p className="text-caption text-muted">
            A custom document needs a title and at least one instruction.
          </p>
        ) : (
          <p className="text-caption text-muted">
            Next is the key step. PromptPaper will not ask a model anything until you give it one.
          </p>
        )}
      </div>
    </Panel>
  )
}

export { ModePicker }
