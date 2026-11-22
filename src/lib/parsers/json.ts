/**
 * Guards for reading an export file.
 *
 * A provider's JSON is external input: any field may be absent, may be the
 * wrong type, or may follow a shape an older version of the same product
 * used. These helpers let a parser ask for what it needs and carry on when
 * the answer is not there, which is what turns a malformed upload into a
 * message instead of a crash.
 */

export type JsonRecord = Record<string, unknown>

export const isRecord = (value: unknown): value is JsonRecord =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

export const asRecord = (value: unknown): JsonRecord | null => (isRecord(value) ? value : null)

/** A field that should be a list, when it may be anything at all. */
export const asArray = (value: unknown): unknown[] => (Array.isArray(value) ? value : [])

export const asString = (value: unknown): string | undefined =>
  typeof value === 'string' ? value : undefined

/** A string that has to hold something, for titles, ids and labels. */
export const asText = (value: unknown): string | undefined =>
  typeof value === 'string' && value.length > 0 ? value : undefined

export const asNumber = (value: unknown): number | undefined =>
  typeof value === 'number' && Number.isFinite(value) ? value : undefined

/** Some exports carry 0/1 where another carries true/false. */
export const isFlagged = (value: unknown): boolean =>
  value === true || value === 1 || value === 'true'

/**
 * A date out of whatever field the file happened to keep it in.
 *
 * Provider exports use seconds since the epoch, milliseconds, or an ISO
 * string, sometimes for the same event in two places. Anything that is not
 * one of those is treated as absent rather than guessed at.
 */
export function toIso(value: unknown): string | undefined {
  const numeric =
    asNumber(value) ??
    (typeof value === 'string' && /^\d{10,16}$/.test(value) ? Number(value) : undefined)
  if (numeric !== undefined && Number.isFinite(numeric)) {
    // Providers disagree about the unit, and the size of the number says
    // which: seconds, milliseconds, or — Gemini — microseconds.
    const seconds = numeric > 1e14 ? numeric / 1e6 : numeric > 1e11 ? numeric / 1e3 : numeric
    const date = new Date(seconds * 1000)
    return Number.isNaN(date.getTime()) ? undefined : date.toISOString()
  }
  const text = asString(value)
  if (text) {
    const date = new Date(text)
    return Number.isNaN(date.getTime()) ? undefined : date.toISOString()
  }
  return undefined
}

/** The first field that is a date, in the order the caller trusts. */
export function timestampFrom(...candidates: unknown[]): string | undefined {
  for (const candidate of candidates) {
    const iso = toIso(candidate)
    if (iso) return iso
  }
  return undefined
}

/** Pointers and ids go into sentences the user reads, so they arrive cut to
 *  something that fits a line. The file itself is kept whole in the block. */
export function shorten(value: string, max = 64): string {
  return value.length > max ? `${value.slice(0, max - 1)}…` : value
}
