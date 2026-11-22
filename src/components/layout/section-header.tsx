import * as React from 'react'

import { cn } from '@/lib/utils'

/** Small uppercase kickline above a heading. Set in Manrope, not
 *  the display face: it is wayfinding, not a brand moment. */
function Eyebrow({ className, ...props }: React.ComponentProps<'p'>) {
  return (
    <p
      className={cn(
        'text-caption font-semibold tracking-[0.16em] text-slate-gray uppercase',
        className,
      )}
      {...props}
    />
  )
}

function SectionHeader({
  eyebrow,
  title,
  description,
  align = 'center',
  className,
  titleClassName,
  ...props
}: Omit<React.ComponentProps<'div'>, 'title'> & {
  eyebrow?: string
  title: React.ReactNode
  description?: React.ReactNode
  align?: 'center' | 'left'
  titleClassName?: string
}) {
  return (
    <div
      className={cn(
        'flex flex-col gap-4',
        align === 'center' ? 'items-center text-center' : 'items-start text-left',
        className,
      )}
      {...props}
    >
      {eyebrow ? <Eyebrow>{eyebrow}</Eyebrow> : null}
      <h2
        className={cn(
          'max-w-[22ch] text-heading font-bold text-balance text-foreground',
          align === 'center' && 'mx-auto',
          titleClassName,
        )}
      >
        {title}
      </h2>
      {description ? (
        <p
          className={cn(
            'max-w-[60ch] text-body-lg text-muted',
            align === 'center' && 'mx-auto',
          )}
        >
          {description}
        </p>
      ) : null}
    </div>
  )
}

export { Eyebrow, SectionHeader }
