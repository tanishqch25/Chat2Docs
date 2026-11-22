import { Info } from 'lucide-react'

/**
 * The honest warning. PromptPaper keeps documents in the browser because it
 * has no account and no server, and that is a real limitation with three
 * specific ways to lose work. Saying so is part of the product, so this sits
 * at the top of the workspace rather than in a footer nobody reads.
 */
function DataLossNotice() {
  return (
    <section
      aria-labelledby="data-loss-title"
      className="rounded-product border border-border bg-badge-bg p-5 sm:p-7"
    >
      <div className="flex gap-4">
        <Info aria-hidden className="mt-0.5 size-5 shrink-0 text-deep-cobalt" />
        <div className="flex flex-col gap-3">
          <h2 id="data-loss-title" className="text-body-lg font-semibold text-foreground">
            These documents live in this browser, and nowhere else
          </h2>
          <p className="max-w-[68ch] text-body text-muted">
            PromptPaper has no account and no server to keep copies on. Everything here is written
            to this browser&apos;s IndexedDB, which means three things will remove them
            permanently:
          </p>
          <ul className="flex max-w-[68ch] flex-col gap-1.5 text-body text-muted">
            <li>Clearing site data, browsing history or cache for this page.</li>
            <li>Working in a private or incognito window — nothing written there survives it.</li>
            <li>Opening PromptPaper on another device, browser or profile.</li>
          </ul>
          <p className="max-w-[68ch] text-body font-medium text-foreground">
            Export a JSON backup before you clear anything, and again from time to time. A backup
            restores the whole library on any browser, including this one.
          </p>
        </div>
      </div>
    </section>
  )
}

export { DataLossNotice }
