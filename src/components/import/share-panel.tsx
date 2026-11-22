import * as React from 'react'
import { Link2 } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Field, Input } from '@/components/ui/field'
import { classifyShareUrl, providerOfShareUrl } from '@/lib/parsers/shareUrlParser'
import type { DocumentProvider } from '@/types/document'

interface SharePanelProps {
  value: string
  onChange: (value: string) => void
  onFetch: () => void
  onCancel: () => void
  busy: boolean
}

const PROVIDER_NAMES: Record<DocumentProvider, string> = {
  chatgpt: 'ChatGPT',
  gemini: 'Gemini',
  claude: 'Claude',
  generic: 'a shared conversation',
}

/**
 * Public share-link import.
 *
 * The address is judged as it is typed, in this browser, by the same
 * allowlist the server uses — which is why a private chat URL gets an
 * explanation here rather than a failed request. Nothing is asked of anyone
 * until Fetch is pressed, and what is sent when it is pressed is the link
 * and nothing else: no cookie, no session, no sign-in.
 *
 * The page that comes back is read in this tab by the same deterministic
 * readers an exported file goes through, and it lands in the same preview,
 * where every message it found can still be corrected before it is saved.
 */
function SharePanel({ value, onChange, onFetch, onCancel, busy }: SharePanelProps) {
  const provider = providerOfShareUrl(value)
  const verdict = classifyShareUrl(value)
  const privateChat = !verdict.ok && verdict.code === 'private-chat' ? verdict : null

  const submit = (event: React.FormEvent) => {
    event.preventDefault()
    if (!busy) onFetch()
  }

  return (
    <div className="flex flex-col gap-5">
      <form onSubmit={submit} className="flex flex-col gap-5">
        <Field
          label="Paste a public share link"
          htmlFor="import-share"
          hint={
            <>
              The link from <strong className="font-medium">Share → Copy link</strong> in ChatGPT,
              Gemini or Claude — the one that starts with <code className="font-mono">https://</code> and
              contains <code className="font-mono">/share/</code>. Only a link its owner made public is
              read; a page that does not answer within fifteen seconds is given up on rather than
              guessed at.
            </>
          }
        >
          <Input
            id="import-share"
            type="url"
            autoComplete="off"
            spellCheck={false}
            placeholder="https://chatgpt.com/share/67a5c1e2…"
            value={value}
            disabled={busy}
            onChange={(event) => onChange(event.target.value)}
          />
        </Field>

        <div className="flex flex-wrap items-center gap-4">
          {provider ? (
            <p className="flex items-center gap-2 rounded-badge border border-signal-blue bg-badge-bg px-3 py-1.5 text-caption font-medium text-deep-cobalt">
              <Link2 aria-hidden className="size-3.5" />
              {`A public ${PROVIDER_NAMES[provider]} share link`}
            </p>
          ) : null}

          {busy ? (
            <>
              <Button type="button" variant="outline" onClick={onCancel}>
                Stop reading
              </Button>
              <p role="status" aria-live="polite" className="text-body-sm text-muted">
                Asking the reader for this page…
              </p>
            </>
          ) : (
            <>
              <Button type="submit" disabled={value.trim().length === 0}>
                Fetch &amp; Preview
              </Button>
              {value.length > 0 ? (
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => onChange('')}
                  className="text-muted hover:text-foreground"
                >
                  Clear
                </Button>
              ) : null}
            </>
          )}
        </div>
      </form>

      {privateChat ? (
        <div
          role="status"
          className="flex flex-col gap-2 rounded-product border border-border bg-badge-bg px-5 py-4 text-body-sm text-deep-cobalt"
        >
          <p>{privateChat.message}</p>
          {privateChat.hint ? <p className="text-caption">{privateChat.hint}</p> : null}
        </div>
      ) : null}

      <p className="text-caption text-muted">
        Only the link leaves this tab, and only to this site’s own reader. The page it brings back
        is read here, message by message, and shows up below for you to check before anything is
        saved.
      </p>
    </div>
  )
}

export { SharePanel }
