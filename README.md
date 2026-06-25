# TrueNote

**An in-house wiki for an IT department.** Markdown pages are stored as plain
**files on disk** (git-versioned), edited collaboratively in the browser with
per-user attribution, and reachable by a built-in **LLM assistant** that works on
the same files through a small, fixed set of tools.

> **One Bun process** serves the Elysia API **and** the React SPA — same-origin,
> no CORS, no nginx. Type-safe end to end with **zero codegen**. SQLite holds only
> non-note data; the wiki itself is `.md` files. One Docker image, one
> `docker compose up`.

`Bun` · `Elysia` · `React 19` · `SQLite + Drizzle` · `Tailwind v4` · `git` · `Docker`

Built ~20 users, single internal team, behind the company network/VPN.

---

## What it does

- **File-backed wiki.** Every page is a real `.md` file under `DOCS_DIR`; folders
  are sections. The path *is* the page's identity, so the wiki is navigable and
  editable in the app, in an editor, in git, or in Obsidian. SQLite never stores
  note content — **deleting the DB never loses a page.**
- **Browser editing with safe concurrency.** Open → click-to-edit → save. Saves
  are atomic and guarded by an optimistic-concurrency version token (a stale save
  gets a **409** + reload prompt, never a silent overwrite).
- **git-backed history.** `DOCS_DIR` is a git repo; every save is a commit
  **authored as the signed-in user**. Per-page history + diff + one-click restore.
- **Wikilinks & search.** `[[page]]` links + backlinks, and fast token search over
  filenames *and* content with typo tolerance + highlighting.
- **LLM assistant.** A dockable chat panel where an agent searches/reads/creates/
  edits pages through a fixed tool set (confined to `DOCS_DIR`, OCC-respecting,
  git-committed). Provider-pluggable: Claude or any OpenAI-compatible endpoint
  (incl. local Ollama). Chat history is **client-side only** (localStorage).
- **Roles & department access.** `admin` / `member`; a **department** is a
  registered top-level folder. Members see only their granted departments plus
  shared (root) pages; admins and the service token see everything.
- **Scheduled maintenance agent (admin, off by default).** Periodically scans for
  health problems (broken links, orphans, stale/stub pages, naming) and drift, and
  files suggestions an admin reviews. It never edits a page on its own — every fix
  is an admin-reviewed diff.
- **Audit log (admin).** The full git change history — who/what/when with commit
  hashes — fully searchable and traceable to each page.
- **Mobile-friendly.** Responsive: the nav becomes a drawer, the assistant a
  full-screen overlay, dialogs stack.

## Auth — Mode C (per-user login), pluggable provider

One auth seam, env-selected provider (`AUTH_MODE`), so dev is frictionless and
production is Microsoft Entra with no rearchitecture:

- **`dev` (now, local only).** Passwordless pick-a-user login. **Refuses to run
  under `NODE_ENV=production`** so it can never ship by accident.
- **`entra` (production, planned).** Microsoft Entra ID OIDC — see the `entra`
  branch. Slots in as another provider: same sessions, same `users` table, same
  attribution.
- **Service bearer token** (`AUTH_TOKEN`) for programmatic/system use; counts as
  admin. The SPA uses signed-cookie sessions (no token in the bundle).
- **Admins** are bootstrapped via `ADMIN_EMAILS` (comma-separated; promoted on
  login). Later this maps to Entra groups.

## Quickstart

```bash
scripts/init-project.sh "TrueNote"   # writes .env (token + name), installs, migrates, seeds

bun run dev                          # API :4000 + Vite :3000 (HMR)
# …or the containerized stack, mirroring production:
docker compose up -d --build         # http://localhost:3000
```

Then set yourself up as an admin: add `ADMIN_EMAILS=you@corp.example` to `.env`,
restart, and sign in with that email.

## Everyday commands

```bash
bun run check        # type-check + lint + test — the gate
bun run dev          # local dev with HMR (API :4000 + Vite :3000)
bun run e2e          # Playwright against the built SPA + API
bun run db:generate  # after editing packages/api/src/db/schema.ts
bun run db:migrate   # apply migrations (also runs on API boot)
bun run db:seed      # idempotent
./scripts/backup.sh  # gzipped SQLite snapshot (cron-friendly)
```

## Project map

| Path | What |
|------|------|
| `packages/api` | Bun + Elysia API; serves the SPA in production; owns the wiki file store + git |
| `packages/frontend` | React SPA (wiki, assistant, admin pages) |
| `data/wiki` | the wiki's `.md` files (git repo) — gitignored, the source of truth |
| `CLAUDE.md` | **Start here to build** — build sequence + enforced conventions |
| `PROJECT_BRIEF.md` | the project's one-page *what* |
| `specs/` | feature-spec workflow (template, worked example `maintenance.md`, the method) |
| `docs/ARCHITECTURE.md` | topology, decisions, auth, env, deploy, escape hatches |
| `docs/DESIGN_SYSTEM.md` | UI primitives + page archetypes |
| `WIRED.md` | one-page index of every wired capability |
| `GOTCHAS.md` | the sharp edges (skim on clone) |

## Deploying & exposing

`docker compose up -d --build` runs everything on `:3000`. Data lives in the
repo's **`./data`** (bind-mounted): the SQLite DB at `./data/app.db` and the wiki
as real `.md` files at `./data/wiki` — the same files `bun run dev` uses, so you
can browse/edit them on disk or in git. (Run dev *or* Docker, not both at once —
they share that DB + wiki repo.) Logs go to stdout. To reach it from other
devices, put Tailscale / Caddy / Cloudflare Tunnel in front — and **run the
pre-expose checklist** in `docs/ARCHITECTURE.md` (auth tested, secrets out of git,
Swagger off, `AUTH_MODE` not `dev` in production, a backup restored) first.
