import { Star } from 'lucide-react'

import { REVIEWS, summarise } from '@/types/review'

const RULES = [
  'One score from 1 to 5, and a few words if you want to leave them.',
  'The average and the count come only from reviews that were actually submitted.',
  'A review appears after moderation, and duplicates or promotional text are filtered first.',
]

/** Five outlines, filled up to the whole star nearest the average. At
 *  zero every one of them stays an outline — drawing them is the point. */
function Stars({ value }: { value: number }) {
  return (
    <div className="reviews-stars" role="img" aria-label={`${value.toFixed(1)} of 5`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Star key={n} size={15} aria-hidden fill={n <= Math.round(value) ? 'currentColor' : 'none'} />
      ))}
    </div>
  )
}

/**
 * The review band in its genuine starting state, in the same grammar as
 * the rest of the page: mono label, display heading with a serif accent,
 * one white bordered panel.
 *
 * Nothing here is invented. Both figures come from `summarise(REVIEWS)`,
 * so the headline moves only when a review actually exists, and there is
 * no submission form because a form that goes nowhere would be worse than
 * none.
 */
function ReviewsSection() {
  const { total, average } = summarise(REVIEWS)

  return (
    <section className="reviews-section" id="reviews" aria-labelledby="reviews-title">
      <div className="reviews-head">
        <div>
          <span className="tiny-label">REVIEWS</span>
          <h2 id="reviews-title">
            Nothing to report
            <br />
            <em>yet.</em>
          </h2>
        </div>
        <p>
          No review has been submitted, so there is nothing to summarise. Rather than show invented
          praise, this band reports the figure exactly as it is.
        </p>
      </div>

      <div className="reviews-panel">
        <div className="reviews-score">
          <div className="reviews-figure">
            {average.toFixed(1)} <em>/ 5</em>
          </div>
          <Stars value={average} />
          <p className="reviews-count">
            {total} {total === 1 ? 'review' : 'reviews'} so far
          </p>
        </div>

        <div className="reviews-body">
          <p>No reviews have been submitted yet.</p>
          <ul className="reviews-rules">
            {RULES.map((rule) => (
              <li key={rule}>{rule}</li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  )
}

export { ReviewsSection }
