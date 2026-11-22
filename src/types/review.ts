/**
 * Review model.
 *
 * The shape is declared before the collection around it exists, in the
 * same spirit as the conversation types: the section on the landing page
 * reads from these types now, and whatever eventually stores and
 * moderates reviews has to satisfy them.
 *
 * Nothing here is wired to a live submission path. Until one exists the
 * landing page shows the genuine empty state, because inventing ratings
 * to fill it would be the one thing a reader could not tell apart from
 * real feedback.
 */

/** Whole stars, 1 to 5. */
export type Rating = 1 | 2 | 3 | 4 | 5

export type ReviewStatus = 'pending' | 'approved' | 'rejected'

export interface Review {
  id: string
  rating: Rating
  /** Free text. Empty is allowed — a reader may want to leave only a
   *  score — but a review with neither text nor a rating is not one. */
  body: string
  /** Display name, supplied by the reviewer. Never generated here. */
  authorName: string
  /** When the review was submitted, as an ISO string. */
  createdAt: string
  /** Only approved reviews reach the page; the rest stay out of the
   *  count and the average. */
  status: ReviewStatus
}

/** The reviews on record. Deliberately empty, not a placeholder to be
 *  swapped for figures later. */
export const REVIEWS: Review[] = []

export interface ReviewSummary {
  total: number
  /** Mean of the approved ratings, 0 when there are none. */
  average: number
}

/** Derived from the list, so the headline can never drift from the
 *  reviews it claims to summarise. */
export function summarise(reviews: Review[]): ReviewSummary {
  const approved = reviews.filter((review) => review.status === 'approved')
  const total = approved.length
  const average = total === 0 ? 0 : approved.reduce((sum, r) => sum + r.rating, 0) / total
  return { total, average }
}
