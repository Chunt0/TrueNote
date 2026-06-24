import { asc, eq, sql } from 'drizzle-orm'
import { Elysia, t } from 'elysia'
import { db } from '../db'
import { llmProviders } from '../db/schema'
import { authPlugin } from '../lib/auth'
import { NotFoundError } from '../lib/errors'
import { detectModels, redactProvider } from '../lib/providers'
import { ok } from '../lib/response'
import { idParam } from '../lib/schemas'

const kindSchema = t.Union([t.Literal('anthropic'), t.Literal('openai')])

// Manage LLM provider profiles (the Settings dialog). API keys are accepted on
// write but NEVER returned — reads expose only `hasKey`. Gated by authPlugin
// (any authenticated identity, incl. the service token); admin-gating is a
// future, role-based concern.
const providerBody = t.Object({
  name: t.String({ minLength: 1, maxLength: 80 }),
  kind: kindSchema,
  model: t.String({ minLength: 1, maxLength: 120 }),
  baseUrl: t.Optional(t.String({ maxLength: 300 })),
  apiKey: t.Optional(t.String({ maxLength: 400 })),
  availableModels: t.Optional(t.Array(t.String({ maxLength: 160 }))),
  isDefault: t.Optional(t.Boolean()),
})

function clearDefaults() {
  db.update(llmProviders).set({ isDefault: false }).run()
}

const providersRoutes = new Elysia({ prefix: '/api/providers' })
  .use(authPlugin)
  .get('/', () => {
    const rows = db.select().from(llmProviders).orderBy(asc(llmProviders.id)).all()
    return ok(rows.map(redactProvider))
  })
  // Probe a provider's "list models" endpoint. Uses the supplied key, or (when
  // an id is given and no key supplied) the stored key — so it works both while
  // adding a new provider and when refreshing a saved one.
  .post(
    '/detect',
    async ({ body }) => {
      let apiKey = body.apiKey
      if (!apiKey && body.id) {
        apiKey = db.select().from(llmProviders).where(eq(llmProviders.id, body.id)).get()?.apiKey ?? undefined
      }
      const models = await detectModels(body.kind, body.baseUrl, apiKey)
      return ok({ models })
    },
    {
      body: t.Object({
        kind: kindSchema,
        baseUrl: t.Optional(t.String({ maxLength: 300 })),
        apiKey: t.Optional(t.String({ maxLength: 400 })),
        id: t.Optional(t.Number()),
      }),
    },
  )
  .post(
    '/',
    ({ body }) => {
      const count = db.select({ c: sql<number>`count(*)` }).from(llmProviders).get()?.c ?? 0
      const makeDefault = body.isDefault || count === 0
      if (makeDefault) clearDefaults()
      const created = db
        .insert(llmProviders)
        .values({
          name: body.name,
          kind: body.kind,
          model: body.model,
          baseUrl: body.baseUrl || null,
          apiKey: body.apiKey || null,
          availableModels: body.availableModels ? JSON.stringify(body.availableModels) : null,
          isDefault: makeDefault,
        })
        .returning()
        .get()
      return ok(redactProvider(created))
    },
    { body: providerBody },
  )
  .put(
    '/:id',
    ({ params, body }) => {
      const existing = db.select().from(llmProviders).where(eq(llmProviders.id, params.id)).get()
      if (!existing) throw new NotFoundError('Provider not found')
      if (body.isDefault) clearDefaults()
      const updated = db
        .update(llmProviders)
        .set({
          name: body.name,
          kind: body.kind,
          model: body.model,
          baseUrl: body.baseUrl || null,
          // Only replace the key when a new one is supplied; blank keeps current.
          apiKey: body.apiKey ? body.apiKey : existing.apiKey,
          availableModels: body.availableModels
            ? JSON.stringify(body.availableModels)
            : existing.availableModels,
          isDefault: body.isDefault ?? existing.isDefault,
        })
        .where(eq(llmProviders.id, params.id))
        .returning()
        .get()
      return ok(redactProvider(updated))
    },
    { params: idParam, body: providerBody },
  )
  .post(
    '/:id/default',
    ({ params }) => {
      const existing = db.select().from(llmProviders).where(eq(llmProviders.id, params.id)).get()
      if (!existing) throw new NotFoundError('Provider not found')
      clearDefaults()
      db.update(llmProviders).set({ isDefault: true }).where(eq(llmProviders.id, params.id)).run()
      return ok({ id: params.id, isDefault: true })
    },
    { params: idParam },
  )
  .delete(
    '/:id',
    ({ params }) => {
      const existing = db.select().from(llmProviders).where(eq(llmProviders.id, params.id)).get()
      if (!existing) throw new NotFoundError('Provider not found')
      db.delete(llmProviders).where(eq(llmProviders.id, params.id)).run()
      // If we removed the default, promote the next remaining provider.
      if (existing.isDefault) {
        const next = db.select().from(llmProviders).orderBy(asc(llmProviders.id)).get()
        if (next) db.update(llmProviders).set({ isDefault: true }).where(eq(llmProviders.id, next.id)).run()
      }
      return ok({ id: params.id, deleted: true })
    },
    { params: idParam },
  )

export default providersRoutes
