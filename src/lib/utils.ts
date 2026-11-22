import { clsx, type ClassValue } from 'clsx'
import { extendTailwindMerge } from 'tailwind-merge'

/**
 * The type scale in styles/tokens.css is named, not numeric: `text-body`,
 * `text-caption`, `text-button`. tailwind-merge only knows Tailwind's own
 * sizes, so it files an unfamiliar `text-*` under its catch-all colour group
 * and a later colour class replaces it. That is what every filled control hit
 * — the variants carry a size and `text-primary-foreground` on one element.
 *
 * Naming the scale says which group each class belongs to, so a size and a
 * colour can sit together, and a real rival still overwrites only its own
 * kind: `text-body text-2xl` keeps one size, `text-muted text-foreground`
 * keeps one colour.
 *
 * The list is the set of `--text-*` tokens, so a new one is only a real
 * utility once it is also listed here.
 */
const FONT_SIZES = [
  'caption',
  'body-sm',
  'body',
  'button',
  'body-lg',
  'subheading',
  'heading-sm',
  'heading',
  'heading-lg',
  'display',
]

const twMerge = extendTailwindMerge({
  extend: { classGroups: { 'font-size': [{ text: FONT_SIZES }] } },
})

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
