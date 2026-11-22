import {
  Check,
  ChevronDown,
  Database,
  FileText,
  MoreHorizontal,
  PanelLeft,
  Plus,
} from 'lucide-react'

import { Brand, SourceBadge } from '@/components/landing/brand'

const OUTLINE = [
  'Chain rule & loss gradients',
  'Vectorized matrix formulation',
  'Python implementation & edge cases',
]

/** Kept as literal strings so the line breaks inside the blocks are the
 *  ones the reader sees: `white-space: pre` reads the text node, and JSX
 *  would otherwise fold the newlines away. */
const SCALAR_CODE = `∂L/∂zᴸ = aᴸ − y
∂L/∂Wᴸ = (∂L/∂zᴸ) · (aᴸ⁻¹)ᵀ
δˡ     = (Wˡ⁺¹ᵀ δˡ⁺¹) ⊙ σ′(zˡ)`

const BATCH_CODE = `δᴸ = (aᴸ − Y) / m              # (C, N)
δˡ = (Wˡ⁺¹ᵀ δˡ⁺¹) ⊙ σ′(Zˡ)
∇Wˡ L = δˡ (Aˡ⁻¹)ᵀ`

const PY_CODE = `def backward(dZ, A_prev, W):
    m = A_prev.shape[1]
    dW  = dZ @ A_prev.T / m
    db  = dZ.sum(axis=1, keepdims=True) / m
    dA  = W.T @ dZ
    return dA, dW, db`

/**
 * The four-pane preview. The sheet is the same study guide the hero
 * card shows, opened further: three sections with the equations and the
 * Python pass still in them, and the source thread on the right so the
 * reader can see where each part came from.
 *
 * The rail carries no person. The slot the reference gave an avatar
 * carries the vault mark instead, because the document lives in this
 * browser and there is no account to sign into.
 */
function PreviewSection() {
  return (
    <section className="preview-section section-pad" id="preview" aria-labelledby="preview-title">
      <div className="preview-header">
        <div>
          <span className="tiny-label">A DOCUMENT, NOT A TRANSCRIPT</span>
          <h2 id="preview-title">
            Your conversation,
            <br />
            <em>with nothing left<br />out of it.</em>
          </h2>
        </div>
        <p>
          See the difference a thoughtful structure makes. The result is an editable document that
          still holds the math and the code, not a summary of what was said.
        </p>
      </div>

      <div className="editor-window" aria-label="Example document, as it appears in the workspace">
        <div className="editor-top">
          <div className="window-dots" aria-hidden>
            <i />
            <i />
            <i />
          </div>
          <span className="editor-breadcrumb">
            My documents <span aria-hidden>/</span> Backpropagation
          </span>
          <div className="editor-actions">
            <span aria-label="More options">
              <MoreHorizontal size={17} />
            </span>
            <span className="export-button">
              Export <ChevronDown size={13} aria-hidden />
            </span>
          </div>
        </div>

        <div className="editor-body">
          <aside className="editor-rail" aria-label="Workspace">
            <Brand small />
            <span className="rail-item rail-selected">
              <PanelLeft size={15} aria-hidden />
            </span>
            <span className="rail-item">
              <FileText size={15} aria-hidden />
            </span>
            <span className="rail-item">
              <Plus size={15} aria-hidden />
            </span>
            <span className="vault-mark rail-vault" title="Local Browser Vault">
              <Database aria-hidden />
            </span>
          </aside>

          <div className="editor-outline">
            <span className="tiny-label">ON THIS PAGE</span>
            {OUTLINE.map((item, i) => (
              <a key={item} href="#preview" className={i === 0 ? 'outline-selected' : undefined}>
                {item}
              </a>
            ))}

            <div className="outline-source">
              <span>BASED ON</span>
              <div>
                <SourceBadge name="ChatGPT" kind="chatgpt" />
              </div>
              <small>38 messages · Saved in this browser</small>
            </div>
          </div>

          <article className="editor-paper">
            <div className="paper-topline">
              STUDY GUIDE <span aria-hidden>·</span> 12 MIN READ
            </div>
            <h3>
              Neural Network Backpropagation
              <br />&amp; Gradient Descent
            </h3>
            <p className="paper-intro">Every equation and code block, kept from the thread</p>
            <div className="paper-rule" />

            <h4>
              <span>01</span> Chain Rule &amp; Loss Gradients
            </h4>
            <p>
              The gradient at the output falls straight out of the loss: the prediction minus the
              target. One layer earlier the same error is carried backwards through the weights that
              produced it, then scaled by the slope of the activation at that layer.
            </p>
            <div className="paper-code">{SCALAR_CODE}</div>

            <h4>
              <span>02</span> Vectorized Matrix Formulation
            </h4>
            <p>
              Written for a whole batch at once, the pass is three matrix products per layer. Columns
              index examples, so dividing by the batch size at the end is what turns a sum over
              examples into a mean.
            </p>
            <div className="paper-code">{BATCH_CODE}</div>

            <h4>
              <span>03</span> Python Implementation &amp; Edge Cases
            </h4>
            <p>
              The same three lines as a function. The cases that break it are the ones worth
              remembering: saturated sigmoids return a slope near zero, and a long sequence can shrink
              or blow up the product, which is what gradient clipping is for.
            </p>
            <div className="paper-code">{PY_CODE}</div>

            <div className="paper-footer">
              <span>
                <Check size={12} aria-hidden /> Nothing dropped
              </span>
              <span>38 messages · 3 code blocks</span>
            </div>
          </article>

          <aside className="editor-assist" aria-label="Source thread">
            <span className="tiny-label">SOURCE THREAD</span>
            <div className="assist-header">
              <SourceBadge name="ChatGPT" kind="chatgpt" />
              <MoreHorizontal size={15} aria-hidden />
            </div>

            <div className="assist-message">
              <span className="assist-speaker">YOU</span>
              <p>
                Walk me through backprop for an L-layer net. Keep the shapes visible so I can check
                them against my NumPy code.
              </p>
            </div>
            <div className="assist-message assist-ai">
              <span className="assist-speaker">
                <i aria-hidden>✳</i> CHATGPT
              </span>
              <p>
                Start at the loss: δᴸ = aᴸ − y. Move one layer back by pushing δ through Wᵗ and
                multiplying elementwise by σ′(zˡ).
              </p>
            </div>
            <div className="assist-message">
              <span className="assist-speaker">YOU</span>
              <p>And for a batch of m examples?</p>
            </div>

            <div className="assist-foot">
              <span className="assist-dot" aria-hidden /> Linked to this document
            </div>
          </aside>
        </div>
      </div>

      <div className="preview-caption">
        <span>ONE CONVERSATION, ORGANIZED AROUND WHAT MATTERS.</span>
        <span>CONCEPTUAL PRODUCT PREVIEW</span>
      </div>
    </section>
  )
}

export { PreviewSection }
