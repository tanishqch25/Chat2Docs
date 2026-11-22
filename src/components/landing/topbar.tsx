import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowUpRight, Menu, X } from 'lucide-react'

import { Brand } from '@/components/landing/brand'

/**
 * These anchors are written bare because the bar only renders on `/`,
 * which is the page that owns the sections. `/documents` reaches the
 * same targets through the root-relative links in the shared header.
 */
const NAV_LINKS = [
  { label: 'How it works', href: '#how' },
  { label: 'Sources', href: '#sources' },
  { label: 'Why PromptPaper', href: '#features' },
  { label: 'Reviews', href: '#reviews' },
]

/**
 * The sticky bar from the adopted format. It sits inside a full-width
 * wrapper because `.topbar` itself is capped at 1440px and centred, and
 * a centred max-width element cannot stick with a background that
 * reaches the edges of the viewport.
 */
function Topbar() {
  const [menuOpen, setMenuOpen] = useState(false)

  return (
    <div className="topbar-wrap">
      <header className="topbar">
        <Brand />

        <nav
          id="landing-nav"
          className={menuOpen ? 'nav-links nav-open' : 'nav-links'}
          aria-label="Primary"
        >
          {NAV_LINKS.map((link) => (
            <a key={link.href} href={link.href} onClick={() => setMenuOpen(false)}>
              {link.label}
            </a>
          ))}
          {/* The one route in this list, and the reason the bar is labelled
              “Primary” rather than “Landing sections”: from here a visitor
              can both read about the product and start using it. */}
          <Link to="/import" onClick={() => setMenuOpen(false)}>
            Import
          </Link>
        </nav>

        <div className="nav-right">
          <a className="sign-in" href="#preview">
            Preview
          </a>
          <Link className="nav-cta" to="/documents">
            Open Library <ArrowUpRight size={14} aria-hidden />
          </Link>
        </div>

        <button
          className="menu-toggle"
          type="button"
          aria-expanded={menuOpen}
          aria-controls="landing-nav"
          aria-label={menuOpen ? 'Close menu' : 'Open menu'}
          onClick={() => setMenuOpen((open) => !open)}
        >
          {menuOpen ? <X aria-hidden /> : <Menu aria-hidden />}
        </button>
      </header>
    </div>
  )
}

export { Topbar }
