import * as React from 'react'
import { Link } from 'react-router-dom'
import { Menu, X } from 'lucide-react'

import { Wordmark } from '@/components/brand/wordmark'
import { Container } from '@/components/layout/container'
import { Button } from '@/components/ui/button'
import { buttonVariants } from '@/components/ui/button-variants'
import { cn } from '@/lib/utils'

/**
 * Root-relative, so the section links still land on the landing page
 * from `/documents`. A bare `#features` would be read against whatever
 * page is open and jump to an anchor that only exists on `/`.
 */
const NAV_LINKS = [
  { label: 'How it works', href: '/#how' },
  { label: 'Sources', href: '/#sources' },
  { label: 'Why PromptPaper', href: '/#features' },
  { label: 'Preview', href: '/#preview' },
  { label: 'Reviews', href: '/#reviews' },
]

function SiteHeader() {
  const [open, setOpen] = React.useState(false)

  return (
    <header className="pp-chrome sticky top-0 z-50 border-b border-border bg-background">
      <Container className="flex h-[var(--nav-height)] items-center justify-between gap-6">
        <Link to="/" className="shrink-0" aria-label="PromptPaper home">
          <Wordmark />
        </Link>

        <nav aria-label="Primary" className="hidden items-center gap-8 lg:flex">
          {NAV_LINKS.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="text-body-sm font-medium text-foreground transition-colors hover:text-signal-blue"
            >
              {link.label}
            </a>
          ))}
        </nav>

        {/* Two actions, and neither is an account: PromptPaper works
            without signing in. Import is where a conversation gets in,
            the library is where it lives, and both are built, so both are
            offered. They sit in the right-hand cluster rather than the
            section list because a route is not a section anchor. The menu
            stays a fallback for the section links. */}
        <div className="hidden items-center gap-5 md:flex">
          <Link
            to="/import"
            className="text-body-sm font-medium text-foreground transition-colors hover:text-signal-blue"
          >
            Import
          </Link>
          <Link to="/documents" className={buttonVariants({ size: 'sm' })}>
            Open your documents
          </Link>
        </div>

        <Button
          variant="ghost"
          size="icon"
          className="lg:hidden"
          aria-expanded={open}
          aria-controls="mobile-nav"
          onClick={() => setOpen((value) => !value)}
        >
          <span className="sr-only">{open ? 'Close menu' : 'Open menu'}</span>
          {open ? <X aria-hidden className="size-5" /> : <Menu aria-hidden className="size-5" />}
        </Button>
      </Container>

      {/*
        Two choices here are load-bearing. The panel is out of flow, so
        opening it never pushes the page down. And it stays mounted while
        closed: dismissing it inside the same click would disconnect the
        link the browser was about to follow, which cancels the jump to
        the section anchor.
      */}
      <div
        id="mobile-nav"
        className={cn(
          'absolute inset-x-0 top-full border-t border-border bg-background lg:hidden',
          !open && 'hidden',
        )}
      >
        <Container className="flex flex-col gap-1 py-4">
          <nav aria-label="Mobile" className="flex flex-col">
            {NAV_LINKS.map((link) => (
              <a
                key={link.href}
                href={link.href}
                onClick={() => setOpen(false)}
                className="rounded-button px-3 py-3 text-body font-medium text-foreground hover:bg-pebble"
              >
                {link.label}
              </a>
            ))}
          </nav>
          <Link
            to="/import"
            onClick={() => setOpen(false)}
            className="rounded-button px-3 py-3 text-body font-medium text-foreground hover:bg-pebble"
          >
            Import a conversation
          </Link>
          <Link
            to="/documents"
            onClick={() => setOpen(false)}
            className={`${buttonVariants({})} mt-3`}
          >
            Open your documents
          </Link>
        </Container>
      </div>
    </header>
  )
}

export { SiteHeader }
