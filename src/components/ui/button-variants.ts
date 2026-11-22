import { cva } from 'class-variance-authority'

/**
 * Variants follow the supplied style reference: Signal Blue is
 * reserved for filled primary actions, Ink Navy for the dark
 * secondary, 8px corners at every size (not pill, not sharp), and
 * text is always Ink Navy rather than black.
 *
 * Held apart from button.tsx so that file exports only components,
 * which keeps Fast Refresh working in development.
 */
export const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-button font-medium transition-[background-color,color,box-shadow,transform] duration-150 ease-out disabled:pointer-events-none disabled:opacity-50 active:translate-y-px [&_svg]:pointer-events-none [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        primary:
          'bg-primary text-primary-foreground shadow-button hover:bg-deep-cobalt focus-visible:outline-primary',
        dark: 'bg-secondary text-secondary-foreground shadow-link hover:bg-ink-navy/90',
        outline:
          'border border-border bg-card text-foreground hover:border-mist-gray hover:bg-pebble',
        ghost: 'text-foreground hover:bg-pebble',
        link: 'text-foreground underline-offset-4 hover:underline',
      },
      size: {
        sm: 'h-9 px-3 text-body-sm font-medium',
        default: 'h-11 px-5 text-body font-semibold',
        lg: 'h-12 px-6 text-button font-semibold',
        icon: 'size-11',
      },
    },
    defaultVariants: {
      variant: 'primary',
      size: 'default',
    },
  },
)
