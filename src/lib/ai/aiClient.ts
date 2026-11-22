/**
 * The two adapters that reach an AI provider, and nothing else.
 *
 * Both are plain `fetch` from the page: there is no PromptPaper server, so
 * the request carries the user's own key from their own browser and the
 * provider's own answer comes back to the same tab. That is the whole
 * security model, and it is why the two rules here are absolute — the key
 * only ever goes to the endpoint the user named, over http(s), and only ever
 * after Generate was pressed.
 *
 * Every failure becomes a sentence a reader can act on. Providers return
 * recognisable statuses, so the message names the status, what it usually
 * means, and what to do next rather than passing a stack through.
 */

import type { AiSettings } from '@/lib/ai/aiSettings'

export interface AiPrompt {
  system: string
  user: string
}

/** Thrown when the user pressed Cancel. Not a failure to report as one. */
export class AiCancelledError extends Error {
  constructor() {
    super('Generation cancelled.')
    this.name = 'AiCancelledError'
  }
}

/** Anything the provider, the network or the response shape got wrong. */
export class AiRequestError extends Error {
  readonly status: number | null

  constructor(message: string, status: number | null = null) {
    super(message)
    this.name = 'AiRequestError'
    this.status = status
  }
}

const isAbort = (error: unknown): boolean =>
  error instanceof DOMException ? error.name === 'AbortError' : false

/** The key must not travel anywhere a user did not type. A `javascript:` or
 *  `file:` base URL is a mistake at best, so it is refused before fetch. */
function assertHttpUrl(url: string, label: string): string {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    throw new AiRequestError(`The ${label} is not a readable address: ${url}`)
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    throw new AiRequestError(`The ${label} must start with https:// (it is ${parsed.protocol})`)
  }
  return parsed.toString()
}

/** One explanation for any status, written for the person reading the page. */
function describeStatus(status: number, body: string, model: string): string {
  const detail = body.trim().slice(0, 300)
  if (status === 401 || status === 403) {
    return `The provider refused this API key (${status}). Check that it was pasted in full, is still active, and is allowed to use “${model}”.`
  }
  if (status === 404) {
    return `The provider has no model called “${model}” (${status}). Check the model name, or the base URL if you are pointing at a different service.`
  }
  if (status === 429) {
    return `The provider rate-limited this request (${status}). The conversation may simply be longer than this key's allowance per minute — wait a moment and generate again.`
  }
  if (status >= 500) {
    return `The provider answered ${status}, which is trouble on its side rather than in this document. Try again shortly.${detail ? ` It said: ${detail}` : ''}`
  }
  return `The provider answered ${status}.${detail ? ` It said: ${detail}` : ''}`
}

async function post(
  url: string,
  headers: Record<string, string>,
  body: unknown,
  signal: AbortSignal,
  label: string,
  model: string,
) {
  let response: Response
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify(body),
      signal,
    })
  } catch (error) {
    if (signal.aborted || isAbort(error)) throw new AiCancelledError()
    throw new AiRequestError(
      `The browser could not reach the ${label} at ${url}. A blocked request, an offline connection or a server that refuses cross-origin calls all look like this from here.`,
    )
  }

  const text = await response.text()
  if (!response.ok) {
    throw new AiRequestError(describeStatus(response.status, text, model), response.status)
  }

  try {
    return JSON.parse(text) as Record<string, unknown>
  } catch {
    throw new AiRequestError(
      `The ${label} replied with something that is not JSON, so this is not a completions endpoint. Check the base URL.`,
    )
  }
}

const asRecord = (value: unknown): Record<string, unknown> | null =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null

/** Text out of whichever shape the provider chose, or an honest failure. */
function requireText(value: unknown, model: string): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new AiRequestError(
      `“${model}” replied with an empty body. Nothing was restructured, so nothing was saved.`,
      null,
    )
  }
  return value
}

async function generateWithGemini(
  settings: AiSettings,
  prompt: AiPrompt,
  signal: AbortSignal,
): Promise<string> {
  const url = assertHttpUrl(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(settings.model)}:generateContent`,
    'Gemini endpoint',
  )

  const data = await post(
    url,
    { 'x-goog-api-key': settings.apiKey },
    {
      systemInstruction: { parts: [{ text: prompt.system }] },
      contents: [{ role: 'user', parts: [{ text: prompt.user }] }],
    },
    signal,
    'Gemini',
    settings.model,
  )

  const candidates = Array.isArray(data.candidates) ? data.candidates : []
  const first = asRecord(candidates[0])
  if (!first) {
    const blocked = asRecord(data.promptFeedback)
    throw new AiRequestError(
      `Gemini returned no candidates for “${settings.model}”. ${
        blocked ? `It gave a reason in promptFeedback, which usually means the request itself was declined.` : ''
      }`,
    )
  }

  const parts = asRecord(first.content)?.parts
  const text = (Array.isArray(parts) ? parts : [])
    .map((part) => asRecord(part)?.text)
    .filter((value): value is string => typeof value === 'string')
    .join('')

  return requireText(text, settings.model)
}

async function generateWithOpenAiCompatible(
  settings: AiSettings,
  prompt: AiPrompt,
  signal: AbortSignal,
): Promise<string> {
  const url = assertHttpUrl(
    `${settings.baseUrl.replace(/\/$/, '')}/chat/completions`,
    'chat completions endpoint',
  )

  const data = await post(
    url,
    { Authorization: `Bearer ${settings.apiKey}` },
    {
      model: settings.model,
      messages: [
        { role: 'system', content: prompt.system },
        { role: 'user', content: prompt.user },
      ],
    },
    signal,
    'chat completions',
    settings.model,
  )

  const choices = Array.isArray(data.choices) ? data.choices : []
  const first = asRecord(choices[0])
  if (!first) throw new AiRequestError(`The endpoint returned no choices for “${settings.model}”.`)

  return requireText(asRecord(first.message)?.content, settings.model)
}

/**
 * One request, one answer, in Markdown. The caller decides what the
 * prompt asked for and what an answer is worth; this only moves the text and
 * explains a failure. `signal` is the user's Cancel button.
 */
export async function generateMarkdown(
  settings: AiSettings,
  prompt: AiPrompt,
  signal: AbortSignal,
): Promise<string> {
  if (signal.aborted) throw new AiCancelledError()
  if (settings.apiKey.trim() === '') {
    throw new AiRequestError('No API key is saved in this browser, so nothing was sent.')
  }
  if (settings.model.trim() === '') {
    throw new AiRequestError('No model name is set, so there is nothing to ask.')
  }

  return settings.provider === 'gemini'
    ? generateWithGemini(settings, prompt, signal)
    : generateWithOpenAiCompatible(settings, prompt, signal)
}
