import { BottomPill, LandingFooter } from '@/components/landing/landing-footer'
import { ClosingSection } from '@/components/landing/closing-section'
import { FeatureSection } from '@/components/landing/feature-section'
import { Hero } from '@/components/landing/hero'
import { PreviewSection } from '@/components/landing/preview-section'
import { ReviewsSection } from '@/components/landing/reviews-section'
import { SourceStrip } from '@/components/landing/source-strip'
import { Topbar } from '@/components/landing/topbar'
import { WorkflowSection } from '@/components/landing/workflow-section'

/**
 * `/` in the adopted format: the section cadence, proportions and card
 * geometry come from the supplied reference, the copy is PromptPaper's.
 *
 * The route brings its own bar, footer and floating pill, because all
 * three are shaped around the landing sections — the sticky bar names
 * anchors that only exist here, and the pill travels a page rather than
 * a workspace. `SiteLayout` therefore leaves the chrome to this route
 * and `/documents` keeps the shared header and footer.
 */
function LandingPage() {
  return (
    <div className="pp-landing">
      <Topbar />

      <main id="main">
        <Hero />
        <SourceStrip />
        <WorkflowSection />
        <FeatureSection />
        <PreviewSection />
        <ReviewsSection />
        <ClosingSection />
      </main>

      <LandingFooter />
      <BottomPill />
    </div>
  )
}

export { LandingPage }
