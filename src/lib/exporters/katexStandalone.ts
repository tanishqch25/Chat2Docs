import cssText from 'katex/dist/katex.min.css?raw'

import amsRegular from 'katex/dist/fonts/KaTeX_AMS-Regular.woff2?inline'
import caligraphicBold from 'katex/dist/fonts/KaTeX_Caligraphic-Bold.woff2?inline'
import caligraphicRegular from 'katex/dist/fonts/KaTeX_Caligraphic-Regular.woff2?inline'
import frakturBold from 'katex/dist/fonts/KaTeX_Fraktur-Bold.woff2?inline'
import frakturRegular from 'katex/dist/fonts/KaTeX_Fraktur-Regular.woff2?inline'
import mainBold from 'katex/dist/fonts/KaTeX_Main-Bold.woff2?inline'
import mainBoldItalic from 'katex/dist/fonts/KaTeX_Main-BoldItalic.woff2?inline'
import mainItalic from 'katex/dist/fonts/KaTeX_Main-Italic.woff2?inline'
import mainRegular from 'katex/dist/fonts/KaTeX_Main-Regular.woff2?inline'
import mathBoldItalic from 'katex/dist/fonts/KaTeX_Math-BoldItalic.woff2?inline'
import mathItalic from 'katex/dist/fonts/KaTeX_Math-Italic.woff2?inline'
import sansSerifBold from 'katex/dist/fonts/KaTeX_SansSerif-Bold.woff2?inline'
import sansSerifItalic from 'katex/dist/fonts/KaTeX_SansSerif-Italic.woff2?inline'
import sansSerifRegular from 'katex/dist/fonts/KaTeX_SansSerif-Regular.woff2?inline'
import scriptRegular from 'katex/dist/fonts/KaTeX_Script-Regular.woff2?inline'
import size1 from 'katex/dist/fonts/KaTeX_Size1-Regular.woff2?inline'
import size2 from 'katex/dist/fonts/KaTeX_Size2-Regular.woff2?inline'
import size3 from 'katex/dist/fonts/KaTeX_Size3-Regular.woff2?inline'
import size4 from 'katex/dist/fonts/KaTeX_Size4-Regular.woff2?inline'
import typewriterRegular from 'katex/dist/fonts/KaTeX_Typewriter-Regular.woff2?inline'

/**
 * KaTeX's stylesheet with its own typefaces carried inside it.
 *
 * A formula is set from metal, not from whatever the reader happens to
 * have installed: the sizing of a radical or a stacked fraction comes from
 * KaTeX's fonts, so an exported file that links them by path shows maths
 * the browser cannot draw. `?inline` turns each face into a base64 data URL
 * at build time, and `?raw` gives the stylesheet unedited — which is why
 * the references below are still the paths KaTeX ships and not ones Vite
 * rewrote to `/assets`.
 *
 * The web-foom and TrueOSF fallbacks go, because the file carries the
 * modern format; that keeps a formula-heavy export to one copy of each
 * face rather than three.
 */

/** The build-time base64 of each face, keyed by the name KaTeX uses in
 *  both its filenames and its `font-family` declarations. */
const FACES: Record<string, string> = {
  'KaTeX_AMS-Regular': amsRegular,
  'KaTeX_Caligraphic-Bold': caligraphicBold,
  'KaTeX_Caligraphic-Regular': caligraphicRegular,
  'KaTeX_Fraktur-Bold': frakturBold,
  'KaTeX_Fraktur-Regular': frakturRegular,
  'KaTeX_Main-Bold': mainBold,
  'KaTeX_Main-BoldItalic': mainBoldItalic,
  'KaTeX_Main-Italic': mainItalic,
  'KaTeX_Main-Regular': mainRegular,
  'KaTeX_Math-BoldItalic': mathBoldItalic,
  'KaTeX_Math-Italic': mathItalic,
  'KaTeX_SansSerif-Bold': sansSerifBold,
  'KaTeX_SansSerif-Italic': sansSerifItalic,
  'KaTeX_SansSerif-Regular': sansSerifRegular,
  'KaTeX_Script-Regular': scriptRegular,
  'KaTeX_Size1-Regular': size1,
  'KaTeX_Size2-Regular': size2,
  'KaTeX_Size3-Regular': size3,
  'KaTeX_Size4-Regular': size4,
  'KaTeX_Typewriter-Regular': typewriterRegular,
}

/** `KaTeX_Main-Bold` out of `…/fonts/KaTeX_Main-Bold.woff2`, wherever the
 *  path came from. */
const faceOf = (reference: string): string | undefined =>
  /KaTeX_[A-Za-z0-9]+(?:-[A-Za-z0-9]+)?/.exec(reference)?.[0]

export function standaloneKatexCss(): string {
  const withoutFallbacks = cssText.replace(
    /,\s*url\([^)]*\.(?:woff|ttf)\)\s*format\("[^"]*"\)/g,
    '',
  )

  return withoutFallbacks.replace(/url\(([^)]+)\)/g, (whole, reference: string) => {
    const name = faceOf(reference)
    const data = name ? FACES[name] : undefined
    // A reference this file does not carry stays untouched rather than
    // becoming an empty url(), which would break the whole rule.
    return data ? `url("${data}")` : whole
  })
}

/** Every face is present, or the stylesheet is not safe to embed. Checked
 *  once so a KaTeX upgrade that renames a font fails loudly here instead of
 *  quietly exporting unstyled maths. */
const referenced = new Set(
  [...cssText.matchAll(/url\([^)]*\)/g)]
    .map((match) => faceOf(match[0]))
    .filter((name): name is string => Boolean(name)),
)

const missing = [...referenced].filter((name) => !(name in FACES))

if (missing.length > 0) {
  throw new Error(
    `KaTeX ships a typeface this export does not carry: ${missing.join(', ')}. ` +
      'Add it to the faces in katexStandalone.ts.',
  )
}
