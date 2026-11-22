import { Link } from 'react-router-dom'

import { Wordmark } from '@/components/brand/wordmark'
import { Container } from '@/components/layout/container'
import { Eyebrow } from '@/components/layout/section-header'

/**
 * Destinations here are either anchors on the landing page or
 * application routes declared in the router. Anchors are root-relative
 * so they still resolve when the footer is read from `/documents`.
 * Nothing links to an invented support address, social profile, or legal
 * page with fabricated wording — those routes resolve to a plain "not
 * built yet" state until their milestone arrives.
 */
const COLUMNS: { title: string; links: { label: string; href: string }[] }[] = [
  {
    title: 'Product',
    links: [
      { label: 'Import a conversation', href: '/import' },
      { label: 'Documents', href: '/documents' },
      { label: 'Settings', href: '/settings' },
    ],
  },
  {
    title: 'Features',
    links: [
      { label: 'How it works', href: '/#how' },
      { label: 'Supported sources', href: '/#sources' },
      { label: 'Why PromptPaper', href: '/#features' },
      { label: 'Document preview', href: '/#preview' },
      { label: 'Reviews', href: '/#reviews' },
    ],
  },
  {
    title: 'Resources',
    links: [
      { label: 'Documentation', href: '/docs' },
      { label: 'Contact', href: '/contact' },
      { label: 'Privacy', href: '/privacy' },
      { label: 'Terms', href: '/terms' },
    ],
  },
]

function SiteFooter() {
  return (
    <footer className="pp-chrome border-t border-border">
      <Container className="py-16">
        <div className="grid gap-12 md:grid-cols-2 lg:grid-cols-[1.4fr_repeat(3,1fr)]">
          <div className="flex flex-col gap-4">
            <Wordmark />
            <p className="max-w-[34ch] text-body-sm text-muted">
              Your AI conversations, preserved and transformed into documents.
            </p>
          </div>

          {COLUMNS.map((column) => (
            <nav key={column.title} aria-label={column.title}>
              <Eyebrow>{column.title}</Eyebrow>
              <ul className="mt-4 flex flex-col gap-3">
                {column.links.map((link) => (
                  <li key={link.href}>
                    {link.href.startsWith('/#') ? (
                      <a
                        href={link.href}
                        className="text-body-sm font-medium text-foreground transition-colors hover:text-signal-blue"
                      >
                        {link.label}
                      </a>
                    ) : (
                      <Link
                        to={link.href}
                        className="text-body-sm font-medium text-foreground transition-colors hover:text-signal-blue"
                      >
                        {link.label}
                      </Link>
                    )}
                  </li>
                ))}
              </ul>
            </nav>
          ))}
        </div>

        <div className="mt-14 flex flex-col gap-4 border-t border-border pt-6 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-caption text-muted">© 2026 PromptPaper</p>
          <p className="text-caption text-muted">
            Built for conversations worth keeping — ChatGPT, Gemini, Claude, and anywhere else.
          </p>
        </div>
      </Container>
    </footer>
  )
}

export { SiteFooter }
