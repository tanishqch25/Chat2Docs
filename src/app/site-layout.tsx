import * as React from 'react'
import { Outlet, useLocation } from 'react-router-dom'

import { SiteFooter } from '@/components/layout/site-footer'
import { SiteHeader } from '@/components/layout/site-header'
import { GridPulse } from '@/components/ui/grid-pulse'

/**
 * A link to `/#features` from another route is a document load, and the
 * browser's own fragment jump happens before this app has rendered — the
 * target is not in the page yet, so the reader lands at the top. Scrolling
 * here, one frame after the route has painted, is what makes the section
 * links in the header and footer arrive where they say they do.
 *
 * The offset itself belongs to `scroll-padding-top` on `html` in index.css,
 * which is why the landing stylesheet must not also add a `scroll-margin`:
 * the two stack, and every section finishes a bar-height too low.
 */
function useHashScroll() {
  const { pathname, hash } = useLocation()

  React.useEffect(() => {
    const id = hash.slice(1)
    if (!id) return

    const frame = requestAnimationFrame(() => {
      document.getElementById(id)?.scrollIntoView()
    })

    return () => cancelAnimationFrame(frame)
  }, [pathname, hash])
}

/**
 * One GridPulse for the whole site, mounted here rather than per section:
 * the layer is the height of the document, so the grid is continuous from
 * the hero to the footer — and continuous again on /documents, since every
 * route renders through this outlet.
 *
 * The shell is the positioned ancestor the layer stretches over, and the
 * content wrapper above it is what keeps every card, button and heading on
 * top of the canvas. That is also why no band below paints a page-coloured
 * background across itself — an opaque section would hide the field, which
 * is the bug this layout exists to prevent.
 *
 * The `avoid` list names the elements that carry words, leaf level, plus the
 * form controls the workspace adds: a control has a fill of its own, but the
 * text inside it is still ink on the field. See the note on the prop.
 *
 * `/` carries its own bar, footer and pill, so the layout does not add a
 * second set around it — and it does not wrap that route in a `<main>`
 * either, since the landing page opens its own.
 *
 * `pp-chrome` is the mark the print stylesheet looks for. When a document
 * is printed or saved as PDF from /export, the grid, the bar and the footer
 * are the app, not the document, and they go; see the note in
 * `styles/export.css`.
 */
function SiteLayout() {
  useHashScroll()
  const { pathname } = useLocation()
  const isLanding = pathname === '/'

  return (
    <div className="relative flex min-h-dvh flex-col bg-background">
      <GridPulse
        className="pp-chrome z-0"
        avoid="[data-grid-avoid], h1, h2, h3, p, li, a, span, button, label, code, input, textarea, select"
      />

      <div className="relative z-10 flex flex-1 flex-col">
        {isLanding ? (
          <Outlet />
        ) : (
          <>
            <SiteHeader />
            <main className="flex-1">
              <Outlet />
            </main>
            <SiteFooter />
          </>
        )}
      </div>
    </div>
  )
}

export { SiteLayout }
