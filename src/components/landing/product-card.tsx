import { Link } from 'react-router-dom'
import { ArrowUpRight, Check, Database, FileText, MoreHorizontal, PanelLeft, Plus, Sparkles } from 'lucide-react'

import { Brand, SourceBadge } from '@/components/landing/brand'

/**
 * The hero's angled workspace mockup, carried over from the adopted
 * format with its own content.
 *
 * Two things in it are deliberate. The sidebar slot the reference gave
 * to a signed-in person is given to the browser instead, because this
 * product has no account to show. And the action at the bottom opens
 * the real library rather than pretending to open a document that was
 * never made — the mockup is a preview, but nothing in it goes nowhere.
 */
function ProductCard() {
  return (
    <div
      className="product-card"
      aria-label="Example conversation transformed into an editable document"
    >
      <div className="card-top">
        <div className="window-dots">
          <i />
          <i />
          <i />
        </div>
        <span className="card-label">PROMPTPAPER WORKSPACE</span>
        <MoreHorizontal size={17} aria-hidden />
      </div>

      <div className="workspace">
        <aside className="mini-sidebar">
          <Brand small />
          <span className="side-active">
            <PanelLeft size={13} aria-hidden /> Library
          </span>
          <span>
            <FileText size={13} aria-hidden /> Documents
          </span>
          <span>
            <Plus size={13} aria-hidden /> New import
          </span>
          <div className="side-bottom">
            <span className="vault-mark">
              <Database aria-hidden />
            </span>
            <span>Local Browser Vault</span>
          </div>
        </aside>

        <div className="mini-main">
          <div className="source-row">
            <SourceBadge name="ChatGPT" kind="chatgpt" />
            <span>38 messages</span>
            <span className="status">
              <Check size={10} aria-hidden /> Ready
            </span>
          </div>

          <div className="document-sheet">
            <div className="sheet-kicker">STUDY GUIDE · 12 MIN READ</div>
            <h3>
              Neural Network
              <br />
              Backpropagation
            </h3>
            <p className="sheet-sub">Every equation and code block, kept</p>
            <div className="sheet-rule" />
            <div className="sheet-section">
              <b>01</b>
              <div>
                <strong>Chain Rule &amp; Loss Gradients</strong>
                <p>∂L/∂w for the output layer, then the term that carries it back a layer.</p>
              </div>
            </div>
            <div className="sheet-section">
              <b>02</b>
              <div>
                <strong>Vectorized Matrix Formulation</strong>
                <p>The same pass written as δˡ = (Wˡ⁺ᵀδˡ⁺¹) ⊙ σ′(zˡ).</p>
              </div>
            </div>
            <div className="sheet-section faded">
              <b>03</b>
              <div>
                <strong>Python Implementation &amp; Edge Cases</strong>
                <div className="line w70" />
                <div className="line w50" />
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="card-bottom">
        <span>
          <Sparkles size={13} aria-hidden /> Structured from 38 messages
        </span>
        <Link to="/documents" className="card-action">
          Open your library <ArrowUpRight size={13} aria-hidden />
        </Link>
      </div>
    </div>
  )
}

export { ProductCard }
