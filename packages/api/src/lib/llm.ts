// Pluggable LLM provider seam. One small interface; the agent loop (lib/agent.ts)
// is provider-agnostic. Calls go over HTTP via fetch — no SDK dependency.
//   - 'anthropic' → Claude Messages API
//   - 'openai'    → any OpenAI-compatible endpoint, incl. local Ollama
//     (baseUrl=http://localhost:11434/v1) — covers all three targets.
// Config comes from a ProviderConfig (a saved provider profile or env fallback;
// see lib/providers.ts), never read from env here.
import { BadGatewayError, ServiceUnavailableError } from './errors'

export interface ProviderConfig {
  kind: 'anthropic' | 'openai'
  model: string
  baseUrl?: string | null
  apiKey?: string | null
}

export interface ToolDef {
  name: string
  description: string
  parameters: Record<string, unknown> // JSON Schema
}

export interface ToolCall {
  id: string
  name: string
  args: Record<string, unknown>
}

export interface ChatMsg {
  role: 'user' | 'assistant' | 'tool'
  content: string
  toolCalls?: ToolCall[] // assistant turn requested these
  toolCallId?: string // role 'tool': which call this answers
}

export interface LLMReply {
  text: string
  toolCalls: ToolCall[]
}

export interface LLMClient {
  chat(system: string, messages: ChatMsg[], tools: ToolDef[]): Promise<LLMReply>
}

const MAX_TOKENS = 2048

// ── Anthropic (Claude) ───────────────────────────────────────────────────────
function anthropicClient(cfg: ProviderConfig): LLMClient {
  const key = cfg.apiKey
  if (!key) throw new ServiceUnavailableError('No API key set for the active Claude provider')
  const base = cfg.baseUrl || 'https://api.anthropic.com'

  return {
    async chat(system, messages, tools) {
      // Group consecutive tool results into one user turn (Anthropic requires
      // all tool_results for an assistant turn in the following single message).
      const apiMessages: unknown[] = []
      let pendingResults: unknown[] = []
      const flush = () => {
        if (pendingResults.length) {
          apiMessages.push({ role: 'user', content: pendingResults })
          pendingResults = []
        }
      }
      for (const m of messages) {
        if (m.role === 'tool') {
          pendingResults.push({ type: 'tool_result', tool_use_id: m.toolCallId, content: m.content })
          continue
        }
        flush()
        if (m.role === 'assistant') {
          const content: unknown[] = []
          if (m.content) content.push({ type: 'text', text: m.content })
          for (const tc of m.toolCalls ?? [])
            content.push({ type: 'tool_use', id: tc.id, name: tc.name, input: tc.args })
          apiMessages.push({ role: 'assistant', content })
        } else {
          apiMessages.push({ role: 'user', content: [{ type: 'text', text: m.content }] })
        }
      }
      flush()

      const res = await fetch(`${base}/v1/messages`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-api-key': key,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: cfg.model,
          max_tokens: MAX_TOKENS,
          system,
          messages: apiMessages,
          // Only send tools when there are some (empty arrays upset some APIs).
          ...(tools.length
            ? {
                tools: tools.map((t) => ({
                  name: t.name,
                  description: t.description,
                  input_schema: t.parameters,
                })),
              }
            : {}),
        }),
      })
      if (!res.ok) throw new BadGatewayError(`Anthropic error ${res.status}: ${await res.text()}`)
      const data = (await res.json()) as {
        content: Array<{ type: string; text?: string; id?: string; name?: string; input?: unknown }>
      }
      let text = ''
      const toolCalls: ToolCall[] = []
      for (const block of data.content ?? []) {
        if (block.type === 'text') text += block.text ?? ''
        else if (block.type === 'tool_use')
          toolCalls.push({
            id: block.id!,
            name: block.name!,
            args: (block.input as Record<string, unknown>) ?? {},
          })
      }
      return { text, toolCalls }
    },
  }
}

// ── OpenAI-compatible (OpenAI / Ollama / others) ─────────────────────────────
function openaiClient(cfg: ProviderConfig): LLMClient {
  const base = cfg.baseUrl || 'https://api.openai.com/v1'
  const key = cfg.apiKey // optional for local Ollama

  return {
    async chat(system, messages, tools) {
      const apiMessages: unknown[] = [{ role: 'system', content: system }]
      for (const m of messages) {
        if (m.role === 'tool') {
          apiMessages.push({ role: 'tool', tool_call_id: m.toolCallId, content: m.content })
        } else if (m.role === 'assistant') {
          apiMessages.push({
            // Never null: Ollama rejects `content: <nil>` ("invalid message
            // content type"); an empty string is accepted everywhere.
            role: 'assistant',
            content: m.content || '',
            tool_calls: m.toolCalls?.length
              ? m.toolCalls.map((tc) => ({
                  id: tc.id,
                  type: 'function',
                  function: { name: tc.name, arguments: JSON.stringify(tc.args) },
                }))
              : undefined,
          })
        } else {
          apiMessages.push({ role: 'user', content: m.content })
        }
      }

      const res = await fetch(`${base.replace(/\/$/, '')}/chat/completions`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          ...(key ? { authorization: `Bearer ${key}` } : {}),
        },
        body: JSON.stringify({
          model: cfg.model,
          max_tokens: MAX_TOKENS,
          messages: apiMessages,
          // Only send tools/tool_choice when there are tools — OpenAI 400s on
          // an empty tools array with tool_choice:'auto' (the summary turn).
          ...(tools.length
            ? {
                tools: tools.map((t) => ({
                  type: 'function',
                  function: { name: t.name, description: t.description, parameters: t.parameters },
                })),
                tool_choice: 'auto',
              }
            : {}),
        }),
      })
      if (!res.ok) throw new BadGatewayError(`LLM error ${res.status}: ${await res.text()}`)
      const data = (await res.json()) as {
        choices: Array<{
          message: {
            content: string | null
            // Some local models (e.g. Gemma "thinking" on Ollama) put their
            // output in `reasoning` and leave `content` empty.
            reasoning?: string | null
            tool_calls?: Array<{ id: string; function: { name: string; arguments: string } }>
          }
        }>
      }
      const msg = data.choices?.[0]?.message
      const toolCalls: ToolCall[] = (msg?.tool_calls ?? []).map((tc) => ({
        id: tc.id,
        name: tc.function.name,
        args: safeJson(tc.function.arguments),
      }))
      return { text: msg?.content || msg?.reasoning || '', toolCalls }
    },
  }
}

function safeJson(s: string): Record<string, unknown> {
  try {
    return JSON.parse(s) as Record<string, unknown>
  } catch {
    return {}
  }
}

export function makeClient(cfg: ProviderConfig): LLMClient {
  switch (cfg.kind) {
    case 'anthropic':
      return anthropicClient(cfg)
    case 'openai':
      return openaiClient(cfg)
    default:
      throw new ServiceUnavailableError(`Unknown provider kind "${cfg.kind}"`)
  }
}
