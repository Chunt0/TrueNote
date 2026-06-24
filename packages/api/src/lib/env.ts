// Fail-fast environment validation. Parsed ONCE at boot; the API exits with a
// clear message if a required var is missing. Nothing else reads process.env.

function required(name: string): string {
  const v = process.env[name]
  if (v === undefined || v === '') {
    console.error(`[env] Missing required environment variable: ${name}`)
    console.error('[env] Copy .env.example to .env and run scripts/init-project.sh.')
    process.exit(1)
  }
  return v
}

function optional(name: string, fallback: string): string {
  const v = process.env[name]
  return v === undefined || v === '' ? fallback : v
}

export const env = {
  /** SQLite file path, or ":memory:" in tests. */
  DATABASE_PATH: required('DATABASE_PATH'),
  /** Shared bearer token — service/programmatic auth + CI (still honored). */
  AUTH_TOKEN: required('AUTH_TOKEN'),
  NODE_ENV: optional('NODE_ENV', 'development'),
  PORT: Number(optional('PORT', '3000')),
  LOG_LEVEL: optional('LOG_LEVEL', 'info'),
  ENABLE_SWAGGER: optional('ENABLE_SWAGGER', 'false') === 'true',
  /** Set in the container to the SPA build dir so the API also serves the SPA. */
  STATIC_DIR: process.env.STATIC_DIR,

  // ── TrueNote: wiki file store ───────────────────────────────────────────
  /** Root directory holding the wiki's `.md` files (source of truth). */
  DOCS_DIR: optional('DOCS_DIR', '../../data/wiki'),
  /** Commit doc changes to git in DOCS_DIR ('on' | 'off'). Best-effort. */
  GIT_VERSIONING: optional('GIT_VERSIONING', 'on') === 'on',

  // ── TrueNote: auth (Mode C, pluggable provider) ─────────────────────────
  /** 'dev' = passwordless pick-a-user (local dev). 'entra' = OIDC (prod). */
  AUTH_MODE: optional('AUTH_MODE', 'dev'),
  /** Session lifetime in hours (cookie + sessions row). */
  SESSION_TTL_HOURS: Number(optional('SESSION_TTL_HOURS', '720')),
  /** Comma-separated emails auto-promoted to admin on login (maps to Entra groups later). */
  ADMIN_EMAILS: optional('ADMIN_EMAILS', ''),

  // ── TrueNote: LLM provider seam ─────────────────────────────────────────
  /** 'anthropic' (Claude) | 'openai' (OpenAI-compatible, incl. Ollama). */
  LLM_PROVIDER: optional('LLM_PROVIDER', 'anthropic'),
  /** Model id sent to the provider. */
  LLM_MODEL: optional('LLM_MODEL', 'claude-sonnet-4-6'),
  /** Base URL override (OpenAI-compatible endpoints / local Ollama). */
  LLM_BASE_URL: process.env.LLM_BASE_URL,
  /** Provider keys — optional; the Assistant errors clearly if its provider's key is unset. */
  ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
  OPENAI_API_KEY: process.env.OPENAI_API_KEY,
} as const

export const isProd = env.NODE_ENV === 'production'
export const isTest = env.NODE_ENV === 'test'

/** Lowercased set of admin emails (parsed from ADMIN_EMAILS). */
export const ADMIN_EMAILS = new Set(
  env.ADMIN_EMAILS.split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean),
)

// Safety latch: passwordless dev auth must never ship to production.
if (env.AUTH_MODE === 'dev' && isProd) {
  console.error('[env] AUTH_MODE=dev is passwordless and refuses to run with NODE_ENV=production.')
  console.error('[env] Set AUTH_MODE=entra (or another real provider) for production.')
  process.exit(1)
}
