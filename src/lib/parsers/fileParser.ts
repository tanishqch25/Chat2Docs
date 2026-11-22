import { parsePaste } from '@/lib/parsers/pasteParser'
import type { ParsedConversationResult } from '@/types/import'

/**
 * Plain-file readers: markdown, text, HTML.
 *
 * A `.md` or `.txt` thread carries no schema, so it goes through the paste
 * reader, which splits only where the text itself names a speaker. That is
 * the same rule whether the words arrived by keyboard or by upload.
 *
 * HTML is read with `DOMParser` for its words and nothing else. Scripts,
 * styles and markup are how the export drew a page, not what the
 * conversation says; they are removed before the text is taken, and the
 * result never becomes a live node. A conversation that came out of a
 * browser is therefore never put back into one.
 */

const BLOCK_ELEMENTS =
  'p, div, li, ul, ol, h1, h2, h3, h4, h5, h6, section, article, header, footer, main, tr, td, th, pre, blockquote, figure, figcaption'

/**
 * The page as text, with the paragraph breaks the markup was making.
 *
 * `textContent` alone would run every block element together into one long
 * line, which is the one thing an import must not do to a conversation: two
 * turns written as two paragraphs would arrive as one.
 */
function textFromHtml(source: string): string {
  const parsed = new DOMParser().parseFromString(source, 'text/html')
  parsed.querySelectorAll('script, style, noscript, template, svg, head').forEach((node) => node.remove())
  parsed.querySelectorAll('br').forEach((node) => node.replaceWith('\n'))
  parsed.querySelectorAll(BLOCK_ELEMENTS).forEach((node) => {
    node.prepend('\n\n')
    node.append('\n\n')
  })
  const body = parsed.body?.textContent ?? parsed.documentElement?.textContent ?? ''
  return body.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n')
}

/** A markdown or plain-text thread, read exactly as a paste would be. */
export function parseTextFile(text: string): ParsedConversationResult {
  return parsePaste(text)
}

/**
 * An exported web page — Gemini's `chat.html`, a saved ChatGPT answer.
 *
 * The warning is the honest part: formatting and any image in the page are
 * not carried over, only the words and the shape of the paragraphs.
 */
export function parseHtmlFile(source: string): ParsedConversationResult {
  const text = textFromHtml(source)
  const result = parsePaste(text)
  return {
    ...result,
    warnings: [
      'This page was read for its words: markup, styling and any images in it are not part of the document.',
      ...result.warnings,
    ],
  }
}
