import { useState } from 'react'
import { ChevronDown, X } from 'lucide-react'

import { PreservationSummary } from '@/components/import/preservation-summary'
import { TurnPreview } from '@/components/import/turn-preview'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Field, Input } from '@/components/ui/field'
import { reportOf } from '@/components/import/draft'
import type { ImportDraft } from '@/components/import/draft'
import { formatDateTime, PROVIDER_LABEL } from '@/lib/format'
import type { MessageRole } from '@/types/document'

interface ConversationCardProps {
  draft: ImportDraft
  position: number
  total: number
  onTitle: (title: string) => void
  onRole: (index: number, role: MessageRole) => void
  onMerge: (index: number) => void
  onRemove: (index: number) => void
  /** Take this conversation out of the import without touching the file. */
  onDrop: () => void
}

/**
 * One conversation, checked over before it becomes a document.
 *
 * The preview is collapsed unless this is the only thing being imported,
 * because an archive can hand over a hundred threads and a wall of message
 * blocks is not a list anyone can choose from. Opening one shows the same
 * blocks the library will store, drawn by the same renderer, so what is
 * being approved here is what will be kept.
 */
function ConversationCard({
  draft,
  position,
  total,
  onTitle,
  onRole,
  onMerge,
  onRemove,
  onDrop,
}: ConversationCardProps) {
  const [open, setOpen] = useState(total === 1)
  const report = reportOf(draft)
  const id = `import-title-${draft.key}`

  return (
    <section
      aria-label={`Conversation ${position + 1} of ${total}`}
      className="flex flex-col gap-5 rounded-card border border-border bg-card p-6 shadow-link"
    >
      <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
        <div className="flex min-w-0 flex-1 flex-col gap-4">
          <Field label="Document title" htmlFor={id}>
            <Input
              id={id}
              value={draft.title}
              onChange={(event) => onTitle(event.target.value)}
              placeholder="Name this conversation"
            />
          </Field>

          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <Badge>{PROVIDER_LABEL[draft.provider]}</Badge>
            <p className="text-caption text-muted">
              {report.stats.totalMessages} messages
              {draft.source ? ` · from ${draft.source}` : ''}
              {draft.createdAt ? ` · started ${formatDateTime(draft.createdAt)}` : ''}
            </p>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <Button variant="outline" size="sm" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
            <ChevronDown
              aria-hidden
              className={`size-4 transition-transform ${open ? 'rotate-180' : ''}`}
            />
            {open ? 'Hide preview' : 'Preview messages'}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="text-muted hover:text-foreground"
            onClick={onDrop}
          >
            <X aria-hidden className="size-4" />
            Remove
          </Button>
        </div>
      </div>

      {open ? (
        <div className="flex flex-col gap-5">
          <PreservationSummary stats={report.stats} warnings={report.warnings} />

          {draft.messages.length === 0 ? (
            <p className="text-body text-muted">
              Every message in this conversation has been removed, so there is nothing to save. Use
              Start Over, or undo it by going back to the file.
            </p>
          ) : (
            <ol className="flex flex-col gap-3">
              {draft.messages.map((message, index) => (
                <TurnPreview
                  key={message.id}
                  message={message}
                  index={index}
                  total={draft.messages.length}
                  onRole={(role) => onRole(index, role)}
                  onMerge={() => onMerge(index)}
                  onRemove={() => onRemove(index)}
                />
              ))}
            </ol>
          )}

          <p className="text-caption text-muted">
            The words are stored exactly as the file or the paste gave them. What can be fixed here
            is who spoke and where one message ends.
          </p>
        </div>
      ) : null}
    </section>
  )
}

export { ConversationCard }
