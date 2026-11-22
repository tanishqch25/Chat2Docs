/**
 * Bring-your-own-key settings, held in this browser and nowhere else.
 *
 * The key is a credential the user lent to this tab, so its storage is the
 * one place the browser lets them see and wipe: `localStorage`, under a name
 * that says what it is. It is deliberately absent from `PromptPaperDB` —
 * documents and credentials have different lifetimes, and a document is
 * something a user exports and hands on. `serialiseBackup` is written to take
 * the document records and nothing else, which is why a library backup never
 * carries a key; that is asserted in the Milestone 6 verification pass.
 *
 * Reading and writing go through here so no component ever touches
 * `localStorage` directly, and a value hand-edited into storage cannot reach
 * a fetch unvalidated.
 */

export type AiProvider = 'gemini' | 'openai_compatible'

export interface AiSettings {
  provider: AiProvider
  apiKey: string
  model: string
  /** Only read by the OpenAI-compatible adapter. */
  baseUrl: string
}

export const AI_SETTINGS_KEY = 'promptpaper.ai.settings.v1'

export const AI_PROVIDER_LABEL: Record<AiProvider, string> = {
  gemini: 'Google Gemini',
  openai_compatible: 'OpenAI-compatible',
}

export const DEFAULT_MODEL: Record<AiProvider, string> = {
  gemini: 'gemini-2.5-flash',
  openai_compatible: 'gpt-4o-mini',
}

export const DEFAULT_BASE_URL = 'https://api.openai.com/v1'

/** The shape a first visit shows. `apiKey` empty means nothing was ever
 *  entered, which is different from a saved blank — the page says so. */
export const BLANK_SETTINGS: AiSettings = {
  provider: 'gemini',
  apiKey: '',
  model: DEFAULT_MODEL.gemini,
  baseUrl: DEFAULT_BASE_URL,
}

const PROVIDERS: readonly AiProvider[] = ['gemini', 'openai_compatible']

const isString = (value: unknown): value is string => typeof value === 'string'

/** Storage is a boundary: it can be missing, unreadable or edited by hand.
 *  Any of that resolves to the blank settings rather than an exception that
 *  reaches render, and never to a half-trusted record. */
function read(): Record<string, unknown> | null {
  try {
    const raw = localStorage.getItem(AI_SETTINGS_KEY)
    if (raw === null) return null
    const parsed: unknown = JSON.parse(raw)
    return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null
  } catch {
    return null
  }
}

export function loadAiSettings(): AiSettings {
  const stored = read()
  if (!stored) return { ...BLANK_SETTINGS }

  const provider = PROVIDERS.includes(stored.provider as AiProvider)
    ? (stored.provider as AiProvider)
    : BLANK_SETTINGS.provider
  const model = isString(stored.model) && stored.model.trim() !== '' ? stored.model : DEFAULT_MODEL[provider]
  const baseUrl = isString(stored.baseUrl) && stored.baseUrl.trim() !== '' ? stored.baseUrl : DEFAULT_BASE_URL

  return {
    provider,
    model,
    baseUrl,
    // A key that is not a string is not a key: forget it rather than send
    // something the provider will reject in the user's name.
    apiKey: isString(stored.apiKey) ? stored.apiKey : '',
  }
}

export function saveAiSettings(settings: AiSettings): void {
  try {
    localStorage.setItem(AI_SETTINGS_KEY, JSON.stringify(settings))
  } catch {
    throw new Error(
      'This browser would not keep the key. Private windows and blocked site storage do that — try again in a normal window.',
    )
  }
}

export function clearAiSettings(): void {
  try {
    localStorage.removeItem(AI_SETTINGS_KEY)
  } catch {
    // Nothing to clear if the browser will not let us reach storage, which is
    // also nothing leaked. The page reports the state it asked for.
  }
}

/** True only when a key has actually been typed. Every AI call checks this
 *  first: a request is never made on the user's behalf without a key they
 *  provided and a Generate they pressed. */
export function hasConfiguredAiKey(): boolean {
  return loadAiSettings().apiKey.trim().length > 0
}
