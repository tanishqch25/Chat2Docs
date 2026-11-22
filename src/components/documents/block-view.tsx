import { Badge } from '@/components/ui/badge'
import { isFollowableHref } from '@/lib/links'
import { formatBytes } from '@/lib/format'
import type { ContentBlock, InlineRun } from '@/types/conversation'

/**
 * One block, drawn as far as the local viewer can draw it.
 *
 * The rule is the same everywhere a stored block appears — the library's
 * detail view and the import preview both use this file, so a table cannot
 * look like a table in one and a count in the other. A block whose renderer
 * does not exist yet is named rather than hidden: an attachment or a canvas
 * marker has to be visibly present, or "nothing was dropped" is a claim
 * nobody can check.
 */

const HEADING_CLASS: Record<number, string> = {
  1: 'text-subheading font-bold',
  2: 'text-body-lg font-semibold',
  3: 'text-body-lg font-semibold',
  4: 'text-body font-semibold',
  5: 'text-body font-semibold',
  6: 'text-body-sm font-semibold',
}

/** A link a file wrote can be anything. Only an address a browser can
 *  safely follow is drawn as one; the rest is shown as what it says. */
function InlineText({ run }: { run: InlineRun }) {
  let content: React.ReactNode = run.text
  if (run.code) content = <code className="font-mono text-[0.92em]">{content}</code>
  if (run.italic) content = <em>{content}</em>
  if (run.bold) content = <strong>{content}</strong>
  if (run.href && isFollowableHref(run.href))
    content = (
      <a
        href={run.href}
        target="_blank"
        rel="noopener noreferrer"
        className="text-signal-blue underline underline-offset-4"
      >
        {content}
      </a>
    )
  return <>{content}</>
}

function BlockView({ block }: { block: ContentBlock }) {
  switch (block.kind) {
    case 'text':
      return <p className="text-body whitespace-pre-wrap text-foreground">{block.text}</p>
    case 'markdown':
      return <p className="text-body whitespace-pre-wrap text-foreground">{block.source}</p>
    case 'rich':
      return (
        <p className="text-body whitespace-pre-wrap text-foreground">
          {block.runs.map((run, index) => (
            <InlineText key={index} run={run} />
          ))}
        </p>
      )
    case 'heading':
      return (
        <p className={`${HEADING_CLASS[block.level] ?? 'text-body font-semibold'} text-foreground`}>
          {block.text}
        </p>
      )
    case 'list': {
      const items = block.items.map((item, index) => (
        <li key={index} className="whitespace-pre-wrap">
          {item}
        </li>
      ))
      return block.ordered ? (
        <ol className="list-decimal flex flex-col gap-1 pl-6 text-body text-foreground">
          {items}
        </ol>
      ) : (
        <ul className="list-disc flex flex-col gap-1 pl-6 text-body text-foreground">{items}</ul>
      )
    }
    case 'blockquote':
      return (
        <blockquote className="border-l-2 border-border pl-4 text-body whitespace-pre-wrap text-muted">
          {block.text}
        </blockquote>
      )
    case 'code':
      return (
        <pre className="overflow-x-auto rounded-input border border-border bg-pebble p-4 font-mono text-body-sm whitespace-pre text-foreground">
          {block.code}
        </pre>
      )
    case 'table':
      return (
        <div className="overflow-x-auto rounded-input border border-border bg-card">
          <table className="w-full border-collapse text-body-sm">
            <thead>
              <tr>
                {block.headers.map((header, index) => (
                  <th
                    key={index}
                    className="border-b border-border bg-pebble px-3 py-2 text-left font-semibold whitespace-nowrap text-foreground"
                  >
                    {header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {block.rows.map((row, rowIndex) => (
                <tr key={rowIndex}>
                  {block.headers.map((_, columnIndex) => (
                    <td
                      key={columnIndex}
                      className="border-b border-border px-3 py-2 align-top text-foreground last:border-b-0"
                    >
                      {row[columnIndex] ?? ''}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )
    case 'math':
      return (
        <p className="rounded-input border border-border bg-pebble px-3 py-2 font-mono text-body-sm whitespace-pre-wrap text-foreground">
          {block.expression}
        </p>
      )
    case 'link':
      return isFollowableHref(block.href) ? (
        <a
          href={block.href}
          target="_blank"
          rel="noopener noreferrer"
          className="text-body font-medium text-signal-blue underline underline-offset-4"
        >
          {block.label}
        </a>
      ) : (
        <Badge variant="outline">Link · {block.label}</Badge>
      )
    case 'image':
      return block.src ? (
        <img
          src={block.src}
          alt={block.alt}
          className="max-h-64 w-auto rounded-input border border-border object-contain"
        />
      ) : (
        <Badge variant="outline">Image · {block.alt}</Badge>
      )
    case 'file':
      return (
        <div className="flex flex-col gap-1 rounded-input border border-border bg-pebble px-3 py-2">
          <p className="text-body-sm font-medium text-foreground">
            {block.name}
            {block.mimeType ? ` · ${block.mimeType}` : ''}
            {block.sizeBytes !== undefined ? ` · ${formatBytes(block.sizeBytes)}` : ''}
          </p>
          {block.note ? <p className="text-caption text-muted">{block.note}</p> : null}
        </div>
      )
    case 'unsupported':
      return (
        <div className="flex flex-col gap-1 rounded-input border border-dashed border-border bg-pebble px-3 py-2">
          <p className="text-body-sm font-medium text-foreground">Kept unchanged · {block.reason}</p>
          {block.elementType ? (
            <p className="text-caption text-muted">Named by the export as “{block.elementType}”.</p>
          ) : null}
        </div>
      )
  }
}

export { BlockView }
