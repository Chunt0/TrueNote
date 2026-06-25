# Architecture

## Topology

```
            ┌───────────────────────────────────────────┐
 browser ─► │  Bun process (the only public surface)     │
  (SPA)     │   • serves the built SPA (@elysiajs/static) │
            │   • /api/* routes (Elysia) + auth + envelope│
            │   • the wiki: .md files on disk + git       │ ◄─ DOCS_DIR (source of truth)
            │   • SQLite via Drizzle (WAL)                │ ◄─ users/sessions/providers/maintenance
            └───────────────────────────────────────────┘
```

One process, one origin, no CORS, no nginx. In production the Bun process serves
the built SPA from `STATIC_DIR` and falls back to `index.html` for client routes;
`/api/*` is handled before the fallback. In dev, Vite serves the SPA on `:3000`
and proxies `/api` to the API on `:4000`.

The wiki's pages are **plain `.md` files under `DOCS_DIR`** (a git repo), not
database rows — the path is the page's identity. SQLite holds only non-note data
(users, sessions, LLM providers, maintenance config/findings). Deleting the DB
loses none of the wiki.

## Key decisions

- **Single gateway.** Serving the SPA from the API process removes a whole
  service (nginx) and gives same-origin for free. If you later add a different-
  runtime service (e.g. Python inference), put it behind this process on a private
  network — see Escape hatches.
- **Eden Treaty, no codegen.** The frontend imports `type { App }` from the API
  package; the full request/response surface is inferred. This is why routes are
  registered in an explicit barrel (`routes/index.ts`), not a runtime glob — a
  glob would erase the static types.
- **Response envelope + typed errors.** Every response is `{ ok, data, meta? }` or
  `{ ok:false, error:{ code, message, requestId } }`. Handlers return `ok(...)` or
  throw an `AppError`; the global `onError` maps it. Correlation IDs (`X-Request-ID`)
  thread through logs and error bodies.
- **SQLite + WAL.** One file, comfortable to ~10 GB. Migrations run on boot;
  the seed is idempotent.
- **Wiki on disk + git.** Pages are `.md` files (`lib/docstore.ts`): atomic
  writes, a content-hash version token for optimistic concurrency (409 on a stale
  save), soft-delete to `.trash/`, and best-effort git commits authored as the
  editing user (history/diff/restore). The LLM agent operates on the *same* store.
- **Auth + access control.** Mode C: per-user sessions (cookie) via a pluggable
  provider, plus a service bearer token. Roles (`admin`/`member`) and
  department-scoped page access enforced centrally in `lib/access.ts`. See below.

## Auth & access (Mode C, shipped)

Two ways in, both resolved in `lib/auth.ts` (cookie wins when both are present):

- **Per-user session (humans).** A signed cookie set by an auth *provider*
  (`AUTH_MODE`): `dev` (passwordless pick-a-user, **refuses to boot under
  `NODE_ENV=production`**) now; `entra` (Microsoft Entra OIDC) planned — see the
  `entra` branch. The provider only differs in *how* a login is established;
  downstream everything is identical (`users`/`sessions` tables, `user` on the
  request context, git authorship `Name <email>`).
- **Service bearer token.** `Authorization: Bearer <AUTH_TOKEN>` → a synthetic
  `service` identity, used for programmatic/CI access. Counts as **admin**.

Non-`/api` paths (the SPA) are public; `/api/auth/*` and `/api/health` are the
public allowlist. Other `/api/*` requires identity (401 otherwise).

**Roles & departments.** `users.role` is `admin` | `member`; admins are
bootstrapped from `ADMIN_EMAILS` (promoted on login). A **department** is a
registered top-level wiki folder (`departments` table); members are granted
departments (`user_departments`). Enforcement lives in `lib/access.ts` and is
applied at every doc read/write, the assistant's agent tools, and admin routes
(`requireAdmin`). Members see only their departments + shared (root) pages; admins
and the service token see all.

## Environment variables

See `.env.example`. Required: `DATABASE_PATH`, `AUTH_TOKEN`, `NODE_ENV`.

| Var | Purpose |
|-----|---------|
| `DOCS_DIR` | wiki `.md` root (default `../../data/wiki`) |
| `GIT_VERSIONING` | `on`/`off` — commit doc changes to git in `DOCS_DIR` |
| `AUTH_MODE` | `dev` (local) / `entra` (prod) auth provider |
| `ADMIN_EMAILS` | comma-separated emails promoted to `admin` on login |
| `SESSION_TTL_HOURS` | session/cookie lifetime (default 720) |
| `LLM_PROVIDER` / `LLM_MODEL` / `LLM_BASE_URL` | assistant provider fallback (DB profiles override) |
| `ANTHROPIC_API_KEY` / `OPENAI_API_KEY` | provider keys (optional) |
| `MAINTENANCE_SCHEDULER` | `on`/`off` master switch for the maintenance timer |
| `ENABLE_SWAGGER` / `LOG_LEVEL` | optional |

Build-time (SPA): `VITE_API_URL` (empty = same-origin), `VITE_APP_NAME` (display
name). `init-project.sh` sets the service token and display name. The `@app/*`
workspace scope is fixed and not renamed.

## Deploy, data, backups

```bash
git clone <repo> myapp && cd myapp
scripts/init-project.sh myapp
docker compose up -d --build          # http://<host>:3000
```

- Data lives in the `app-data` Docker volume (`/data/app.db`). Logs → stdout
  (`docker compose logs -f`).
- `./scripts/backup.sh` writes a gzipped `VACUUM INTO` snapshot to `backups/`
  (cron: `0 3 * * * cd /opt/myapp && ./scripts/backup.sh`). Keep `backups/` on a
  different disk or rclone it off-box.
- `./scripts/restore.sh backups/app-….db.gz` restores. **Test restore monthly.**
- Update: `git pull && docker compose up -d --build` (migrations run on boot).

## Pre-expose checklist

Skip if the app only runs on `localhost`. Run before reaching it from any other
device, and again whenever you change auth or add a dependency. **`bun run
preflight`** runs the mechanizable items below (marked ⚙) and exits non-zero on
any failure; the rest you verify by hand.

- [ ] Auth tested by executing a request: unauthed `/api/...` returns **401**.
- [ ] **`AUTH_MODE` is a real provider, not `dev`** (dev is passwordless and
      refuses to boot under `NODE_ENV=production` — but verify anyway).
- [ ] ⚙ `.env` is not in git, Swagger off, `AUTH_TOKEN` ≥ 32 chars, bundle has no
      stray secrets, `bun audit` clean — `bun run preflight`.
- [ ] `.env` is not in git (`git ls-files | grep -E '(^|/)\.env'` → only `.env.example`).
- [ ] `AUTH_TOKEN` came from `openssl rand -hex 32`, not typed by hand.
- [ ] `ENABLE_SWAGGER=false`.
- [ ] `bun audit` is clean.
- [ ] Reachability is what you intend: Tailscale `serve` / Caddy + real domain +
      auto-TLS / host firewall blocks `3000/tcp` off-LAN. Don't port-forward to
      the open internet.
- [ ] A backup has been restored at least once.
- [ ] Built bundle has no stray secrets — Mode C uses cookies, so the SPA bundle
      carries **no** token (`grep -rE 'AKIA|SECRET|PRIVATE KEY|AUTH_TOKEN'
      packages/frontend/dist/` should be empty).

## Escape hatches (when you outgrow a default)

- **A separate service (Python/ML inference, heavy native compute, any non-Bun
  runtime).** Add it to `docker-compose.yml` on the private network, **publish no
  host port**; the Bun process stays the only public surface and calls it over the
  internal network, reshaping responses into the envelope (map upstream failures
  to `BadGatewayError`/`ServiceUnavailableError`). The SPA never talks to it
  directly — same-origin and the single auth gate are preserved. For long-running
  inference, pair with a `jobs` table (POST → job id → poll/stream).
- **A real IdP.** Mode C + roles/departments are already built; the remaining step
  for production is the `entra` OIDC provider (`jose` + JWKS) — see the `entra`
  branch. It slots into the same session/user model.
- **Outgrow SQLite.** Swap to Drizzle's Postgres driver (`db/index.ts` + config);
  queries port over.
- **A separate service** (Python/ML inference, any non-Bun runtime): add it to
  `docker-compose.yml` on the private network with no host port; the Bun process
  stays the only public surface and calls it internally, reshaping responses into
  the envelope.

Note: scheduled background work already exists — the maintenance agent
(`lib/maintenance.ts`) is a single in-process timer that re-derives "is a run due"
from `maintenance_runs` on each tick (no `jobs` table needed at this scale).
