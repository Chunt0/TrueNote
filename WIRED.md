# WIRED.md — what's already built

One-page index of every wired capability. If it's here, don't rebuild it.

## API (`packages/api/src`)

| Capability | File |
|------------|------|
| Entry point + graceful shutdown | `index.ts` |
| Plugin chain, health, swagger, static SPA + fallback, global `onError`, security headers | `app.ts` |
| Auto-typed API surface for the client (`export type App`) | `app.ts` |
| Route registration (single barrel) | `routes/index.ts` |
| Fail-fast env validation | `lib/env.ts` |
| Auth gate (Mode C sessions + service bearer fallback) + `requireAdmin` | `lib/auth.ts` |
| Sessions + users (cookie, upsert, role, `ADMIN_EMAILS` promotion) | `lib/session.ts` |
| Department access control (member scoping, admin/service = all) | `lib/access.ts` |
| Admin API (users: role + departments; department registry CRUD) | `routes/admin.ts` |
| Auth provider endpoints (dev login/logout; Entra stub) | `routes/auth.ts` |
| Wiki file store — `.md` on disk: path safety, atomic writes, OCC, git, fuzzy search, history/restore, trash, backlinks | `lib/docstore.ts` |
| Wiki doc API (CRUD + search + history/diff/restore + trash + backlinks) | `routes/docs.ts` |
| LLM provider seam (Claude + OpenAI-compatible, via fetch) | `lib/llm.ts` |
| Wiki agent (bounded tool loop over the file store) | `lib/agent.ts` |
| Assistant chat API (stateless; client supplies history) | `routes/assistant.ts` |
| LLM provider profiles — CRUD + active resolution (keys redacted) | `routes/providers.ts`, `lib/providers.ts` |
| Correlation IDs (X-Request-ID), set in `onRequest` | `app.ts` |
| Response envelope `ok()` / `errorResponse()` | `lib/response.ts` |
| Typed errors (`AppError` + subclasses) | `lib/errors.ts` |
| Pagination helpers | `lib/pagination.ts` |
| Reusable `t` validators | `lib/schemas.ts` |
| Pino logging → stdout (see `docs/LOGGING.md`) | `lib/logger.ts` |
| DB singleton (WAL, FK, busy timeout) | `db/index.ts` |
| Migration runner (auto on boot) | `db/migrate.ts` |
| Idempotent seed | `db/seed.ts` |
| Health endpoint `/api/health` (public) | `app.ts` |
| Whoami `/api/me` (protected) | `app.ts` |
| Test harness (in-memory DB) | `tests/setup.ts`, `tests/helpers.ts` |

## Frontend (`packages/frontend/src`)

| Capability | File |
|------------|------|
| Entry + providers + auth gate | `main.tsx`, `App.tsx` |
| Eden Treaty client (type-safe, cookie session) + `unwrap()` | `lib/api.ts` |
| Auth hooks (me / dev login / logout / `useIsAdmin`) | `hooks/use-auth.ts` |
| Admin hooks (users + departments) | `hooks/use-admin.ts` |
| Wiki data hooks (list/read/search/CRUD) | `hooks/use-docs.ts` |
| Dockable Assistant panel (chat + page-context bar) + hook | `components/assistant/`, `hooks/use-assistant.ts` |
| Settings (registry-driven sections; `adminOnly` hidden from members: providers/team/appearance/account/about) | `components/SettingsDialog.tsx`, `components/settings/` |
| Provider hooks | `hooks/use-providers.ts` |
| Wiki page (two-pane: section tree + rendered/edit) | `pages/WikiPage.tsx` |
| Wiki components (OneNote-style tree, page view/edit pane) | `components/wiki/` |
| Markdown renderer (marked + dompurify, sanitized) | `components/MarkdownView.tsx` |
| Login page | `pages/LoginPage.tsx` |
| TanStack Query client | `lib/query-client.ts` |
| `cn()` + `focusRing` | `lib/utils.ts` |
| Route manifest (single source: router + sidebar) | `routes.manifest.ts` |
| Router (built from manifest) | `router.tsx` |
| UI primitives (Radix + CVA) | `components/ui/` |
| Feedback states (Loading / Empty / Error) | `components/feedback/` |
| Patterns (DataTable / FormDialog / ConfirmDialog) | `components/patterns/` |
| Layout — sidebar owns nav (wiki tree) + user/settings/logout; no top bar | `components/layout/` |
| Error boundary | `components/ErrorBoundary.tsx` |
| Standard pages (Home / NotFound / RouteError) | `pages/` |

## Infra & tooling

| Capability | File |
|------------|------|
| Single multi-stage image (SPA + API) | `Dockerfile` |
| One service, volume, port | `docker-compose.yml` |
| Pre-commit hooks | `.lefthook.yml` |
| Bootstrap | `scripts/init-project.sh` |
| Dev launcher (parallel API + Vite) | `scripts/dev.sh` |
| Backup / restore | `scripts/backup.sh`, `scripts/restore.sh` |
| Reference check / eject | `scripts/check-reference.sh`, `scripts/eject-reference.sh` |
| Playwright E2E (built SPA + API, headless) — `bun run e2e` | `playwright.config.ts`, `e2e/` |
