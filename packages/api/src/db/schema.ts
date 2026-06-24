import { sql } from 'drizzle-orm'
import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'


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
  createdAt: text('created_at')
    .notNull()
    .default(sql`(current_timestamp)`),
})

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

export type User = typeof users.$inferSelect
export type Session = typeof sessions.$inferSelect
export type LlmProvider = typeof llmProviders.$inferSelect
