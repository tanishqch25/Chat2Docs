import { Link } from 'react-router-dom'

/** The adopted landing mark: four Signal Blue squares, two of them
 *  dimmed, tipped nine degrees over. `.brand-small` scales it down inside
 *  the mockups and `.pill-mark` is the same figure in the floating
 *  navigation, so the class is a prop rather than a second component. */
function BrandMark({ className = 'brand-mark' }: { className?: string }) {
  return (
    <span aria-hidden className={className}>
      <span />
      <span />
      <span />
      <span />
    </span>
  )
}

/**
 * The landing page spells the name lowercase, which is how the adopted
 * format sets it. `/documents` still uses the sheet wordmark from
 * `@/components/brand/wordmark`; the two are reconciled when the
 * workspace takes this format, not before.
 */
function Brand({ small = false, label = 'promptpaper' }: { small?: boolean; label?: string }) {
  return (
    <Link to="/" className={small ? 'brand brand-small' : 'brand'} aria-label="PromptPaper home">
      <BrandMark />
      <span>{label}</span>
    </Link>
  )
}

/** The glyph stands in for the provider's own mark, so it is a
 *  character taking colour from the class rather than an icon. */
const GLYPH = { chatgpt: '✳', gemini: '✦', claude: '✳' } as const

function SourceBadge({ name, kind }: { name: string; kind: keyof typeof GLYPH }) {
  return (
    <span className={`source-badge ${kind}`}>
      <i>{GLYPH[kind]}</i>
      {name}
    </span>
  )
}

export { Brand, BrandMark, SourceBadge }
