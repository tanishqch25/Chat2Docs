import { Link } from 'react-router-dom'
import { ArrowRight } from 'lucide-react'

import { Container } from '@/components/layout/container'
import { Eyebrow } from '@/components/layout/section-header'
import { buttonVariants } from '@/components/ui/button-variants'

interface ComingSoonPageProps {
  title: string
  description: string
}

/**
 * The reserved routes land here. PromptPaper is being built a
 * milestone at a time, so these pages say plainly that the feature
 * has not been built yet rather than showing an interface that only
 * looks finished.
 */
function ComingSoonPage({ title, description }: ComingSoonPageProps) {
  return (
    <Container className="flex min-h-[60vh] items-center justify-center py-section">
      <div className="flex max-w-[46ch] flex-col items-start gap-5">
        <Eyebrow>Not built yet</Eyebrow>
        <h1 className="text-heading font-bold text-balance text-foreground">{title}</h1>
        <p className="text-body-lg text-muted">{description}</p>
        <p className="text-body-sm text-muted">
          What is built already: the landing page, the design system underneath it, a local library
          that keeps documents in this browser, the import that brings a conversation in — as
          pasted text or as a ChatGPT, Claude or Gemini export file — the editor that rewrites it
          section by section, the preview that writes a document to Word, HTML, Markdown or
          text, or prints it to PDF, and the opt-in AI modes that restructure a saved document with
          a key you bring yourself. What is not: the page you were looking for. PromptPaper runs in
          this browser, with no account and no server, so there is nothing stored elsewhere to put
          on a dashboard, nobody to email, and no policy anyone has had to write.
        </p>
        <div className="mt-2 flex flex-wrap gap-3">
          <Link to="/import" className={buttonVariants({})}>
            Import a conversation
            <ArrowRight aria-hidden className="size-4" />
          </Link>
          <Link to="/documents" className={buttonVariants({ variant: 'outline' })}>
            Open your documents
          </Link>
          <Link to="/" className={buttonVariants({ variant: 'ghost' })}>
            Back to the landing page
          </Link>
        </div>
      </div>
    </Container>
  )
}

export { ComingSoonPage }
