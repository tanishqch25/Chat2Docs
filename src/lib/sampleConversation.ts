import type { ContentBlock } from '@/types/conversation'
import type { DocumentProvider, NormalizedMessage } from '@/types/document'

/**
 * A conversation that ships with the product.
 *
 * Someone opening PromptPaper for the first time has nothing here, and every
 * interesting surface — the editor, the document modes, the export studio,
 * search — needs a real document to be judged on. Reading an import guide,
 * finding an old export and pasting it is a lot to ask before the first
 * click, so one thread is written out in full and offered in the empty
 * library.
 *
 * It is written as blocks, not as Markdown to be parsed, because that is what
 * an import produces: the sample exercises the same thirteen kinds a provider
 * file can carry, and it exercises them in the shape the store actually holds.
 * Nothing about it is invented on the reader's behalf afterwards — the thread
 * is titled “Sample”, it says what it is, and it can be deleted like any other
 * document.
 *
 * Identifiers and timestamps are fixed. Two visitors get the same record, a
 * screenshot of it can be reproduced, and the search demo has known words in
 * known blocks to look for.
 */

export const SAMPLE_TITLE = 'Sample: Rate Limiting Architectures — Token Bucket vs. Sliding Window'

export interface SampleConversation {
  title: string
  provider: DocumentProvider
  /** Blocks, straight into the library the way an import writes them. */
  messages: NormalizedMessage[]
}

/** The thread is set on a single afternoon so the turn order reads naturally. */
const START = Date.parse('2026-02-03T14:22:00Z')

const at = (seconds: number) => new Date(START + seconds * 1000).toISOString()

function turn(
  index: number,
  role: NormalizedMessage['role'],
  seconds: number,
  content: ContentBlock[],
): NormalizedMessage {
  return {
    id: `sample-turn-${index}`,
    role,
    content,
    sequence: index - 1,
    timestamp: at(seconds),
  }
}

export function buildSampleConversation(): SampleConversation {
  const messages: NormalizedMessage[] = [
    turn(1, 'user', 0, [
      {
        kind: 'text',
        text: 'I’m designing the rate limiter for a public API gateway and I keep going back and forth between a token bucket and a sliding window. Rough shape of the problem:',
      },
      {
        kind: 'list',
        ordered: false,
        items: [
          'Around 40 rps sustained per customer, but an agent that polls on a schedule can be silent for ten minutes and then arrive in a burst.',
          'Per-key state has to live in Redis, so the memory cost per customer is a real constraint, not a detail.',
          'The published limit is “1000 requests per minute”, and support tickets come from people who hit it early and cannot tell why.',
        ],
      },
      {
        kind: 'blockquote',
        text: 'What I actually want to know is which one is fairer to a customer who behaves well most of the time.',
      },
    ]),
    turn(2, 'assistant', 41, [
      { kind: 'heading', level: 2, text: 'Token bucket: the burst is the feature' },
      {
        kind: 'rich',
        runs: [
          { text: 'A ' },
          { text: 'token bucket', bold: true },
          { text: ' stores two numbers per key — the tokens on hand and when they were last topped up — and refills at a constant rate. It lets a customer ' },
          { text: 'spend what it saved', italic: true },
          { text: ', which is exactly the polling pattern you described. In practice the check is a handful of lines:' },
        ],
      },
      {
        kind: 'code',
        language: 'python',
        filename: 'token_bucket.py',
        code: `import time


class TokenBucket:
    def __init__(self, capacity: int, refill_rate: float):
        self.capacity = capacity
        self.refill_rate = refill_rate
        self.tokens = float(capacity)
        self.updated_at = time.monotonic()

    def allow(self, cost: int = 1) -> bool:
        now = time.monotonic()
        earned = (now - self.updated_at) * self.refill_rate
        self.tokens = min(self.capacity, self.tokens + earned)
        self.updated_at = now
        if self.tokens >= cost:
            self.tokens -= cost
            return True
        return False`,
      },
      {
        kind: 'text',
        text: 'The same shape in TypeScript, with the clock passed in so it can be tested without waiting:',
      },
      {
        kind: 'code',
        language: 'typescript',
        filename: 'slidingWindow.ts',
        code: `export interface Decision {
  allowed: boolean
  retryAfterMs: number
}

/** Sliding-window log: one timestamp per accepted request. */
export function allow(
  hits: number[],
  now: number,
  windowMs: number,
  limit: number,
): Decision {
  const cutoff = now - windowMs
  const active = hits.filter((at) => at > cutoff)

  if (active.length >= limit) {
    const first = Math.min(...active)
    return { allowed: false, retryAfterMs: first + windowMs - now }
  }

  active.push(now)
  return { allowed: true, retryAfterMs: 0 }
}`,
      },
      { kind: 'heading', level: 3, text: 'What each one costs' },
      {
        kind: 'table',
        caption: 'Per key, at 1000 requests per minute',
        headers: ['Approach', 'State per key', 'Behaviour under a burst'],
        rows: [
          ['Fixed window counter', '1 integer', 'Allows double the limit across a boundary'],
          ['Sliding window log', '1 entry per request', 'Exact, and the most memory by far'],
          ['Token bucket', '2 numbers', 'Smooths bursts up to the bucket capacity'],
        ],
      },
      {
        kind: 'text',
        text: 'If you keep only the two numbers, the effective rate a customer can sustain over an interval of length ',
      },
      { kind: 'math', expression: '\\Delta t', display: false },
      { kind: 'text', text: ' is the smaller of the bucket ceiling and the refill rate over that interval:' },
      {
        kind: 'math',
        // Stored as the expression alone, exactly as an import stores it —
        // the `display` flag is what puts it on its own line, not `$$`.
        expression:
          'R_{\\text{eff}} = \\min\\left( R_{\\max},\\; \\frac{B_0 + r \\cdot \\Delta t}{\\Delta t} \\right)',
        display: true,
      },
    ]),
    turn(3, 'user', 545, [
      {
        kind: 'rich',
        runs: [
          { text: 'That matches what I found in the ' },
          {
            text: 'Wikipedia overview of rate limiting',
            href: 'https://en.wikipedia.org/wiki/Rate_limiting',
          },
          { text: ', thank you. One thing I could not work out from the write-up: where do you put the ' },
          { text: 'refill', code: true },
          { text: ' when the limiter is shared by eight gateway nodes?' },
        ],
      },
      {
        kind: 'file',
        name: 'architecture-diagram.png',
        mimeType: 'image/png',
        sizeBytes: 184_320,
        note: 'Referenced in the conversation. The attachment itself was never uploaded here, so only its name, type and size are kept.',
      },
    ]),
    turn(4, 'assistant', 587, [
      { kind: 'heading', level: 2, text: 'Refill at the edge, decide in Redis' },
      {
        kind: 'list',
        ordered: true,
        items: [
          'Keep the bucket in Redis as a hash of two fields, and update it with a Lua script so the read, the refill and the decrement happen in one round trip.',
          'Do not let each node hold its own bucket: eight nodes each allowing a burst is eight times the burst the customer was promised.',
          'Set capacity to the limit you publish and refill to limit per second, so a full bucket is a full minute of quiet saved up.',
          'Return a Retry-After header with the number you computed. Most tickets about “I hit the limit early” are really tickets about not knowing when to come back.',
        ],
      },
      {
        kind: 'blockquote',
        text: 'Fairness rule of thumb: a fixed window punishes the customer whose requests straddle the boundary, and a sliding window log punishes nobody but pays for it in memory. A token bucket is the compromise most API gateways ship, and the one that reads best to a customer who is behaving.',
      },
      {
        kind: 'text',
        text: 'If you would rather count than smooth, use a sliding window over the log with an expiry per entry, and keep the window at one minute so it agrees with the number printed in your pricing page.',
      },
      {
        kind: 'unsupported',
        reason: 'Kept unchanged from the export so nothing in the thread is lost.',
        elementType: 'canvas',
      },
    ]),
  ]

  return { title: SAMPLE_TITLE, provider: 'chatgpt', messages }
}
