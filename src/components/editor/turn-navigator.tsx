import { Link } from 'react-router-dom'

import { formatBytes, formatDateTime, MODE_LABEL, PROVIDER_LABEL, ROLE_LABEL } from '@/lib/format'
import type { EditorTurn } from '@/types/editor'
import type { LocalDocument } from '@/types/document'

interface TurnNavigatorProps {
  document: LocalDocument
  turns: EditorTurn[]
  /** The section the caret is in, so the outline can say where the reader is. */
  activeKey: string | null
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
 * The conversation as a list of places to go.
 *
 * The right pane is where the words change; this is the part that cannot,
 * which is why it is worth its own column. A reader editing a forty-message
 * thread needs to know that the figure they are looking for is in section 27
 * and that section 27 is the AI's, and needs to get there in one click — the
 * same reason a document has a table of contents.
 *
 * The links are fragments, not routes: jumping to a section is a scroll, and
 * the unsaved-changes guard in the workspace deliberately ignores those.
 */
function TurnNavigator({ document: record, turns, activeKey }: TurnNavigatorProps) {
  return (
    <div className="flex flex-col gap-6">
      <dl className="grid grid-cols-2 gap-x-4 gap-y-4 rounded-product border border-border bg-pebble p-5">
        <Meta label="Source" value={PROVIDER_LABEL[record.provider]} />
        <Meta label="Mode" value={MODE_LABEL[record.mode]} />
        <Meta label="Sections" value={String(turns.length)} />
        <Meta label="Stored" value={formatBytes(record.sizeBytes)} />
        <Meta label="Saved" value={formatDateTime(record.createdAt)} />
        <Meta label="Edited" value={formatDateTime(record.updatedAt)} />
      </dl>

      <nav aria-label="Sections in this document">
        <p className="mb-3 text-caption font-semibold tracking-[0.16em] text-slate-gray uppercase">
          Outline
        </p>
        <ol className="flex flex-col gap-1">
          {turns.map((turn, index) => {
            const position = index + 1
            const active = turn.key === activeKey
            return (
              <li key={turn.key}>
                <a
                  href={`#turn-${turn.key}`}
                  aria-current={active ? 'true' : undefined}
                  className="flex items-baseline gap-3 rounded-button px-2 py-1.5 text-body-sm transition-colors hover:bg-pebble focus-visible:bg-pebble"
                >
                  <span className="font-semibold tabular-nums text-slate-gray">
                    {String(position).padStart(2, '0')}
                  </span>
                  <span
                    className={
                      active
                        ? 'font-semibold text-signal-blue'
                        : 'font-medium text-foreground'
                    }
                  >
                    {ROLE_LABEL[turn.role]}
                  </span>
                  {turn.timestamp ? (
                    <span className="ml-auto truncate text-caption text-muted">
                      {formatDateTime(turn.timestamp)}
                    </span>
                  ) : null}
                </a>
              </li>
            )
          })}
        </ol>
      </nav>

      <p className="text-caption text-muted">
        <Link to="/documents" className="underline underline-offset-4 hover:text-foreground">
          The library
        </Link>{' '}
        holds this document in this browser alone. Editing here changes it only when it is saved.
      </p>
    </div>
  )
}

export { TurnNavigator }
