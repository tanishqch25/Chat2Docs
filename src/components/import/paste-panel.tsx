import { Button } from '@/components/ui/button'
import { Field, Textarea } from '@/components/ui/field'

interface PastePanelProps {
  value: string
  onChange: (value: string) => void
  onPreview: () => void
}

/**
 * Copy-and-paste import.
 *
 * The text is read line by line, in this tab, by the same deterministic
 * reader that handles the file formats: a speaker label at the start of a
 * line or a heading that names one becomes a boundary, and nothing else
 * does. Where there are no labels at all the paste stays one message and
 * says so, because inventing an alternating conversation out of prose would
 * be the import deciding what the user meant.
 */
function PastePanel({ value, onChange, onPreview }: PastePanelProps) {
  const characters = value.length

  return (
    <div className="flex flex-col gap-5">
      <Field
        label="Paste a conversation"
        htmlFor="import-paste"
        hint={
          <>
            Put each speaker on its own line — <code className="font-mono">You:</code>{' '}
            <code className="font-mono">Assistant:</code> <code className="font-mono">ChatGPT:</code>{' '}
            <code className="font-mono">Claude:</code> <code className="font-mono">Gemini:</code> —
            or as a heading like <code className="font-mono">## You</code>. Headings, code fences,
            tables and formulas are recognised inside the reply.
          </>
        }
      >
        <Textarea
          id="import-paste"
          className="min-h-[22rem] font-mono text-body-sm"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={'You: How do I vectorize the backward pass?\n\nChatGPT: Three products per layer…'}
        />
      </Field>

      <div className="flex flex-wrap items-center gap-4">
        <Button onClick={onPreview} disabled={value.trim().length === 0}>
          Read the paste
        </Button>
        {value.length > 0 ? (
          <Button variant="ghost" onClick={() => onChange('')} className="text-muted hover:text-foreground">
            Clear
          </Button>
        ) : null}
        <p className="text-caption text-muted">
          {characters.toLocaleString()} characters · nothing is sent anywhere; the split into
          messages runs in this browser
        </p>
      </div>
    </div>
  )
}

export { PastePanel }
