import * as React from 'react'
import type { Editor } from '@tiptap/react'
import { useEditorState } from '@tiptap/react'
import {
  Bold,
  ChevronDown,
  Code,
  Italic,
  Link2,
  List,
  ListOrdered,
  Quote,
  Redo2,
  Undo2,
} from 'lucide-react'

import { isFollowableHref } from '@/lib/links'
import { cn } from '@/lib/utils'

/**
 * The formatting controls, acting on whichever section has the caret.
 *
 * Two rules shape this bar. It offers only what a save can keep: the schema
 * in `extensions.ts` has no underline, no rule and no nested list precisely
 * so that a button here never paints something the store throws away. And
 * every control keeps the editor's selection — a toolbar that ate the
 * selection would format wherever the caret last was, not where the reader
 * meant.
 */

/** The languages the exporters recognise, plus the plain fallback. */
const CODE_LANGUAGES = [
  { value: '', label: 'No language' },
  { value: 'typescript', label: 'TypeScript' },
  { value: 'python', label: 'Python' },
  { value: 'json', label: 'JSON' },
  { value: 'bash', label: 'Bash' },
  { value: 'sql', label: 'SQL' },
  { value: 'text', label: 'Plain text' },
]

const BLOCK_TYPES = [
  { value: 'paragraph', label: 'Paragraph' },
  { value: '1', label: 'Heading 1' },
  { value: '2', label: 'Heading 2' },
  { value: '3', label: 'Heading 3' },
]

const TOOL =
  'inline-flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-button px-2.5 text-caption font-medium text-foreground transition-colors hover:bg-pebble disabled:pointer-events-none disabled:opacity-40'

const ACTIVE = 'bg-badge-bg text-deep-cobalt hover:bg-badge-bg'

/** A mousedown that is not allowed to land: the caret stays where it was. */
const keepSelection = (event: React.MouseEvent) => event.preventDefault()

interface ToolButtonProps {
  label: string
  /** Omitted when the label is already the text on the button. */
  icon?: React.ElementType
  pressed?: boolean
  disabled?: boolean
  onPress: () => void
}

function ToolButton({ label, icon: Icon, pressed, disabled, onPress }: ToolButtonProps) {
  return (
    <button
      type="button"
      onMouseDown={keepSelection}
      onClick={onPress}
      disabled={disabled}
      aria-label={Icon ? label : undefined}
      aria-pressed={pressed === undefined ? undefined : pressed}
      className={cn(TOOL, pressed && ACTIVE)}
    >
      {Icon ? <Icon aria-hidden className="size-4" /> : label}
    </button>
  )
}

/** One set of related controls, with a hairline between sets. */
function Group({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-1 after:ml-2 after:h-5 after:w-px after:bg-border last:after:hidden">
      {children}
    </div>
  )
}

function LinkControl({ editor, href, active }: { editor: Editor; href: string; active: boolean }) {
  const [open, setOpen] = React.useState(false)
  const [draft, setDraft] = React.useState('')
  const [refused, setRefused] = React.useState(false)
  const field = React.useRef<HTMLInputElement>(null)

  React.useEffect(() => {
    if (open) field.current?.focus()
  }, [open])

  const start = () => {
    setDraft(href)
    setRefused(false)
    setOpen(true)
  }

  const apply = () => {
    const value = draft.trim()
    // An address the editor cannot promise to keep is refused here rather
    // than quietly dropped when the document is written.
    if (!isFollowableHref(value)) {
      setRefused(true)
      return
    }
    editor.chain().focus().extendMarkRange('link').setLink({ href: value }).run()
    setOpen(false)
  }

  const clear = () => {
    editor.chain().focus().extendMarkRange('link').unsetLink().run()
    setOpen(false)
  }

  if (!open) {
    return (
      <ToolButton
        label={active ? 'Edit link' : 'Add link'}
        icon={Link2}
        pressed={active}
        onPress={start}
      />
    )
  }

  return (
    <form
      className="flex items-center gap-1"
      onSubmit={(event) => {
        event.preventDefault()
        apply()
      }}
    >
      <input
        ref={field}
        value={draft}
        onChange={(event) => {
          setDraft(event.target.value)
          setRefused(false)
        }}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            event.stopPropagation()
            setOpen(false)
          }
        }}
        aria-label="Link address"
        aria-invalid={refused}
        placeholder="https://example.com"
        className={cn(
          'h-9 w-52 max-w-full rounded-button border bg-input px-2.5 text-caption text-foreground placeholder:text-slate-gray focus-visible:border-signal-blue',
          refused ? 'border-coral-magenta' : 'border-border',
        )}
      />
      <button type="submit" className={cn(TOOL, 'bg-primary text-primary-foreground hover:bg-deep-cobalt')}>
        Apply
      </button>
      {active ? (
        <button type="button" onMouseDown={keepSelection} onClick={clear} className={TOOL}>
          Remove
        </button>
      ) : null}
      <button type="button" onMouseDown={keepSelection} onClick={() => setOpen(false)} className={TOOL}>
        Cancel
      </button>
      {refused ? (
        <p role="alert" className="text-caption text-coral-magenta">
          Only an http(s) or mailto address survives a save.
        </p>
      ) : null}
    </form>
  )
}

/**
 * A snapshot of the caret, so the bar says what the selection is.
 *
 * `useEditorState` compares the result deeply and re-renders only when
 * something the bar actually shows changes — typing a word that leaves the
 * formatting alone does not redraw a single button.
 */
function useToolbarState(editor: Editor | null) {
  return useEditorState({
    editor,
    selector: ({ editor: instance }) => {
      if (!instance) return null
      const heading = instance.isActive('heading')
      return {
        canUndo: instance.can().undo(),
        canRedo: instance.can().redo(),
        blockType: heading ? String(instance.getAttributes('heading').level ?? 1) : 'paragraph',
        bold: instance.isActive('bold'),
        italic: instance.isActive('italic'),
        inlineCode: instance.isActive('code'),
        link: instance.isActive('link'),
        href: String(instance.getAttributes('link').href ?? ''),
        bulletList: instance.isActive('bulletList'),
        orderedList: instance.isActive('orderedList'),
        quote: instance.isActive('blockquote'),
        codeBlock: instance.isActive('codeBlock'),
        language: String(instance.getAttributes('codeBlock').language ?? ''),
        table: instance.isActive('table'),
      }
    },
  })
}

/** A TipTap command chain, still open — `run` closes it. */
type Chain = ReturnType<Editor['chain']>

function EditorToolbar({ editor }: { editor: Editor | null }) {
  const state = useToolbarState(editor)
  const usable = Boolean(editor && state)

  const run = (command: (chain: Chain) => Chain) => {
    if (!editor) return
    command(editor.chain().focus()).run()
  }

  return (
    <div
      role="group"
      aria-label="Formatting"
      // Below the tablet band the bar becomes one row that scrolls: a wrapped
      // bar is several lines tall under the sticky offset, and the table
      // group alone is wider than a phone.
      className="flex flex-wrap items-center gap-2 border-y border-border bg-cloud/85 px-2 py-2 backdrop-blur-sm max-md:flex-nowrap max-md:overflow-x-auto"
    >
      <Group>
        <ToolButton
          label="Undo"
          icon={Undo2}
          disabled={!state?.canUndo}
          onPress={() => run((chain) => chain.undo())}
        />
        <ToolButton
          label="Redo"
          icon={Redo2}
          disabled={!state?.canRedo}
          onPress={() => run((chain) => chain.redo())}
        />
      </Group>

      <Group>
        <label className="relative inline-flex items-center">
          <span className="sr-only">Text style</span>
          <select
            value={state?.blockType ?? 'paragraph'}
            disabled={!usable}
            onChange={(event) => {
              const value = event.target.value
              if (!editor) return
              const chain = editor.chain().focus()
              if (value === 'paragraph') chain.setParagraph().run()
              else chain.toggleHeading({ level: Number(value) as 1 | 2 | 3 }).run()
            }}
            className={cn(TOOL, 'appearance-none bg-transparent pr-7')}
          >
            {BLOCK_TYPES.map((type) => (
              <option key={type.value} value={type.value}>
                {type.label}
              </option>
            ))}
          </select>
          <ChevronDown aria-hidden className="pointer-events-none absolute right-2 size-3.5" />
        </label>
        <ToolButton
          label="Bold"
          icon={Bold}
          pressed={state?.bold}
          disabled={!usable}
          onPress={() => run((chain) => chain.toggleBold())}
        />
        <ToolButton
          label="Italic"
          icon={Italic}
          pressed={state?.italic}
          disabled={!usable}
          onPress={() => run((chain) => chain.toggleItalic())}
        />
        <ToolButton
          label="Inline code"
          icon={Code}
          pressed={state?.inlineCode}
          disabled={!usable}
          onPress={() => run((chain) => chain.toggleCode())}
        />
        {editor && state ? (
          <LinkControl editor={editor} href={state.href} active={state.link} />
        ) : (
          <ToolButton label="Add link" icon={Link2} disabled onPress={() => undefined} />
        )}
      </Group>

      <Group>
        <ToolButton
          label="Bullet list"
          icon={List}
          pressed={state?.bulletList}
          disabled={!usable}
          onPress={() => run((chain) => chain.toggleBulletList())}
        />
        <ToolButton
          label="Ordered list"
          icon={ListOrdered}
          pressed={state?.orderedList}
          disabled={!usable}
          onPress={() => run((chain) => chain.toggleOrderedList())}
        />
        <ToolButton
          label="Blockquote"
          icon={Quote}
          pressed={state?.quote}
          disabled={!usable}
          onPress={() => run((chain) => chain.toggleBlockquote())}
        />
        <ToolButton
          label="Code block"
          pressed={state?.codeBlock}
          disabled={!usable}
          onPress={() => run((chain) => chain.toggleCodeBlock())}
        />
        <label className="relative inline-flex items-center">
          <span className="sr-only">Code language</span>
          <select
            value={state?.language ?? ''}
            disabled={!state?.codeBlock}
            onChange={(event) => {
              if (!editor) return
              editor
                .chain()
                .focus()
                .updateAttributes('codeBlock', { language: event.target.value || null })
                .run()
            }}
            className={cn(TOOL, 'appearance-none bg-transparent pr-7')}
          >
            {CODE_LANGUAGES.map((language) => (
              <option key={language.value} value={language.value}>
                {language.label}
              </option>
            ))}
          </select>
          <ChevronDown aria-hidden className="pointer-events-none absolute right-2 size-3.5" />
        </label>
      </Group>

      <Group>
        <ToolButton
          label="Insert table"
          disabled={!usable}
          onPress={() =>
            run((chain) => chain.insertTable({ rows: 3, cols: 3, withHeaderRow: true }))
          }
        />
        <ToolButton
          label="Add row"
          disabled={!state?.table}
          onPress={() => run((chain) => chain.addRowAfter())}
        />
        <ToolButton
          label="Delete row"
          disabled={!state?.table}
          onPress={() => run((chain) => chain.deleteRow())}
        />
        <ToolButton
          label="Add column"
          disabled={!state?.table}
          onPress={() => run((chain) => chain.addColumnAfter())}
        />
        <ToolButton
          label="Delete column"
          disabled={!state?.table}
          onPress={() => run((chain) => chain.deleteColumn())}
        />
        <ToolButton
          label="Delete table"
          disabled={!state?.table}
          onPress={() => run((chain) => chain.deleteTable())}
        />
      </Group>

      <Group>
        <ToolButton
          label="Insert math block"
          disabled={!usable}
          onPress={() =>
            run((chain) =>
              chain.insertContent({ type: 'mathBlock', attrs: { expression: '', display: true } }),
            )
          }
        />
      </Group>
    </div>
  )
}

export { EditorToolbar }
