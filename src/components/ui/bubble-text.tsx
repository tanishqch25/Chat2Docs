import * as React from 'react'

import { cn } from '@/lib/utils'

export interface BubbleTextProps
  extends Omit<React.HTMLAttributes<HTMLElement>, 'children'> {
  /** The headline. Rendered, never hardcoded into the component. */
  text: string
  /** Element to render as, so a hero can be an h1 while a section
   *  reuses the same effect on an h2. Defaults to a span. */
  as?: React.ElementType
}

/** Weight step for a character by its distance from the one under
 *  the pointer: 0 is the character itself, then its neighbours.
 *  Heaviest at the pointer, tapering back to the caller's own weight,
 *  so the resting headline needs a step of headroom above it. */
const LADDER = ['font-extrabold', 'font-bold']

/**
 * A headline that swells character by character under the pointer.
 *
 * Adapted from the supplied reference, with three deliberate changes
 * for this product: the demo copy and the indigo-on-black demo styling
 * are gone in favour of props and the PromptPaper type scale; the
 * hovered index is typed rather than inferred; and characters are
 * grouped into non-breaking words so a long headline can still wrap on
 * narrow screens, which splitting the raw string into spans would have
 * prevented.
 */
export function BubbleText({ text, as: Tag = 'span', className, ...props }: BubbleTextProps) {
  const [hoveredIndex, setHoveredIndex] = React.useState<number | null>(null)

  // One index sequence across the whole string, so the ladder spreads
  // past word boundaries, but split on spaces so wrapping stays legal.
  const words = React.useMemo(() => {
    const parts = text.split(' ')
    return parts.map((word, wordIndex) => {
      const start = parts
        .slice(0, wordIndex)
        .reduce((total, previous) => total + previous.length + 1, 0)
      return Array.from(word).map((char, charIndex) => ({ char, index: start + charIndex }))
    })
  }, [text])

  // Touch has no resting pointer, so a tap would leave the heading stuck
  // mid-swell. Static text is the right behaviour there.
  const focus = (event: React.PointerEvent<HTMLElement>, index: number | null) => {
    if (event.pointerType !== 'touch') setHoveredIndex(index)
  }

  return (
    <Tag
      className={cn('cursor-default font-normal text-foreground', className)}
      onPointerLeave={(event: React.PointerEvent<HTMLElement>) => focus(event, null)}
      {...props}
    >
      <span className="sr-only">{text}</span>
      <span aria-hidden="true">
        {words.map((chars, wordIndex) => (
          <React.Fragment key={wordIndex}>
            <span className="whitespace-nowrap">
              {chars.map(({ char, index }) => {
                const distance = hoveredIndex === null ? null : Math.abs(hoveredIndex - index)
                const step = distance === null ? undefined : LADDER[distance]
                return (
                  <span
                    key={index}
                    onPointerEnter={(event) => focus(event, index)}
                    className={cn('transition-[font-weight,color] duration-300 ease-in-out', step)}
                  >
                    {char}
                  </span>
                )
              })}
            </span>
            {wordIndex < words.length - 1 ? ' ' : null}
          </React.Fragment>
        ))}
      </span>
    </Tag>
  )
}
