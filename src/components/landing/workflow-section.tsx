import type { ReactNode } from 'react'

import { Check, Download, FileText, FileUp, Sparkles } from 'lucide-react'

import { SourceBadge } from '@/components/landing/brand'

interface StepNote {
  /** Whether the step's own claim is already true in this browser. Set per
   *  step, because a step can be part-live — only the half that is not true
   *  belongs in the text beside the chip. */
  state: 'available now' | 'planned'
  text: string
}

interface Step {
  n: string
  label: string
  title: string
  text: string
  note?: StepNote
  icon: ReactNode
  preview: ReactNode
}

const SECTIONS = [
  'Chain Rule & Loss Gradients',
  'Vectorized Matrix Formulation',
  'Python Implementation & Edge Cases',
]

/**
 * The three steps, each with the mockup the adopted format gives it.
 * Step two is the product's actual promise rather than a generic "AI
 * makes it neat": the whole thread survives, and organising it is a
 * choice on top of that, not a replacement for it.
 */
const STEPS: Step[] = [
  {
    n: '01',
    label: 'PASTE OR UPLOAD',
    title: 'Bring the conversation',
    text: 'Paste a raw thread or upload an official AI export file. Start with the thinking you already have.',
    icon: <FileUp size={18} aria-hidden />,
    preview: (
      <div className="chat-preview">
        <div className="chat-bubble user-bubble">
          Turn this derivation into a study guide. Keep every equation and the code block.
        </div>
        <div className="chat-bubble ai-bubble">
          <span className="tiny-star" aria-hidden>
            &#10035;
          </span>
          <span className="line w70" />
          <span className="line w50" />
        </div>
        <div className="chat-source">
          <SourceBadge name="ChatGPT" kind="chatgpt" />
          <span>38 messages</span>
        </div>
      </div>
    ),
  },
  {
    n: '02',
    label: 'EXACT OR STRUCTURED',
    title: 'Preserve every detail',
    text: 'Keep 100% of messages, code blocks, math equations, and tables intact, or organize into study notes.',
    note: {
      state: 'available now',
      text: 'The exact conversation is what this build imports and keeps whole, message for message. Study notes and interview prep are opt-in at /transform: they ask a model you bring a key for, save a new derived document beside the original, and open by saying the AI restructured them. The exact record is never rewritten.',
    },
    icon: <Sparkles size={18} aria-hidden />,
    preview: (
      <div className="outline-preview">
        <span className="outline-head">
          DOCUMENT OUTLINE <Check size={12} aria-hidden />
        </span>
        {SECTIONS.map((section, i) => (
          <p key={section}>
            <b>0{i + 1}</b> {section}
          </p>
        ))}
        <div className="outline-foot">
          <span className="mini-glow" aria-hidden /> Exact text, still editable
        </div>
      </div>
    ),
  },
  {
    n: '03',
    label: 'EDIT & EXPORT',
    title: 'Export anywhere',
    text: 'Refine the layout and download clean PDF, DOCX, Markdown, HTML, or TXT files.',
    note: {
      state: 'available now',
      text: 'Four of the five formats download from the document preview at /export, in this browser; PDF is your browser’s own print dialog, set to Save as PDF. The words themselves are editable in place at /editor, and what you format there is what every one of those downloads shows.',
    },
    icon: <Download size={18} aria-hidden />,
    preview: (
      <div className="final-preview">
        <div className="final-icon">
          <FileText size={19} aria-hidden />
        </div>
        <div>
          <b>Backpropagation guide</b>
          <span>Complete, structured, yours.</span>
        </div>
        <Check size={15} aria-hidden className="final-check" />
      </div>
    ),
  },
]

function WorkflowSection() {
  return (
    <section className="workflow section-pad" id="how" aria-labelledby="how-title">
      <div className="section-heading">
        <div>
          <span className="tiny-label">A SHORTER DISTANCE FROM CHAT TO CLARITY</span>
          <h2 id="how-title">
            Keep everything.
            <br />
            <em>Lose the scroll.</em>
          </h2>
        </div>
        <p>
          One thread can hold a derivation, the code that proves it, and the decision you actually
          made. Give all of it a form that is easier to find, shape, and return to.
        </p>
      </div>

      <div className="steps-grid">
        {STEPS.map((step) => (
          <article className="step-card" key={step.n}>
            <div className="step-card-head">
              <span className="step-number">{step.n}</span>
              <span className="step-icon">{step.icon}</span>
            </div>
            <div className="step-preview">{step.preview}</div>
            <span className="tiny-label step-label">{step.label}</span>
            <h3>{step.title}</h3>
            <p>{step.text}</p>
            {step.note && (
              <p className="step-note">
                <span className="tiny-label">{step.note.state}</span>
                {step.note.text}
              </p>
            )}
          </article>
        ))}
      </div>
    </section>
  )
}

export { WorkflowSection }
