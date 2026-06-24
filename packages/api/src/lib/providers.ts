// Resolve which LLM provider the agent should use, and redact secrets for the
// client. Provider profiles live in the llm_providers table (managed in the
// Settings dialog). If none are configured we fall back to env vars so the
// Assistant keeps working out of the box.
import { asc, eq } from 'drizzle-orm'
import { db } from '../db'
import { type LlmProvider, llmProviders } from '../db/schema'
import { env } from './env'
import type { ProviderConfig } from './llm'

/** The provider config the agent runs with: the DB default, else env fallback. */
export function resolveActiveProvider(): ProviderConfig {
  const def = db.select().from(llmProviders).where(eq(llmProviders.isDefault, true)).get()
  const row = def ?? db.select().from(llmProviders).orderBy(asc(llmProviders.id)).get()
  if (row) {
    return {
      kind: row.kind === 'openai' ? 'openai' : 'anthropic',
      model: row.model,
      baseUrl: row.baseUrl,
      apiKey: row.apiKey,
    }
  }
  // No saved providers yet — fall back to env (back-compat / zero-config).
  return {
    kind: env.LLM_PROVIDER === 'openai' ? 'openai' : 'anthropic',
    model: env.LLM_MODEL,
    baseUrl: env.LLM_BASE_URL ?? null,
    apiKey: (env.LLM_PROVIDER === 'openai' ? env.OPENAI_API_KEY : env.ANTHROPIC_API_KEY) ?? null,
  }
}

/** Client-safe shape — the API key is replaced with a boolean. */
export interface PublicProvider {
  id: number
  name: string
  kind: string
  model: string
  baseUrl: string | null
  isDefault: boolean
  hasKey: boolean
  availableModels: string[]
}

export function redactProvider(p: LlmProvider): PublicProvider {
  let availableModels: string[] = []
  if (p.availableModels) {
    try {
      availableModels = JSON.parse(p.availableModels) as string[]
    } catch {
      availableModels = []
    }
  }
  return {
    id: p.id,
    name: p.name,
    kind: p.kind,
    model: p.model,
    baseUrl: p.baseUrl,
    isDefault: p.isDefault,
    hasKey: !!p.apiKey,
    availableModels,
  }
}

// ── Model discovery ──────────────────────────────────────────────────────────
// Query a provider's "list models" endpoint. Mirrors the Odysseus probe:
//   - Anthropic: GET {base}/v1/models (x-api-key), fall back to a known list.
//   - OpenAI-compatible: GET {base}/models (OpenAI shape), else Ollama /api/tags.
const ANTHROPIC_FALLBACK = [
  'claude-opus-4-8',
  'claude-sonnet-4-6',
  'claude-haiku-4-5-20251001',
]

async function fetchJson(url: string, headers: Record<string, string>): Promise<unknown | null> {
  try {
    const r = await fetch(url, { headers, signal: AbortSignal.timeout(8000) })
    if (!r.ok) return null
    return await r.json()
  } catch {
    return null
  }
}

export async function detectModels(
  kind: string,
  baseUrl: string | null | undefined,
  apiKey: string | null | undefined,
): Promise<string[]> {
  if (kind === 'anthropic') {
    const base = (baseUrl || 'https://api.anthropic.com').replace(/\/+$/, '')
    if (!apiKey) return ANTHROPIC_FALLBACK
    const data = (await fetchJson(`${base}/v1/models`, {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    })) as { data?: Array<{ id?: string }> } | null
    const models = (data?.data ?? []).map((m) => m.id).filter((x): x is string => !!x)
    return models.length ? models : ANTHROPIC_FALLBACK
  }

  // OpenAI-compatible (OpenAI / Ollama / others).
  const base = (baseUrl || 'https://api.openai.com/v1').replace(/\/+$/, '')
  const headers: Record<string, string> = apiKey ? { authorization: `Bearer ${apiKey}` } : {}

  // OpenAI shape: { data: [{ id }] }
  const openai = (await fetchJson(`${base}/models`, headers)) as {
    data?: Array<{ id?: string }>
  } | null
  const fromOpenai = (openai?.data ?? []).map((m) => m.id).filter((x): x is string => !!x)
  if (fromOpenai.length) return fromOpenai

  // Ollama native: { models: [{ name }] } at {root}/api/tags
  const root = base.replace(/\/v1$/, '')
  const ollama = (await fetchJson(`${root}/api/tags`, headers)) as {
    models?: Array<{ name?: string; model?: string }>
  } | null
  return (ollama?.models ?? [])
    .map((m) => m.name ?? m.model)
    .filter((x): x is string => !!x)
}
