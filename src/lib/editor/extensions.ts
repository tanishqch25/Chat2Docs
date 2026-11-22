import katex from 'katex'

import { Extension, Node, mergeAttributes } from '@tiptap/core'
import type { NodeViewRendererProps } from '@tiptap/core'
import { ListItem } from '@tiptap/extension-list'
import { TableCell, TableHeader, TableKit } from '@tiptap/extension-table'
import { Plugin } from '@tiptap/pm/state'
import { StarterKit } from '@tiptap/starter-kit'

import { formatBytes } from '@/lib/format'
import type { CardBlock } from '@/lib/editor/blockSerializer'
import { isStoredCard } from '@/lib/editor/blockSerializer'
import { isDisplayableSrc } from '@/lib/links'

/**
 * The document model the editor is allowed to write.
 *
 * TipTap can express more than the store can hold, so this file narrows it
 * to exactly the shapes `blockSerializer` can turn back into a
 * `ContentBlock`: no underline or strike and no horizontal rule (no block
 * kind for any of them), no automatic linking (a link has to be a choice,
 * because it changes which kind the saved block is), a list item and a
 * table cell that hold lines of words rather than whole documents, and no
 * formatting inside a heading, a list item, a quote or a cell — those are
 * stored as plain strings, so a bold word in one of them would be a word
 * the next save throws away.
 *
 * The two node types added here are the ones the model needs and a normal
 * editor does not have. `mathBlock` is LaTeX someone can rewrite, with the
 * typeset form beside it. `protectedBlock` is an import the editor must not
 * touch: it carries the stored block inside itself and hands it back
 * unchanged, which is how an attachment survives a paragraph edit beside it.
 */

/** Nodes whose stored form is a plain string, so formatting cannot be kept. */
const PLAIN_TEXT_NODES = new Set(['heading', 'listItem', 'blockquote', 'tableCell', 'tableHeader'])

const CARD_LABEL: Record<string, string> = {
  image: 'Image',
  file: 'Attachment',
  unsupported: 'Kept unchanged',
  link: 'Link',
}

function element<T extends HTMLElement>(tag: string, className: string): T {
  const node = document.createElement(tag) as T
  node.className = className
  return node
}

function said(tag: string, className: string, value: string): HTMLElement {
  const node = element(tag, className)
  node.textContent = value
  return node
}

function readJson(value: string | null): unknown {
  if (!value) return null
  try {
    return JSON.parse(value)
  } catch {
    return null
  }
}

function cardTitle(block: CardBlock): string {
  switch (block.kind) {
    case 'image':
      return block.alt
    case 'file':
      return block.name
    case 'unsupported':
      return block.reason
    case 'link':
      return block.label
  }
}

/** The second line of a card, in the store's own words. */
function cardDetail(block: CardBlock): string {
  switch (block.kind) {
    case 'image':
      return block.src ? 'Held by this document' : 'Referenced by the export, not held by it'
    case 'file': {
      const detail = [
        block.mimeType,
        block.sizeBytes !== undefined ? formatBytes(block.sizeBytes) : undefined,
      ]
        .filter(Boolean)
        .join(' · ')
      return [detail, block.note].filter(Boolean).join(' — ')
    }
    case 'unsupported':
      return [block.reason, block.elementType ? `named “${block.elementType}”` : undefined]
        .filter(Boolean)
        .join(' · ')
    case 'link':
      return `An address a browser will not follow: ${block.href}`
  }
}

const ProtectedBlock = Node.create({
  name: 'protectedBlock',
  group: 'block',
  atom: true,

  addAttributes() {
    return {
      block: { default: null, rendered: false },
    }
  },

  parseHTML() {
    return [
      {
        tag: 'div[data-protected-block]',
        getAttrs: (htmlNode) => {
          // The payload came from a DOM attribute, so its shape is confirmed
          // here — by the same check the save uses — before it is drawn.
          const block = readJson(htmlNode.getAttribute('data-block'))
          return isStoredCard(block) ? { block } : false
        },
      },
    ]
  },

  // Only a copy and `getHTML()` reach this, and a copy is how a card moves
  // between turns — so the payload rides along rather than being rebuilt.
  renderHTML({ HTMLAttributes, node }) {
    return [
      'div',
      mergeAttributes(HTMLAttributes, {
        'data-protected-block': '',
        'data-block': JSON.stringify(node.attrs.block ?? null),
      }),
    ]
  },

  addNodeView() {
    return ({ node }: NodeViewRendererProps) => {
      const block = node.attrs.block as CardBlock | null
      const wrapper = element<HTMLDivElement>('div', 'pp-editor-card')
      wrapper.contentEditable = 'false'
      wrapper.setAttribute('data-protected-block', '')

      if (block) {
        if (block.kind === 'image' && block.src && isDisplayableSrc(block.src)) {
          const figure = element<HTMLElement>('figure', 'pp-editor-card-figure')
          const image = document.createElement('img')
          image.src = block.src
          image.alt = block.alt
          figure.append(image)
          wrapper.append(figure)
        }
        wrapper.append(
          said('p', 'pp-editor-card-title', `${CARD_LABEL[block.kind]} · ${cardTitle(block)}`),
          said('p', 'pp-editor-card-note', cardDetail(block)),
        )
      } else {
        wrapper.append(said('p', 'pp-editor-card-title', 'Kept unchanged · nothing to show'))
      }

      return { dom: wrapper, ignoreMutation: () => true }
    }
  },
})

const MathBlock = Node.create({
  name: 'mathBlock',
  group: 'block',
  atom: true,

  addAttributes() {
    return {
      expression: {
        default: '',
        parseHTML: (htmlNode) => htmlNode.getAttribute('data-expression') ?? '',
        renderHTML: (attributes: Record<string, unknown>) => ({
          'data-expression': String(attributes.expression ?? ''),
        }),
      },
      display: {
        default: true,
        parseHTML: (htmlNode) => htmlNode.getAttribute('data-display') !== 'false',
        renderHTML: (attributes: Record<string, unknown>) => ({
          'data-display': String(Boolean(attributes.display)),
        }),
      },
    }
  },

  parseHTML() {
    return [{ tag: 'div[data-math-block]' }]
  },

  renderHTML({ HTMLAttributes, node }) {
    return [
      'div',
      mergeAttributes(HTMLAttributes, {
        'data-math-block': '',
        'data-expression': String(node.attrs.expression ?? ''),
        'data-display': String(node.attrs.display ?? true),
      }),
    ]
  },

  addNodeView() {
    return ({ node, view, getPos }: NodeViewRendererProps) => {
      let current = node
      const wrapper = element<HTMLDivElement>('div', 'pp-editor-math')
      wrapper.contentEditable = 'false'
      wrapper.setAttribute('data-math-block', '')
      wrapper.setAttribute('data-display', String(current.attrs.display ?? true))

      const head = element<HTMLDivElement>('div', 'pp-editor-math-head')
      head.append(
        said('span', 'pp-editor-math-label', 'Math'),
        said('span', 'pp-editor-math-hint', 'LaTeX, kept exactly as written'),
      )

      const source = document.createElement('textarea')
      source.className = 'pp-editor-math-source'
      source.spellcheck = false
      source.setAttribute('aria-label', 'LaTeX expression')
      source.value = String(current.attrs.expression ?? '')

      const typeset = element<HTMLDivElement>('div', 'pp-editor-math-render')
      wrapper.append(head, source, typeset)

      const draw = (expression: string) => {
        try {
          typeset.innerHTML = katex.renderToString(expression, {
            displayMode: Boolean(current.attrs.display),
            throwOnError: false,
            output: 'htmlAndMathml',
          })
        } catch {
          // KaTeX refusing an expression is not a licence to hide it.
          typeset.textContent = expression
        }
      }
      draw(source.value)

      source.addEventListener('input', () => {
        const pos = getPos()
        if (typeof pos !== 'number') return
        view.dispatch(
          view.state.tr.setNodeMarkup(pos, undefined, {
            ...current.attrs,
            expression: source.value,
          }),
        )
        draw(source.value)
      })

      return {
        dom: wrapper,
        update: (updated) => {
          if (updated.type.name !== 'mathBlock') return false
          current = updated
          const expression = String(updated.attrs.expression ?? '')
          if (source.value !== expression) source.value = expression
          wrapper.setAttribute('data-display', String(updated.attrs.display ?? true))
          draw(expression)
          return true
        },
        // Keystrokes belong to the text area, not to the editor's keymaps:
        // without this, a space or an Enter inside the LaTeX would split the
        // block holding it.
        stopEvent: (event) => event.target === source,
        ignoreMutation: () => true,
      }
    }
  },
})

/**
 * Marks that cannot survive a save are taken off as they are made.
 *
 * The schema allows marks wherever prose allows them, so a keyboard
 * shortcut or a paste can put a bold word inside a list item. Leaving it
 * there is the worse lie — it looks kept and is not — so it comes off the
 * moment the transaction lands.
 */
const PlainTextContext = Extension.create({
  name: 'plainTextContext',

  addProseMirrorPlugins() {
    return [
      new Plugin({
        appendTransaction: (transactions, _oldState, state) => {
          if (!transactions.some((transaction) => transaction.docChanged)) return null
          const tr = state.tr
          state.doc.descendants((node, position) => {
            if (!PLAIN_TEXT_NODES.has(node.type.name)) return true
            node.descendants((child, offset) => {
              if (!child.isText || child.marks.length === 0) return true
              tr.removeMark(position + 1 + offset, position + 1 + offset + child.nodeSize, null)
              return false
            })
            return false
          })
          return tr.docChanged ? tr : null
        },
      }),
    ]
  },
})

/**
 * The fields the serializer needs and the page does not show.
 *
 * `originKind` is how a paragraph remembers whether it was stored as a
 * `text` block or as Markdown source, which is what lets a paragraph nobody
 * reformatted be written back as the kind it came in as. `filename` and
 * `caption` ride on a code block, and `caption` on a table, because the
 * store keeps them and typing inside the block must not cost someone a
 * filename they never edited.
 */
const CarriedAttributes = Extension.create({
  name: 'carriedAttributes',

  addGlobalAttributes() {
    const kept = (name: string) => ({
      default: null,
      parseHTML: (htmlNode: HTMLElement) => htmlNode.getAttribute(`data-${name}`),
      renderHTML: (attributes: Record<string, unknown>) =>
        attributes[name] ? { [`data-${name}`]: String(attributes[name]) } : null,
    })
    return [
      {
        types: ['paragraph'],
        attributes: { originKind: { default: 'text', rendered: false } },
      },
      {
        types: ['codeBlock'],
        attributes: { filename: kept('filename'), caption: kept('caption') },
      },
      { types: ['table'], attributes: { caption: kept('caption') } },
    ]
  },
})

/** A list item holds lines of words, because the store's `items` are strings. */
const PlainListItem = ListItem.extend({ content: 'paragraph+' })

/** A cell holds one square of words, not a document inside a document. */
const PlainTableCell = TableCell.extend({ content: 'paragraph+' })

const PlainTableHeader = TableHeader.extend({ content: 'paragraph+' })

const editorExtensions = [
  StarterKit.configure({
    underline: false,
    strike: false,
    horizontalRule: false,
    listItem: false,
    link: { openOnClick: false, autolink: false, linkOnPaste: false },
  }),
  PlainListItem,
  TableKit.configure({ tableCell: false, tableHeader: false }),
  PlainTableCell,
  PlainTableHeader,
  ProtectedBlock,
  MathBlock,
  PlainTextContext,
  CarriedAttributes,
]

export { editorExtensions }
