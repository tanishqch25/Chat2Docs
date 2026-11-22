import { ArrowUpToLine, Trash } from 'lucide-react'

import { BlockView } from '@/components/documents/block-view'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Select } from '@/components/ui/field'
import { formatDateTime, ROLE_LABEL } from '@/lib/format'
import { MESSAGE_ROLES } from '@/types/document'
import type { MessageRole, NormalizedMessage } from '@/types/document'

interface TurnPreviewProps {
  message: NormalizedMessage
  index: number
  /** How many turns this conversation has after the edits made here, so the
   *  number beside a message cannot describe the file it came from. */
  total: number
  onRole: (role: MessageRole) => void
  onMerge: () => void
  onRemove: () => void
}

/** The export's own name for the model, when it carried one. */
function modelOf(message: NormalizedMessage): string | undefined {
  const slug = message.metadata?.model_slug
  return typeof slug === 'string' && slug.length > 0 ? slug : undefined
}

/**
 * One turn, open for the two things an import genuinely cannot decide on
 * its own: who was speaking, and where one message ends.
 *
 * The words themselves are not editable here, which is the point. Rewriting
 * a thread is the editor's job and needs a milestone of its own; this screen
 * only fixes the boundaries a parser had to guess at, and it renders the
 * stored blocks rather than a flattening of them, so a table that arrived as
 * a table is still one.
 */
function TurnPreview({ message, index, total, onRole, onMerge, onRemove }: TurnPreviewProps) {
  const model = modelOf(message)

  return (
    <li className="flex flex-col gap-3 rounded-product border border-border bg-input p-5">
      <div className="flex flex-wrap items-center gap-3">
        <Select
          aria-label={`Speaker for message ${index + 1}`}
          className="h-9 w-auto max-w-44 text-body-sm"
          value={message.role}
          onChange={(event) => onRole(event.target.value as MessageRole)}
        >
          {MESSAGE_ROLES.map((value) => (
            <option key={value} value={value}>
              {ROLE_LABEL[value]}
            </option>
          ))}
        </Select>

        <p className="text-caption text-muted">
          Message {index + 1} of {total}
          {message.timestamp ? ` · ${formatDateTime(message.timestamp)}` : ''}
        </p>

        {model ? <Badge variant="outline">{model}</Badge> : null}

        <div className="ml-auto flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            className="text-muted hover:text-foreground"
            disabled={index === 0}
            onClick={onMerge}
          >
            <ArrowUpToLine aria-hidden className="size-4" />
            Merge up
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="text-muted hover:text-foreground"
            aria-label={`Remove message ${index + 1}`}
            onClick={onRemove}
          >
            <Trash aria-hidden className="size-4" />
          </Button>
        </div>
      </div>

      <div className="flex flex-col gap-3">
        {message.content.map((block, blockIndex) => (
          <BlockView key={blockIndex} block={block} />
        ))}
      </div>
    </li>
  )
}

export { TurnPreview }
