import * as React from 'react'

import { Badge } from '@/components/ui/badge'
import { isFollowableHref } from '@/lib/links'
import { formatBytes } from '@/lib/format'
import { tokenizeInline } from '@/lib/parsers/inlineScanner'
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

/**
 * The KaTeX runtime, fetched once for the whole page.
 *
 * Typesetting is not something this file can do without 260 kB of software,
 * and this component is in the bundle every first visitor downloads. So the
 * import is dynamic — the runtime arrives as its own async chunk, the same
 * one the export studio and the editor already use, and the stored LaTeX is
 * drawn as text until it lands. One promise is shared by every math block,
 * so a page of forty formulas asks for the module once.
 */
type KatexRuntime = typeof import('katex')

let runtime: Promise<KatexRuntime> | null = null

function loadKatex(): Promise<KatexRuntime> {
  runtime ??= import('katex').catch((error: unknown) => {
    // Cleared so a later mount can try again — a blocked chunk on a first
    // load is not a reason to refuse math for the rest of the session.
    runtime = null
    throw error
  })
  return runtime
}

function useKatex(): KatexRuntime | null {
  const [mod, setMod] = React.useState<KatexRuntime | null>(null)

  React.useEffect(() => {
    let alive = true
    loadKatex().then(
      (katex) => {
        if (alive) setMod(katex)
      },
      // The expression the block was stored with is already on the page and
      // stays there, so the reader still has the mathematics — what they lose
      // is the typesetting, which is why this says nothing louder than a
      // warning: it is a developer's note about a module that did not arrive,
      // not a claim about the document.
      (error: unknown) => {
        console.warn('KaTeX could not be loaded; math stays as stored LaTeX.', error)
      },
    )
    return () => {
      alive = false
    }
  }, [])

  return mod
}

const MATH_GROUND = 'rounded-input border border-border bg-pebble px-3 py-2 text-foreground'

/** Typeset the stored LaTeX when the runtime has arrived, and nothing at
 *  all before it has — the caller then shows the source. */
function useTypesetMath(expression: string, display: boolean): string | null {
  const katex = useKatex()

  return React.useMemo(() => {
    if (!katex) return null
    try {
      // `htmlAndMathml` is what the exported file uses too, so the words a
      // screen reader hears are the same in both places.
      return katex.renderToString(expression, {
        displayMode: display,
        throwOnError: false,
        output: 'htmlAndMathml',
      })
    } catch {
      return null
    }
  }, [katex, expression, display])
}

/**
 * Math, typeset where the software allows it and legible where it does not.
 *
 * Until the runtime arrives — and if KaTeX refuses the expression — the
 * block shows the LaTeX it was stored with, in mono, exactly as the library
 * has always drawn it. Nothing is blanked out while the module is fetched.
 * `overflow-x-auto` is the mobile guard: a wide display equation scrolls
 * inside its own box instead of pushing the page sideways at 390px.
 */
function MathView({ expression, display }: { expression: string; display: boolean }) {
  const typeset = useTypesetMath(expression, display)

  if (!typeset) {
    return (
      <p className={`${MATH_GROUND} font-mono text-body-sm whitespace-pre-wrap`}>{expression}</p>
    )
  }

  return (
    <div
      // KaTeX writes its own markup and escapes everything it took from the
      // stored expression; there is no raw author HTML in this string.
      dangerouslySetInnerHTML={{ __html: typeset }}
      className={`${MATH_GROUND} max-w-full overflow-x-auto [&_.katex-display]:my-0`}
    />
  )
}

/** The same equation inside a running sentence: no box, no block, and the
 *  LaTeX itself if KaTeX has not arrived. */
function MathLine({ expression, display }: { expression: string; display: boolean }) {
  const typeset = useTypesetMath(expression, display)

  if (!typeset) {
    return (
      <code className="font-mono text-[0.92em]">
        {display ? `\\[ ${expression} \\]` : `\\(${expression} \\)`}
      </code>
    )
  }

  return (
    <span
      dangerouslySetInnerHTML={{ __html: typeset }}
      className="inline-block max-w-full overflow-x-auto align-middle"
    />
  )
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

const LINK_CLASS = 'text-signal-blue underline underline-offset-4'

/**
 * Prose a provider wrote, read the way it was meant to be read.
 *
 * The importer stores a paragraph as the site sent it, and the sites send
 * their marks: `**bold**`, `` `code` ``, `\(Q_1\)`, `<badge>`. The tokenizer
 * turns those into words plus intent, and this is where the intent becomes
 * markup — so a document shows the emphasis the reader saw on the site, and
 * no literal asterisk or backslash anywhere on the page. A block-level break
 * inside a paragraph is not something a `p` can hold, so the divider token
 * is dropped here; the exported formats, which can open a new element,
 * draw it.
 */
function InlineProse({ source }: { source: string }) {
  return (
    <>
      {tokenizeInline(source).map((token, index) => {
        switch (token.kind) {
          case 'bold':
            return <strong key={index}>{token.text}</strong>
          case 'italic':
            return <em key={index}>{token.text}</em>
          case 'code':
            return (
              <code key={index} className="font-mono text-[0.92em]">
                {token.text}
              </code>
            )
          case 'math':
            return <MathLine key={index} expression={token.expression} display={token.display} />
          case 'badge':
            return (
              <Badge key={index} variant="outline">
                {token.text}
              </Badge>
            )
          case 'cite':
            return token.href && isFollowableHref(token.href) ? (
              <a
                key={index}
                href={token.href}
                target="_blank"
                rel="noopener noreferrer"
                className={LINK_CLASS}
              >
                {token.text}
              </a>
            ) : (
              <Badge key={index} variant="outline">
                Source · {token.text}
              </Badge>
            )
          case 'illustration':
            return (
              <Badge key={index} variant="outline">
                Illustration · {token.text}
              </Badge>
            )
          case 'divider':
            return null
          default:
            return <React.Fragment key={index}>{token.text}</React.Fragment>
        }
      })}
    </>
  )
}

function BlockView({ block }: { block: ContentBlock }) {
  switch (block.kind) {
    case 'text':
      return (
        <p className="text-body whitespace-pre-wrap text-foreground">
          <InlineProse source={block.text} />
        </p>
      )
    case 'markdown':
      return (
        <p className="text-body whitespace-pre-wrap text-foreground">
          <InlineProse source={block.source} />
        </p>
      )
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
          <InlineProse source={block.text} />
        </p>
      )
    case 'list': {
      const items = block.items.map((item, index) => (
        <li key={index} className="whitespace-pre-wrap">
          <InlineProse source={item} />
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
          <InlineProse source={block.text} />
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
                    <InlineProse source={header} />
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
                      <InlineProse source={row[columnIndex] ?? ''} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )
    case 'math':
      return <MathView expression={block.expression} display={block.display} />
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
