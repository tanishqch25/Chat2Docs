import { Link } from 'react-router-dom'
import { ArrowDown, ArrowRight, Check, Sparkles } from 'lucide-react'

import { ProductCard } from '@/components/landing/product-card'

/**
 * The split hero. The reference drew its own clipped pixel band behind
 * this section and hung the caption inside it; the caption opens the
 * copy column instead, because the page lights one shared full-height
 * GridPulse layer that is the same atmosphere across every section.
 */
function Hero() {
  return (
    <section className="hero" id="top" aria-labelledby="hero-title">
      <div className="hero-copy">
        <div className="hero-caption">
          <span className="live-dot" aria-hidden /> Every conversation deserves a complete document
        </div>

        <div className="eyebrow">
          <span className="eyebrow-line" aria-hidden /> YOUR AI CONVERSATIONS, PRESERVED
        </div>

        <h1 id="hero-title">
          Your AI chats.
          <br />
          <em>Finally, documented.</em>
        </h1>

        <p className="hero-description">
          Long AI threads hold code, math, tables, and breakthroughs that vanish in chat history.
          Convert ChatGPT, Gemini, and Claude conversations into complete, structured
          documents&mdash;without losing a single detail.
        </p>

        <div className="hero-actions">
          <Link className="button-primary" to="/documents">
            Open Local Library <ArrowRight size={16} aria-hidden />
          </Link>
          <Link className="button-secondary" to="/import">
            Import a conversation
          </Link>
          <a className="button-secondary" href="#preview">
            <span className="play-icon" aria-hidden>
              &darr;
            </span>{' '}
            Explore the preview
          </a>
        </div>

        <div className="hero-meta">
          <span>
            <i className="meta-dot" aria-hidden /> Nothing stored in an account
          </span>
          <span className="meta-divider" aria-hidden />
          <span>Saved in this browser</span>
        </div>
      </div>

      <div className="hero-product">
        <div className="float-note">
          <span className="note-icon">
            <Sparkles size={15} aria-hidden />
          </span>
          <div>
            <b>Kept exactly</b>
            <span>Every message, equation, and code block.</span>
          </div>
        </div>

        <ProductCard />

        <div className="floating-tag">
          <span className="tag-check">
            <Check size={11} aria-hidden />
          </span>
          Ready to make your own
        </div>
      </div>

      <a className="scroll-cue" href="#sources">
        <span>SCROLL TO EXPLORE</span>
        <ArrowDown size={14} aria-hidden />
      </a>
    </section>
  )
}

export { Hero }
