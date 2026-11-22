import { Link } from 'react-router-dom'
import { Sparkles } from 'lucide-react'

import { BlockView } from '@/components/documents/block-view'
import { Button } from '@/components/ui/button'
import { buttonVariants } from '@/components/ui/button-variants'
import { Modal } from '@/components/ui/modal'
import { formatBytes, formatDateTime, MODE_LABEL, PROVIDER_LABEL, ROLE_LABEL } from '@/lib/format'
import type { LocalDocument, NormalizedMessage } from '@/types/document'

interface DocumentDetailProps {
  document: LocalDocument
  onClose: () => void
  onDelete: () => void
}

function MessageView({ message }: { message: NormalizedMessage }) {
  return (
    <li className="flex flex-col gap-3 rounded-product border border-border bg-input p-5">
      <p className="flex items-center gap-3">
        <span className="text-caption font-semibold tracking-[0.16em] text-slate-gray uppercase">
          {ROLE_LABEL[message.role]}
        </span>
        <span className="text-caption text-muted">
          {message.timestamp ? formatDateTime(message.timestamp) : 'No timestamp'}
        </span>
      </p>
      <div className="flex flex-col gap-3">
        {message.content.map((block, index) => (
          <BlockView key={index} block={block} />
        ))}
      </div>
    </li>
  )
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <p className="text-caption font-semibold tracking-[0.16em] text-slate-gray uppercase">
        {label}
      </p>
      <p className="truncate text-body-sm font-medium text-foreground" title={value}>
        {value}
      </p>
    </div>
  )
}

/**
 * Inspection. Everything the library actually holds about one document —
 * the tags, the derived figures recalculated at the last write, and the
 * conversation itself in order — so a user can confirm what was saved
 * without trusting the list.
 */
function DocumentDetail({ document: record, onClose, onDelete }: DocumentDetailProps) {
  return (
    <Modal
      size="lg"
      title={record.title}
      description={`Stored in this browser since ${formatDateTime(record.createdAt)}`}
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" className="mr-auto text-muted hover:text-foreground" onClick={onDelete}>
            Delete
          </Button>
          <Button onClick={onClose}>Close</Button>
          <Link
            to={`/editor/${record.id}`}
            className={buttonVariants({ variant: 'outline', size: 'default' })}
            aria-label={`Edit ${record.title} in studio`}
          >
            Open in editor
          </Link>
          <Link
            to={`/transform/${record.id}`}
            className={buttonVariants({ variant: 'outline', size: 'default' })}
            aria-label={`Open the AI document modes for ${record.title}`}
          >
            <Sparkles aria-hidden className="size-4" /> AI modes
          </Link>
          <Link
            to={`/export/${record.id}`}
            className={buttonVariants({ variant: 'primary', size: 'default' })}
            aria-label={`Export ${record.title}`}
          >
            Export Document
          </Link>
        </>
      }
    >
      <dl className="grid grid-cols-2 gap-6 rounded-product border border-border bg-pebble p-5 sm:grid-cols-3">
        <Meta label="Source" value={PROVIDER_LABEL[record.provider]} />
        <Meta label="Mode" value={MODE_LABEL[record.mode]} />
        <Meta label="Messages" value={String(record.messageCount)} />
        <Meta label="Size" value={formatBytes(record.sizeBytes)} />
        <Meta label="Created" value={formatDateTime(record.createdAt)} />
        <Meta label="Last edited" value={formatDateTime(record.updatedAt)} />
      </dl>

      <ol className="flex flex-col gap-4">
        {record.messages.map((message) => (
          <MessageView key={message.id} message={message} />
        ))}
      </ol>

      <p className="text-caption text-muted">
        Identifier {record.id}. Code, tables and formulas are drawn from the stored blocks, exactly
        as they were read. The page-sized, styled document — and its PDF, DOCX, HTML, Markdown or
        TXT file — is what <Link to={`/export/${record.id}`}>the export preview</Link> puts on top
        of the same blocks.
      </p>
    </Modal>
  )
}

export { DocumentDetail }
