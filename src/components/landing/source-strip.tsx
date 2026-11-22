import { FileUp } from 'lucide-react'

import { SourceBadge } from '@/components/landing/brand'

const SOURCES = [
  { name: 'ChatGPT', kind: 'chatgpt' as const },
  { name: 'Gemini', kind: 'gemini' as const },
  { name: 'Claude', kind: 'claude' as const },
]

/**
 * Where the conversations come from. All three are reached two ways in the
 * build that is running now: copying a thread in, or handing PromptPaper the
 * export file the provider generates. The formats named underneath are the
 * ones the readers accept.
 */
function SourceStrip() {
  return (
    <section className="source-strip" id="sources" aria-labelledby="sources-title">
      <div className="source-intro">
        <span className="tiny-label">START WHERE YOU THINK</span>
        <h2 id="sources-title" className="sr-only">
          Where conversations come from
        </h2>
        <p>
          Bring conversations
          <br />
          from the tools you use.
        </p>
      </div>

      <div className="source-list">
        {SOURCES.map((source) => (
          <div className="source-item" key={source.kind}>
            <SourceBadge name={source.name} kind={source.kind} />
            <span>Paste or upload</span>
          </div>
        ))}

        <div className="upload-note">
          <FileUp size={15} aria-hidden /> JSON, MD, HTML, TXT, ZIP
        </div>
      </div>
    </section>
  )
}

export { SourceStrip }
