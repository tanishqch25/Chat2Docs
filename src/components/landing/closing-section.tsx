import { Link } from 'react-router-dom'
import { ArrowRight } from 'lucide-react'

/** Nine pixels, staggered down the band. Pure decoration, and the shared
 *  grid behind the page is what actually lights this section. */
const ART = Array.from({ length: 9 }, (_, i) => i)

function ClosingSection() {
  return (
    <section className="closing" aria-labelledby="closing-title">
      <div className="closing-art" aria-hidden>
        {ART.map((i) => (
          <span className="closing-pixel" key={i} />
        ))}
      </div>

      <div className="closing-content">
        <span className="tiny-label">GOOD THINKING DESERVES TO OUTLIVE THE THREAD</span>
        <h2 id="closing-title">
          Every conversation
          <br />
          is worth keeping,
          <br />
          <em>down to the last detail.</em>
        </h2>
        <div className="closing-actions">
          <Link className="button-primary" to="/documents">
            Open Local Library <ArrowRight size={16} aria-hidden />
          </Link>
          <Link className="button-secondary" to="/import">
            Import a conversation
          </Link>
        </div>
        <span className="closing-footnote">PromptPaper · Conversation in, complete document out.</span>
      </div>
    </section>
  )
}

export { ClosingSection }
