import * as React from 'react'

import { cn } from '@/lib/utils'

function Container({ className, ...props }: React.ComponentProps<'div'>) {
  return <div className={cn('mx-auto w-full max-w-page px-5 sm:px-6 lg:px-8', className)} {...props} />
}

/** Vertical rhythm for a landing band. `bleed` lets a section
 *  paint its own background edge to edge while the content
 *  inside still respects the container. */
function Section({
  className,
  containerClassName,
  children,
  ...props
}: React.ComponentProps<'section'> & { containerClassName?: string }) {
  return (
    <section className={cn('py-section', className)} {...props}>
      <Container className={containerClassName}>{children}</Container>
    </section>
  )
}

export { Container, Section }
