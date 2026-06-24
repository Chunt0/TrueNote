import { Elysia, t } from 'elysia'
import { runAgent } from '../lib/agent'
import { authPlugin, requireUser } from '../lib/auth'
import { readDoc } from '../lib/docstore'
import type { ChatMsg } from '../lib/llm'
import { ok } from '../lib/response'

// Stateless Assistant: chat history is NOT stored server-side. The client keeps
// it (localStorage) and sends the prior turns with each request. Requires a real
// signed-in user (git attribution for any edits the agent makes).
const MAX_CONTEXT_DOCS = 10
const MAX_CONTEXT_CHARS = 8000
const HISTORY_LIMIT = 20

// Read the attached pages and build a context block. Skips any that error
// (deleted/renamed since attach) rather than failing the whole request.
function buildContext(paths: string[] | undefined): string {
  if (!paths?.length) return ''
  const parts: string[] = []
  for (const p of paths.slice(0, MAX_CONTEXT_DOCS)) {
    try {
      const doc = readDoc(p)
      parts.push(`## ${doc.path}\n\n${doc.content.slice(0, MAX_CONTEXT_CHARS)}`)
    } catch {
      // ignore missing/invalid attachments
    }
  }
  return parts.join('\n\n---\n\n')
}

const assistantRoutes = new Elysia({ prefix: '/api/assistant' })
  .use(authPlugin)
  .post(
    '/chat',
    async ({ user, body }) => {
      const u = requireUser(user)
      const history: ChatMsg[] = (body.history ?? [])
        .slice(-HISTORY_LIMIT)
        .map((m) => ({ role: m.role, content: m.content }))
      const contextText = buildContext(body.context)
      const turn = await runAgent(history, body.message, { name: u.name, email: u.email }, contextText)
      return ok({ reply: turn.reply, toolActivity: turn.toolActivity })
    },
    {
      body: t.Object({
        message: t.String({ minLength: 1, maxLength: 8000 }),
        // Prior turns, supplied by the client (kept in localStorage).
        history: t.Optional(
          t.Array(
            t.Object({
              role: t.Union([t.Literal('user'), t.Literal('assistant')]),
              content: t.String({ maxLength: 20000 }),
            }),
          ),
        ),
        context: t.Optional(t.Array(t.String({ maxLength: 400 }))),
      }),
    },
  )

export default assistantRoutes
