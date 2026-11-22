import * as React from 'react'
import { ArrowLeft, ArrowRight, Eye, EyeOff, KeyRound } from 'lucide-react'

import { Panel } from '@/components/transform/transform-steps'
import { Button } from '@/components/ui/button'
import { Field, Input, Select } from '@/components/ui/field'
import { AI_PROVIDER_LABEL, BLANK_SETTINGS, DEFAULT_MODEL } from '@/lib/ai/aiSettings'
import type { AiProvider, AiSettings } from '@/lib/ai/aiSettings'

interface ByokPanelProps {
  /** What the fields hold, which may not be what storage holds. */
  draft: AiSettings
  /** What this browser actually kept, which is what Generate will use. */
  saved: AiSettings
  onChange: (next: AiSettings) => void
  onSave: () => void
  onClear: () => void
  onBack: () => void
  onContinue: () => void
}

const PROVIDERS: AiProvider[] = ['gemini', 'openai_compatible']

const same = (a: AiSettings, b: AiSettings) => JSON.stringify(a) === JSON.stringify(b)

/**
 * Step two: the key, held only by this browser.
 *
 * This panel is the whole of PromptPaper's relationship with a credential.
 * It asks the page to write to `localStorage` when Save is pressed, it asks
 * for that entry to be wiped when Clear Key is pressed, and the key it holds
 * goes into exactly one request — the one Generate starts. It is never part
 * of a document record, so a library backup cannot carry it, and it leaves
 * the tab by no other route.
 *
 * The field masks by default because a key is pasted from an account page and
 * then sits there while the rest of the form is filled in. Revealing it is a
 * deliberate, reversible click, not the default.
 */
function ByokPanel({ draft, saved, onChange, onSave, onClear, onBack, onContinue }: ByokPanelProps) {
  const [shown, setShown] = React.useState(false)

  const patch = (change: Partial<AiSettings>) => onChange({ ...draft, ...change })

  const chooseProvider = (provider: AiProvider) =>
    onChange({
      ...draft,
      provider,
      // Only a shipped default is swapped: a model name someone typed on
      // purpose stays exactly where they left it.
      model:
        draft.model === DEFAULT_MODEL.gemini || draft.model === DEFAULT_MODEL.openai_compatible
          ? DEFAULT_MODEL[provider]
          : draft.model,
    })

  const dirty = !same(draft, saved)
  const usable = saved.apiKey.trim().length > 0 && saved.model.trim().length > 0

  return (
    <Panel
      title="Bring your own key"
      description={
        <>
          PromptPaper has no server, no account and no key of its own. The request goes from this
          tab to the provider you name, with the key you paste, and the answer comes straight back
          to this tab.
        </>
      }
      footer={
        <>
          <Button variant="ghost" onClick={onBack} className="text-muted hover:text-foreground">
            <ArrowLeft aria-hidden className="size-4" />
            Modes
          </Button>
          <Button variant="outline" onClick={onSave} disabled={!dirty}>
            Save in Browser
          </Button>
          <Button variant="ghost" onClick={onClear} disabled={saved.apiKey === ''}>
            Clear Key
          </Button>
          <Button onClick={onContinue} disabled={!usable}>
            Generate
            <ArrowRight aria-hidden className="size-4" />
          </Button>
        </>
      }
    >
      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="Provider" htmlFor="ai-provider">
          <Select
            id="ai-provider"
            value={draft.provider}
            onChange={(event) => chooseProvider(event.target.value as AiProvider)}
          >
            {PROVIDERS.map((value) => (
              <option key={value} value={value}>
                {AI_PROVIDER_LABEL[value]}
              </option>
            ))}
          </Select>
        </Field>

        <Field
          label="Model"
          htmlFor="ai-model"
          hint={
            draft.provider === 'gemini'
              ? 'Any Gemini model name your key can call, e.g. gemini-2.5-flash or gemini-2.5-pro.'
              : 'Whatever the address you point at calls it.'
          }
        >
          <Input
            id="ai-model"
            value={draft.model}
            spellCheck={false}
            onChange={(event) => patch({ model: event.target.value })}
            placeholder={DEFAULT_MODEL[draft.provider]}
          />
        </Field>
      </div>

      <Field
        label="API key"
        htmlFor="ai-key"
        hint={
          shown
            ? 'Revealed. This is a screen only you are looking at.'
            : 'Masked as you type. It reaches this browser’s storage only when you press Save in Browser.'
        }
      >
        <div className="relative">
          <KeyRound
            aria-hidden
            className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate-gray"
          />
          <Input
            id="ai-key"
            className="pr-12 pl-10"
            type={shown ? 'text' : 'password'}
            autoComplete="off"
            autoCapitalize="off"
            spellCheck={false}
            value={draft.apiKey}
            onChange={(event) => patch({ apiKey: event.target.value })}
            placeholder="Paste the key from your provider’s console"
          />
          <button
            type="button"
            onClick={() => setShown((current) => !current)}
            aria-pressed={shown}
            className="absolute top-1/2 right-2 -translate-y-1/2 rounded-input p-2 text-muted transition-colors hover:bg-pebble hover:text-foreground"
          >
            {shown ? <EyeOff aria-hidden className="size-4" /> : <Eye aria-hidden className="size-4" />}
            <span className="sr-only">{shown ? 'Hide the key' : 'Show the key'}</span>
          </button>
        </div>
      </Field>

      {draft.provider === 'openai_compatible' ? (
        <Field
          label="Base URL"
          htmlFor="ai-base-url"
          hint="OpenAI-shaped endpoints only: the page posts to the address plus /chat/completions. Point it at OpenRouter, Groq or a local Ollama — the default is api.openai.com."
        >
          <Input
            id="ai-base-url"
            value={draft.baseUrl}
            spellCheck={false}
            onChange={(event) => patch({ baseUrl: event.target.value })}
            placeholder={BLANK_SETTINGS.baseUrl}
          />
        </Field>
      ) : (
        <p className="text-body-sm text-muted">
          Gemini calls go to{' '}
          <code className="font-mono text-[0.92em]">generativelanguage.googleapis.com</code>, Google’s
          own endpoint, over https. There is no address to change.
        </p>
      )}

      <div className="flex flex-col gap-2 rounded-product border border-border bg-pebble p-5">
        <p className="text-caption font-semibold tracking-[0.16em] text-slate-gray uppercase">
          Where this key lives
        </p>
        <ul className="flex flex-col gap-2 text-body-sm text-muted">
          <li>
            In this browser’s <code className="font-mono text-[0.92em]">localStorage</code>, under{' '}
            <code className="font-mono text-[0.92em]">promptpaper.ai.settings.v1</code>, and nowhere
            else — not inside a document, and not inside a backup file you export.
          </li>
          <li>
            Clear Key, or your browser’s own site-data controls, removes it completely. PromptPaper
            keeps no copy anywhere else to remove.
          </li>
          <li>
            {saved.apiKey === ''
              ? 'No key is saved in this browser yet, so Generate is closed.'
              : `A key is saved for ${AI_PROVIDER_LABEL[saved.provider]} · ${saved.model}.`}
            {dirty ? ' What is typed above has not been saved yet.' : ''}
          </li>
        </ul>
      </div>
    </Panel>
  )
}

export { ByokPanel }
