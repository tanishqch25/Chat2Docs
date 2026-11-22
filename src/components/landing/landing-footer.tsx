import { ArrowUpRight } from 'lucide-react'

import { Brand, BrandMark } from '@/components/landing/brand'

const FOOTER_LINKS = [
  { label: 'How it works', href: '#how' },
  { label: 'Sources', href: '#sources' },
  { label: 'Why PromptPaper', href: '#features' },
]

const PILL_LINKS = [
  { label: 'Sources', href: '#sources' },
  { label: 'Workflow', href: '#how' },
  { label: 'Preview', href: '#preview' },
]

function LandingFooter() {
  return (
    <footer className="footer">
      <Brand label="PromptPaper" />
      <span className="footer-note">Every conversation deserves a complete document.</span>
      <nav aria-label="Landing sections">
        {FOOTER_LINKS.map((link) => (
          <a key={link.href} href={link.href}>
            {link.label}
          </a>
        ))}
      </nav>
      <span className="copyright">© 2026 PromptPaper</span>
    </footer>
  )
}

/**
 * The floating navigation from the adopted format. It is fixed to the
 * viewport rather than the document, so it travels the whole page, and
 * the brand slot goes back to the top of the same page instead of
 * re-rendering the route.
 */
function BottomPill() {
  return (
    <nav className="bottom-pill" aria-label="Page sections">
      <a className="pill-brand" href="#top">
        <BrandMark className="pill-mark" />
        PromptPaper
      </a>
      <span className="pill-divider" aria-hidden />
      {PILL_LINKS.map((link) => (
        <a key={link.href} href={link.href}>
          {link.label}
        </a>
      ))}
      <a className="pill-next" href="#how" aria-label="Go to workflow">
        <ArrowUpRight size={14} aria-hidden />
      </a>
    </nav>
  )
}

export { BottomPill, LandingFooter }
