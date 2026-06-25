import { sql } from 'drizzle-orm'
import { integer, primaryKey, sqliteTable, text } from 'drizzle-orm/sqlite-core'


// ── TrueNote tables ────────────────────────────────────────────────────────
// Note: wiki DOCUMENTS are NOT here — they live as `.md` files on disk (see
// lib/docstore.ts + PROJECT_BRIEF.md §4). SQLite holds only non-note data:
// user accounts/sessions and Assistant chat history. Deleting the DB never
// loses a note.

// Per-user accounts (auth Mode C). Provider-agnostic: keyed by email, with
// externalId for OIDC (Entra `oid`). The dev provider upserts on first login.
export const users = sqliteTable('users', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  email: text('email').notNull().unique(),
  name: text('name').notNull(),
  externalId: text('external_id'), // OIDC subject/oid; null for dev users
  passwordHash: text('password_hash'), // argon2id (Bun.password); null for dev/entra users
  role: text('role').notNull().default('member'), // 'admin' | 'member'
  createdAt: text('created_at')
    .notNull()
    .default(sql`(current_timestamp)`),
})

// Departments = access-controlled top-level wiki folders. `key` is the folder
// name (kebab). Pages outside any registered department are shared to all members.
export const departments = sqliteTable('departments', {
  key: text('key').primaryKey(),
  label: text('label').notNull(),
  createdAt: text('created_at')
    .notNull()
    .default(sql`(current_timestamp)`),
})

// Which departments a member may access (admins see all, so they need no rows).
export const userDepartments = sqliteTable(
  'user_departments',
  {
    userId: integer('user_id')
      .notNull()
      .references(() => users.id),
    deptKey: text('dept_key')
      .notNull()
      .references(() => departments.key),
  },
  (t) => ({ pk: primaryKey({ columns: [t.userId, t.deptKey] }) }),
)

// Opaque cookie session ids → user. Server-side so they can expire/revoke.
export const sessions = sqliteTable('sessions', {
  id: text('id').primaryKey(), // random token, also the cookie value
  userId: integer('user_id')
    .notNull()
    .references(() => users.id),
  expiresAt: text('expires_at').notNull(),
  createdAt: text('created_at')
    .notNull()
    .default(sql`(current_timestamp)`),
})

// Note: Assistant chat history is intentionally NOT stored server-side — it
// lives client-side (localStorage) and is sent with each request. See
// routes/assistant.ts + components/assistant/AssistantPanel.tsx.

// LLM provider profiles (managed in the Settings dialog). Multiple named
// providers; exactly one is the default the Assistant uses. apiKey is a secret
// and is NEVER returned to the client (see lib/providers.ts redactProvider).
// Leaves room for future per-task routing (a task → providerId mapping).
export const llmProviders = sqliteTable('llm_providers', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(), // label, e.g. "Claude" / "Local Ollama"
  kind: text('kind').notNull(), // 'anthropic' | 'openai'
  model: text('model').notNull(), // the selected/active model for this source
  baseUrl: text('base_url'), // optional override (OpenAI-compatible / Ollama)
  apiKey: text('api_key'), // secret
  availableModels: text('available_models'), // JSON string[] discovered from the provider
  isDefault: integer('is_default', { mode: 'boolean' }).notNull().default(false),
  createdAt: text('created_at')
    .notNull()
    .default(sql`(current_timestamp)`),
})

// ── Scheduled maintenance agent ──────────────────────────────────────────────
// A periodic, admin-controlled pass that scans the wiki (.md files on disk) for
// health problems + drift and files `suggestions`. Config is a singleton row so
// admins can tune it at runtime (Settings → Maintenance). Like chat history,
// wiki CONTENT still lives on disk — only the findings/bookkeeping are in SQLite.
export const maintenanceConfig = sqliteTable('maintenance_config', {
  id: integer('id').primaryKey(), // singleton: always 1
  enabled: integer('enabled', { mode: 'boolean' }).notNull().default(false),
  intervalHours: integer('interval_hours').notNull().default(24),
  staleDays: integer('stale_days').notNull().default(180),
  maxDocsPerRun: integer('max_docs_per_run').notNull().default(200),
  maxSuggestions: integer('max_suggestions').notNull().default(100),
  llmModel: text('llm_model'), // override; null = the active provider's model
  scopeDepts: text('scope_depts'), // JSON string[] of dept keys; null/[] = all
  checks: text('checks'), // JSON string[] of enabled check keys; null = all
  updatedAt: text('updated_at')
    .notNull()
    .default(sql`(current_timestamp)`),
})

// One row per maintenance pass (bookkeeping; serialized — never overlapping).
export const maintenanceRuns = sqliteTable('maintenance_runs', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  trigger: text('trigger').notNull(), // 'schedule' | 'manual'
  status: text('status').notNull(), // 'running' | 'ok' | 'error' | 'skipped'
  startedAt: text('started_at')
    .notNull()
    .default(sql`(current_timestamp)`),
  finishedAt: text('finished_at'),
  scanned: integer('scanned').notNull().default(0),
  found: integer('found').notNull().default(0), // NEW suggestions filed (post-dedup)
  error: text('error'),
})

// A filed maintenance finding an admin reviews. `fingerprint` makes dismissals
// stick: a re-run won't re-file a finding whose fingerprint is already open/
// dismissed/snoozed. `check` is stored in the non-reserved column `check_type`.
export const suggestions = sqliteTable('suggestions', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  runId: integer('run_id'),
  check: text('check_type').notNull(), // broken-link|orphan|stale|stub|naming|llm-quality
  kind: text('kind').notNull(), // 'content' (apply via reviewed diff) | 'advisory'
  confidence: text('confidence').notNull(), // 'high' | 'medium' | 'low'
  title: text('title').notNull(),
  detail: text('detail').notNull(),
  path: text('path').notNull(), // primary affected page (relative)
  department: text('department'),
  evidence: text('evidence'),
  fingerprint: text('fingerprint').notNull(),
  status: text('status').notNull().default('open'), // open|applied|dismissed|snoozed
  snoozedUntil: text('snoozed_until'),
  resolvedBy: text('resolved_by'),
  createdAt: text('created_at')
    .notNull()
    .default(sql`(current_timestamp)`),
  resolvedAt: text('resolved_at'),
})

export type User = typeof users.$inferSelect
export type Session = typeof sessions.$inferSelect
export type Department = typeof departments.$inferSelect
export type LlmProvider = typeof llmProviders.$inferSelect
export type MaintenanceConfig = typeof maintenanceConfig.$inferSelect
export type MaintenanceRun = typeof maintenanceRuns.$inferSelect
export type Suggestion = typeof suggestions.$inferSelect
