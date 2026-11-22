import { ArrowRight, Check, FileText } from 'lucide-react'

import { SourceBadge } from '@/components/landing/brand'

/**
 * The orbital diagram, read the way PromptPaper actually works: a
 * thread arrives, the structure is decided, and what leaves is the same
 * content in a form that can be edited. The connector is labelled
 * `exact structure` for that reason — the middle step does not rewrite
 * what it is given.
 */
function FeatureSection() {
  return (
    <section className="feature-section" id="features" aria-labelledby="features-title">
      <div className="feature-inner">
        <div className="feature-copy">
          <span className="tiny-label">BUILT AROUND WHAT YOU KEEP</span>
          <h2 id="features-title">
            Not another chat.
            <br />
            <em>A document that loses<br />nothing.</em>
          </h2>
          <p>
            PromptPaper carries the whole conversation forward. Keep it exactly as it happened, and
            it stays in this browser, message for message. Organise it into something you can study
            from and every code block, equation and table is still reproduced as written &mdash; in a
            new document, with the exact thread left beside it.
          </p>
          <a className="text-link" href="#preview">
            Take a closer look <ArrowRight size={15} aria-hidden />
          </a>
        </div>

        <div className="feature-visual" aria-hidden>
          <div className="orbit orbit-one" />
          <div className="orbit orbit-two" />

          <div className="flow-node source-node">
            <div className="node-mark">
              <SourceBadge name="" kind="chatgpt" />
            </div>
            <span>THE CONVERSATION</span>
            <strong>Raw AI thread</strong>
            <div className="node-lines">
              <i />
              <i />
              <i />
            </div>
          </div>

          <div className="flow-connector">
            <span>exact structure</span>
            <i />
          </div>

          <div className="flow-node doc-node">
            <div className="doc-symbol">
              <FileText size={20} />
            </div>
            <span>YOUR DOCUMENT</span>
            <strong>Preserved &amp; formatted</strong>
            <div className="node-lines">
              <i />
              <i />
              <i />
            </div>
          </div>

          <div className="feature-stamp">
            <span className="stamp-icon">
              <Check size={12} />
            </span>
            <span>
              Nothing dropped
              <br />
              Code &amp; math intact
              <br />
              Yours to keep
            </span>
          </div>

          <div className="feature-caption">FROM A LONG THREAD TO A DOCUMENT THAT LOSES NOTHING</div>
        </div>
      </div>
    </section>
  )
}

export { FeatureSection }
