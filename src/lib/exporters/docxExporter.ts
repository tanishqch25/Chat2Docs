import { formatDateTime } from '@/lib/format'
import { isFollowableHref } from '@/lib/links'
import { LINE_BREAK } from '@/lib/editor/inline'
import {
  SPEAKER_LABEL,
  headingAnchor,
  metadataRows,
  orderedMessages,
  preservationStatement,
  tocFor,
  turnAnchor,
} from '@/lib/exporters/shared'
import { PAGE_DXA, type BlobExporter, type DocumentExportOptions } from '@/types/export'
import type { FileChild, ParagraphChild } from 'docx'
import type { ContentBlock, InlineRun } from '@/types/conversation'
import type { LocalDocument, MessageRole } from '@/types/document'

/**
 * A real Word file, written by Word's own vocabulary.
 *
 * `docx` is loaded when this export is asked for and nowhere else, so the
 * library that builds the .docx is not in the bundle every visitor
 * downloads. Everything below is a Word construct rather than HTML pasted
 * into a document: numbered headings from Word's own styles, a table with
 * borders and shaded header cells, lists that Word can restyle, code held
 * in its own shaded paragraph per line so it never re-flows, and page
 * numbers Word recalculates itself.
 *
 * Maths is the one thing Word will not accept as text. The LaTeX that was
 * stored is written in a labelled shaded block — the expression exactly as
 * it came in, which is what a document has to do rather than guess at a
 * rendering.
 */

/** `typeof import(...)` is a type: it does not put the library in the
 *  bundle the way a static import would. */
type Docx = typeof import('docx')

const INK = '0B3558'
const ACCENT = '006BFF'
const MUTED = '476788'
const RULE = 'D4E0ED'
const CODE_FILL = 'F0F3F8'
const HEADER_FILL = 'E8EFF7'

/** Word sizes are half-points. */
const BODY_HALF_POINTS: Record<DocumentExportOptions['fontScale'], number> = {
  compact: 20,
  standard: 22,
  comfortable: 26,
}

const FAMILY: Record<DocumentExportOptions['fontFamily'], string> = {
  sans: 'Calibri',
  serif: 'Georgia',
  mono: 'Consolas',
}

/** A heading's own level, as Word names it. Indexed into the library's
 *  enumeration rather than guessed at, because the style a document
 *  actually gets is the value, not the name. */
function headingOf(docx: Docx, level: 1 | 2 | 3 | 4 | 5 | 6) {
  return docx.HeadingLevel[`HEADING_${level}` as keyof Docx['HeadingLevel']]
}

/** At most one run per line, with the stored break kept as a break. */
function lineRuns(docx: Docx, text: string, run: Record<string, unknown>) {
  const lines = text.split('\n')
  return lines.map((line, index) =>
    index === 0
      ? new docx.TextRun({ text: line, ...run })
      : new docx.TextRun({ text: line, break: 1, ...run }),
  )
}

const bodyRun = (options: DocumentExportOptions) => ({
  font: FAMILY[options.fontFamily],
  size: BODY_HALF_POINTS[options.fontScale],
  color: INK,
})

const monoRun = (options: DocumentExportOptions) => ({
  font: 'Consolas',
  size: Math.round(BODY_HALF_POINTS[options.fontScale] * 0.9),
  color: INK,
})

function speakerParagraph(
  docx: Docx,
  role: MessageRole,
  turn: number,
  timestamp: string | undefined,
  options: DocumentExportOptions,
  anchor: string,
) {
  const who = options.includeRoleBadges ? SPEAKER_LABEL[role].toUpperCase() : `TURN ${turn}`
  const runs = [
    new docx.TextRun({
      text: who,
      bold: true,
      allCaps: true,
      font: FAMILY[options.fontFamily],
      size: BODY_HALF_POINTS[options.fontScale] + 2,
      color: role === 'user' ? ACCENT : INK,
    }),
  ]
  if (timestamp) {
    runs.push(
      new docx.TextRun({
        text: `  ·  ${formatDateTime(timestamp)}`,
        font: FAMILY[options.fontFamily],
        size: BODY_HALF_POINTS[options.fontScale] - 2,
        color: MUTED,
      }),
    )
  }
  return new docx.Paragraph({
    // Held inside a bookmark, which is what a contents line links to.
    children: [new docx.Bookmark({ id: anchor, children: runs })],
    spacing: { before: 360, after: 120 },
    border: { bottom: { style: docx.BorderStyle.SINGLE, size: 4, color: RULE, space: 4 } },
  })
}

/** One shaded paragraph per line, so a code block keeps its own breaks and
 *  never gets re-flowed by Word's margins. */
function codeParagraphs(docx: Docx, block: Extract<ContentBlock, { kind: 'code' }>, options: DocumentExportOptions) {
  const label = [block.language, block.filename, block.caption].filter(Boolean).join(' · ')
  const lines = block.code.length > 0 ? block.code.split('\n') : ['']
  const out = lines.map(
    (line) =>
      new docx.Paragraph({
        children: [new docx.TextRun({ text: line.length > 0 ? line : ' ', ...monoRun(options) })],
        shading: { fill: CODE_FILL, type: docx.ShadingType.CLEAR, color: 'auto' },
        spacing: { before: 0, after: 0, line: 240, lineRule: 'auto' },
        indent: { left: 120, right: 120 },
      }),
  )
  if (label) {
    out.unshift(
      new docx.Paragraph({
        children: [
          new docx.TextRun({
            text: `Code${block.language ? ` · ${block.language}` : ''}${label ? ` — ${label}` : ''}`,
            italics: true,
            font: FAMILY[options.fontFamily],
            size: BODY_HALF_POINTS[options.fontScale] - 4,
            color: MUTED,
          }),
        ],
        spacing: { before: 120, after: 40 },
      }),
    )
  }
  return out
}

/** A paragraph with a rule above and below and a fill, used for the
 *  callouts that hold an attachment or an element nothing renders. */
function callout(
  docx: Docx,
  options: DocumentExportOptions,
  label: string,
  body: string,
  note?: string,
) {
  const children = [
    new docx.TextRun({
      text: label.toUpperCase(),
      bold: true,
      font: FAMILY[options.fontFamily],
      size: BODY_HALF_POINTS[options.fontScale] - 4,
      color: MUTED,
    }),
    new docx.TextRun({ text: `  ${body}`, ...bodyRun(options) }),
  ]
  if (note) {
    children.push(
      new docx.TextRun({ text: `\n${note}`, italics: true, ...bodyRun(options), color: MUTED }),
    )
  }
  return new docx.Paragraph({
    children,
    shading: { fill: CODE_FILL, type: docx.ShadingType.CLEAR, color: 'auto' },
    border: { left: { style: docx.BorderStyle.SINGLE, size: 12, color: RULE, space: 6 } },
    spacing: { before: 120, after: 120 },
    indent: { left: 120, right: 120 },
  })
}

/** The widest a picture may be, in the pixels Word assumes at 96 to the
 *  inch — the text column of an A4 page with room to spare. */
const MAX_IMAGE_PX = 620

/** The picture's own pixels, read by the decoder a page uses. Measuring here
 *  rather than trusting a header is what keeps the file and the preview
 *  showing the same picture at the same shape. */
async function imageSize(bytes: Uint8Array<ArrayBuffer>, mimeType: string) {
  const url = URL.createObjectURL(new Blob([bytes], { type: mimeType }))
  try {
    const image = new Image()
    image.src = url
    await image.decode()
    return { width: image.naturalWidth, height: image.naturalHeight }
  } catch {
    return null
  } finally {
    URL.revokeObjectURL(url)
  }
}

/** An embedded picture, sized from its own pixels. Null when the export
 *  only referenced one, holds a format Word cannot take, or carries bytes
 *  that are not a picture at all. */
async function imageParagraph(
  docx: Docx,
  block: Extract<ContentBlock, { kind: 'image' }>,
) {
  const format = block.src
    ? /^data:image\/(png|jpe?g|gif|bmp)[^,]*,/i.exec(block.src)?.[1]?.toLowerCase().replace('jpeg', 'jpg')
    : undefined
  if (!block.src || !format) return null

  let bytes: Uint8Array<ArrayBuffer>
  try {
    bytes = new Uint8Array(await (await fetch(block.src)).arrayBuffer())
  } catch {
    /* An imported address is words, not bytes this app produced: base64
       that will not load becomes a marker, not a failed download. */
    return null
  }
  const measured = await imageSize(bytes, `image/${format}`)
  if (!measured) return null

  const width = Math.min(MAX_IMAGE_PX, measured.width)
  return new docx.Paragraph({
    children: [
      new docx.ImageRun({
        type: format as 'png' | 'jpg' | 'gif' | 'bmp',
        data: bytes,
        transformation: {
          width,
          height: Math.round((measured.height * width) / measured.width),
        },
        altText: { title: block.alt, description: block.alt, name: block.alt || 'image' },
      }),
    ],
    spacing: { before: 120, after: 120 },
  })
}

/** A real Word table: borders on every cell, the header row shaded. */
function tableElement(
  docx: Docx,
  block: Extract<ContentBlock, { kind: 'table' }>,
  options: DocumentExportOptions,
) {
  const border = { style: docx.BorderStyle.SINGLE, size: 4, color: RULE }
  const run = bodyRun(options)
  const cell = (value: string, header: boolean) =>
    new docx.TableCell({
      children: [
        new docx.Paragraph({
          children: [new docx.TextRun({ text: value, bold: header || undefined, ...run })],
          spacing: { before: 40, after: 40 },
        }),
      ],
      shading: header
        ? { fill: HEADER_FILL, type: docx.ShadingType.CLEAR, color: 'auto' }
        : undefined,
      margins: { left: 120, right: 120 },
    })

  const rows = [
    new docx.TableRow({
      children: block.headers.map((header) => cell(header, true)),
      tableHeader: true,
    }),
    ...block.rows.map(
      (row) =>
        new docx.TableRow({
          children: block.headers.map((_, index) => cell(row[index] ?? '', false)),
        }),
    ),
  ]

  const out: FileChild[] = [
    new docx.Table({
      rows,
      width: { size: 100, type: docx.WidthType.PERCENTAGE },
      borders: {
        top: border,
        bottom: border,
        left: border,
        right: border,
        insideHorizontal: border,
        insideVertical: border,
      },
    }),
  ]
  if (block.caption) {
    out.push(
      new docx.Paragraph({
        children: [
          new docx.TextRun({ text: block.caption, italics: true, ...run, color: MUTED }),
        ],
        spacing: { before: 60, after: 160 },
      }),
    )
  }
  return out
}

/**
 * A formatted paragraph, in Word's own runs.
 *
 * Bold, italic and monospace are Word character formats rather than shaded
 * text, and a link becomes a real external hyperlink with the relationship
 * Word needs to make it clickable.
 */
function richChildren(
  docx: Docx,
  runs: InlineRun[],
  options: DocumentExportOptions,
): ParagraphChild[] {
  const out: ParagraphChild[] = []
  let breaks = 0
  for (const run of runs) {
    const plain = !run.bold && !run.italic && !run.code && !run.href
    if (run.text === LINE_BREAK && plain) {
      breaks += 1
      continue
    }
    const base = run.code ? monoRun(options) : bodyRun(options)
    const shape = {
      ...base,
      ...(breaks > 0 ? { break: breaks } : {}),
      ...(run.bold ? { bold: true } : {}),
      ...(run.italic ? { italics: true } : {}),
    }
    breaks = 0
    if (!run.href) {
      out.push(new docx.TextRun({ text: run.text, ...shape }))
      continue
    }
    if (!isFollowableHref(run.href)) {
      out.push(
        new docx.TextRun({
          text: `${run.text} (address a browser will not follow: ${run.href})`,
          ...shape,
        }),
      )
      continue
    }
    out.push(
      new docx.ExternalHyperlink({
        link: run.href.trim(),
        children: [
          new docx.TextRun({
            text: run.text,
            ...shape,
            style: 'Hyperlink',
            color: ACCENT,
            underline: {},
          }),
        ],
      }),
    )
  }
  return out
}

/** Everything a block becomes, in the order it is written. */
async function blockChildren(
  docx: Docx,
  block: ContentBlock,
  options: DocumentExportOptions,
  anchorId?: string,
): Promise<FileChild[]> {
  const run = bodyRun(options)

  switch (block.kind) {
    case 'text':
      return [new docx.Paragraph({ children: lineRuns(docx, block.text, run), spacing: { after: 120 } })]
    case 'rich':
      return [
        new docx.Paragraph({
          children: richChildren(docx, block.runs, options),
          spacing: { after: 120 },
        }),
      ]
    case 'markdown':
      return [new docx.Paragraph({ children: lineRuns(docx, block.source, run), spacing: { after: 120 } })]
    case 'heading': {
      const title = new docx.TextRun({ text: block.text })
      return [
        new docx.Paragraph({
          children: anchorId ? [new docx.Bookmark({ id: anchorId, children: [title] })] : [title],
          heading: headingOf(docx, block.level),
        }),
      ]
    }
    case 'list':
      return block.items.map(
        (item, index) =>
          new docx.Paragraph({
            children: lineRuns(docx, item, run),
            ...(block.ordered
              ? { numbering: { reference: 'pp-ordered', level: 0 } }
              : { bullet: { level: 0 } }),
            // Only the first item of an ordered list restarts, so a list
            // split across blocks still counts the way it read.
            spacing: { after: index === block.items.length - 1 ? 120 : 40 },
          }),
      )
    case 'blockquote':
      return [
        new docx.Paragraph({
          children: lineRuns(docx, block.text, { ...run, italics: true }),
          indent: { left: 240 },
          border: { left: { style: docx.BorderStyle.SINGLE, size: 12, color: ACCENT, space: 8 } },
          spacing: { before: 120, after: 120 },
        }),
      ]
    case 'code':
      return codeParagraphs(docx, block, options)
    case 'table':
      return tableElement(docx, block, options)
    case 'math':
      return [
        new docx.Paragraph({
          children: [
            new docx.TextRun({
              text: `Mathematics (${block.display ? 'display' : 'inline'})`,
              bold: true,
              font: FAMILY[options.fontFamily],
              size: BODY_HALF_POINTS[options.fontScale] - 4,
              color: MUTED,
            }),
          ],
          spacing: { before: 120, after: 20 },
        }),
        new docx.Paragraph({
          children: lineRuns(docx, block.expression, monoRun(options)),
          shading: { fill: CODE_FILL, type: docx.ShadingType.CLEAR, color: 'auto' },
          spacing: { before: 0, after: 120 },
          indent: { left: 120, right: 120 },
        }),
      ]
    case 'link':
      return [
        isFollowableHref(block.href)
          ? new docx.Paragraph({
              children: [
                new docx.ExternalHyperlink({
                  link: block.href.trim(),
                  children: [
                    new docx.TextRun({
                      text: block.label,
                      style: 'Hyperlink',
                      ...run,
                      color: ACCENT,
                      underline: {},
                    }),
                  ],
                }),
              ],
              spacing: { after: 120 },
            })
          : callout(docx, options, 'Link', `${block.label} — ${block.href}`, 'an address a browser will not follow'),
      ]
    case 'image': {
      const drawn = await imageParagraph(docx, block)
      return [
        drawn ??
          callout(
            docx,
            options,
            'Image',
            block.alt,
            block.src
              ? 'the export gave an address this file does not carry as a picture'
              : 'referenced by the export, not held by it',
          ),
      ]
    }
    case 'file': {
      const detail = [
        block.mimeType,
        block.sizeBytes !== undefined ? `${block.sizeBytes} bytes` : undefined,
      ]
        .filter(Boolean)
        .join(' · ')
      return [
        callout(
          docx,
          options,
          options.includePreservationNotes ? 'Attachment' : 'File',
          `${block.name}${detail ? ` · ${detail}` : ''}`,
          block.note,
        ),
      ]
    }
    case 'unsupported':
      return [
        callout(
          docx,
          options,
          options.includePreservationNotes ? 'Preserved unchanged' : 'Kept',
          block.reason,
          block.elementType ? `named “${block.elementType}” by the export` : undefined,
        ),
      ]
  }
}

/** Word's own heading styles, re-cast in PromptPaper's palette so a
 *  heading in the .docx is the same weight of heading as on screen. */
function headingStyles(options: DocumentExportOptions) {
  const base = BODY_HALF_POINTS[options.fontScale]
  const levels: [keyof Docx['HeadingLevel'], number][] = [
    ['HEADING_1', base + 12],
    ['HEADING_2', base + 8],
    ['HEADING_3', base + 4],
    ['HEADING_4', base + 2],
    ['HEADING_5', base],
    ['HEADING_6', base - 2],
  ]
  const run = (size: number) => ({
    id: size,
    font: FAMILY[options.fontFamily],
    color: INK,
    size,
  })
  return {
    default: {
      document: { run: bodyRun(options) },
      ...Object.fromEntries(
        levels.map(([key, size]) => [
          key.replace('HEADING_', 'heading').toLowerCase(),
          { run: run(size), paragraph: { spacing: { before: 240, after: 120 } } },
        ]),
      ),
      title: { run: { ...run(base + 18), bold: true }, paragraph: { spacing: { after: 240 } } },
    },
    paragraphStyles: levels.map(([key, size]) => ({
      id: key,
      name: key.replace('_', ' '),
      basedOn: 'Normal',
      next: 'Normal',
      run: run(size),
      paragraph: { spacing: { before: 240, after: 120 } },
    })),
  }
}

/** The outline, with Word's own internal links, so a contents line jumps
 *  to the turn it names rather than only describing it. */
function tocParagraphs(docx: Docx, options: DocumentExportOptions, document: LocalDocument) {
  const out: FileChild[] = [
    new docx.Paragraph({
      children: [
        new docx.TextRun({
          text: 'Contents',
          bold: true,
          font: FAMILY[options.fontFamily],
          size: BODY_HALF_POINTS[options.fontScale] + 4,
          color: INK,
        }),
      ],
      spacing: { before: 240, after: 120 },
    }),
  ]
  for (const entry of tocFor(document)) {
    out.push(
      new docx.Paragraph({
        children: [
          new docx.InternalHyperlink({
            anchor: entry.id,
            children: [
              new docx.TextRun({
                text: `${entry.level === 1 ? '' : '· '}${entry.label}`,
                font: FAMILY[options.fontFamily],
                size: BODY_HALF_POINTS[options.fontScale] - 2,
                color: ACCENT,
                underline: {},
              }),
            ],
          }),
        ],
        indent: entry.level === 1 ? undefined : { left: 360 },
        spacing: { before: 0, after: 40 },
      }),
    )
  }
  return out
}

function metadataTable(docx: Docx, options: DocumentExportOptions, document: LocalDocument, exportedAt: Date) {
  const run = bodyRun(options)
  const border = { style: docx.BorderStyle.SINGLE, size: 2, color: RULE }
  return new docx.Table({
    rows: metadataRows(document, exportedAt).map(
      (row) =>
        new docx.TableRow({
          children: [
            new docx.TableCell({
              children: [
                new docx.Paragraph({
                  children: [new docx.TextRun({ text: row.label, bold: true, ...run, color: MUTED })],
                  spacing: { before: 40, after: 40 },
                }),
              ],
              width: { size: 34, type: docx.WidthType.PERCENTAGE },
              shading: { fill: HEADER_FILL, type: docx.ShadingType.CLEAR, color: 'auto' },
            }),
            new docx.TableCell({
              children: [
                new docx.Paragraph({
                  children: [new docx.TextRun({ text: row.value, ...run })],
                  spacing: { before: 40, after: 40 },
                }),
              ],
              width: { size: 66, type: docx.WidthType.PERCENTAGE },
            }),
          ],
        }),
    ),
    width: { size: 100, type: docx.WidthType.PERCENTAGE },
    borders: {
      top: border,
      bottom: border,
      left: border,
      right: border,
      insideHorizontal: border,
      insideVertical: border,
    },
  })
}

const docxExporter: BlobExporter = async (document, options) => {
  // The library that writes the file is fetched only for this format.
  const docx = await import('docx')
  const exportedAt = new Date()
  const children: FileChild[] = []

  children.push(
    new docx.Paragraph({
      children: [new docx.TextRun({ text: document.title, bold: true })],
      heading: docx.HeadingLevel.TITLE,
    }),
  )

  if (options.includeMetadata) children.push(metadataTable(docx, options, document, exportedAt))
  if (options.includeToc) children.push(...tocParagraphs(docx, options, document))

  for (const [index, message] of orderedMessages(document).entries()) {
    const turn = index + 1
    children.push(
      speakerParagraph(docx, message.role, turn, message.timestamp, options, turnAnchor(turn)),
    )
    for (const [blockIndex, block] of message.content.entries()) {
      children.push(
        ...(await blockChildren(
          docx,
          block,
          options,
          block.kind === 'heading' ? headingAnchor(turn, blockIndex) : undefined,
        )),
      )
    }
  }

  if (options.includePreservationNotes) {
    children.push(
      new docx.Paragraph({
        children: [
          new docx.TextRun({
            text: preservationStatement(document),
            italics: true,
            font: FAMILY[options.fontFamily],
            size: BODY_HALF_POINTS[options.fontScale] - 2,
            color: MUTED,
          }),
        ],
        spacing: { before: 480 },
        border: { top: { style: docx.BorderStyle.SINGLE, size: 4, color: RULE, space: 8 } },
      }),
    )
  }

  const page = PAGE_DXA[options.pageSize]
  const file = new docx.Document({
    title: document.title,
    creator: 'PromptPaper',
    description: `Exported from a document held in this browser, in full, with nothing summarised.`,
    styles: headingStyles(options),
    numbering: {
      config: [
        {
          reference: 'pp-ordered',
          levels: [
            {
              level: 0,
              format: docx.LevelFormat.DECIMAL,
              text: '%1.',
              alignment: docx.AlignmentType.START,
            },
          ],
        },
      ],
    },
    sections: [
      {
        properties: {
          page: {
            size: { width: page.width, height: page.height },
            margin: { top: 1134, bottom: 1134, left: 1134, right: 1134 },
          },
        },
        footers: options.includePageNumbers
          ? {
              default: new docx.Footer({
                children: [
                  new docx.Paragraph({
                    alignment: docx.AlignmentType.CENTER,
                    children: [
                      new docx.TextRun({
                        children: ['Page ', docx.PageNumber.CURRENT, ' of ', docx.PageNumber.TOTAL_PAGES],
                        font: FAMILY[options.fontFamily],
                        size: BODY_HALF_POINTS[options.fontScale] - 4,
                        color: MUTED,
                      }),
                    ],
                  }),
                ],
              }),
            }
          : undefined,
        children,
      },
    ],
  })

  return docx.Packer.toBlob(file)
}

export { docxExporter }
