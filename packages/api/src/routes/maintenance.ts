import { Elysia, t } from 'elysia'
import { authPlugin, requireAdmin, type User } from '../lib/auth'
import {
  applyFix,
  dismissSuggestion,
  getConfig,
  listRuns,
  listSuggestions,
  previewFix,
  runMaintenance,
  snoozeSuggestion,
  updateConfig,
} from '../lib/maintenance'
import { ok } from '../lib/response'
import { idParam } from '../lib/schemas'

// Admin-only: control the scheduled maintenance agent and triage its suggestions.
// The agent never edits a page on its own — apply is a reviewed diff (preview →
// apply). See specs/maintenance.md.
function actor(user: User): string {
  return user?.email ?? 'admin'
}

const maintenanceRoutes = new Elysia({ prefix: '/api/maintenance' })
  .use(authPlugin)
  .onBeforeHandle(({ user }) => requireAdmin(user))

  // ── Config (singleton, admin-tunable at runtime) ─────────────────────────────
  .get('/config', () => ok(getConfig()))
  .put(
    '/config',
    ({ body }) => ok(updateConfig(body)),
    {
      body: t.Object({
        enabled: t.Optional(t.Boolean()),
        intervalHours: t.Optional(t.Integer({ minimum: 1, maximum: 24 * 30 })),
        staleDays: t.Optional(t.Integer({ minimum: 1, maximum: 3650 })),
        maxDocsPerRun: t.Optional(t.Integer({ minimum: 1, maximum: 5000 })),
        maxSuggestions: t.Optional(t.Integer({ minimum: 1, maximum: 5000 })),
        llmModel: t.Optional(t.Union([t.String({ maxLength: 200 }), t.Null()])),
        scopeDepts: t.Optional(t.Array(t.String({ maxLength: 60 }))),
        checks: t.Optional(t.Array(t.String({ maxLength: 40 }))),
      }),
    },
  )

  // ── Runs ─────────────────────────────────────────────────────────────────────
  .get('/runs', ({ query }) => ok(listRuns(query.limit ? Number(query.limit) : 20)), {
    query: t.Object({ limit: t.Optional(t.Numeric()) }),
  })
  .post('/run', async () => ok(await runMaintenance('manual')), { body: t.Object({}) })

  // ── Suggestions ──────────────────────────────────────────────────────────────
  .get(
    '/suggestions',
    ({ query }) => ok(listSuggestions({ status: query.status, dept: query.dept })),
    {
      query: t.Object({
        status: t.Optional(t.String({ maxLength: 20 })),
        dept: t.Optional(t.String({ maxLength: 60 })),
      }),
    },
  )
  .post('/suggestions/:id/preview', async ({ params }) => ok(await previewFix(params.id)), {
    params: idParam,
    body: t.Object({}),
  })
  .post(
    '/suggestions/:id/apply',
    ({ params, body, user }) => ok(applyFix(params.id, body.content, body.version, actor(user))),
    {
      params: idParam,
      body: t.Object({ content: t.String(), version: t.String() }),
    },
  )
  .post(
    '/suggestions/:id/dismiss',
    ({ params, user }) => ok(dismissSuggestion(params.id, actor(user))),
    { params: idParam, body: t.Object({}) },
  )
  .post(
    '/suggestions/:id/snooze',
    ({ params, body, user }) => ok(snoozeSuggestion(params.id, body.days ?? 30, actor(user))),
    {
      params: idParam,
      body: t.Object({ days: t.Optional(t.Integer({ minimum: 1, maximum: 365 })) }),
    },
  )

export default maintenanceRoutes
