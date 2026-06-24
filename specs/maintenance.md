# Spec: maintenance (scheduled wiki-maintenance agent)

- **status:** done @ 0f3fedc
- **tests:** packages/api/src/tests/maintenance.test.ts, packages/api/src/tests/checks.test.ts
- **kind:** feature

## Goal

A scheduled, admin-controlled agent that periodically scans the wiki for health
problems and **drift**, files **suggestions**, and lets an admin review them on a
dedicated page — dismissing false positives (which then stay dismissed) or
applying a fix as a **reviewed diff**. It exists to keep a team wiki trustworthy
without a human auditing every page.

Design principle: **precision over coverage.** Cheap deterministic checks form a
zero-false-positive backbone; one scoped LLM check adds semantic drift detection
and is clearly lower-confidence. Nothing is ever written without an admin
approving a diff first.

## Out of scope (v1)

- **Cross-document contradiction / duplicate detection** (needs clustering) —
  deferred to a later iteration.
- **Auto-apply / unattended edits** — every fix is admin-reviewed as a diff. The
  scheduler only ever *files* suggestions; it never edits a page.
- No server-stored chat history, no second datastore, no job-queue dependency
  (the scheduler is a single in-process timer). The runtime config endpoint is a
  deliberate, admin-gated exception to CLAUDE.md → "Don't add".
- Not a general linter/style enforcer — flag substance, not prose taste.

## Reference / reuse (do not restate conventions)

- Mirror `routes/admin.ts` for the admin-gated route shape (`authPlugin` +
  `requireAdmin`), `routes/providers.ts` for config CRUD, `lib/access.ts` for the
  system (admin-level) access context the run uses.
- Reuse `lib/docstore.ts` (`listDocs`/`readDoc`/`updateDoc`/`backlinks`/
  `slugifyPath`, `updatedAt` = mtime), `lib/llm.ts` (`makeClient`),
  `lib/providers.ts` (`resolveActiveProvider`), `lib/agent.ts` (`stripEmojis`).
- Frontend: mirror `hooks/use-providers.ts` + `components/settings/ProvidersSection.tsx`.

## Data model → `db/schema.ts` (then `bun run db:generate`)

```
maintenance_config(            -- singleton, id = 1 (seeded)
  id            integer pk,            -- always 1
  enabled       boolean default false, -- master on/off (off until an admin opts in)
  intervalHours integer default 24,    -- min hours between scheduled runs
  staleDays     integer default 180,   -- "stale" = not edited in N days
  maxDocsPerRun integer default 200,   -- cap docs the LLM pass examines per run
  maxSuggestions integer default 100,  -- cap new suggestions persisted per run
  llmModel      text null,             -- LLM model override (null = active provider's)
  scopeDepts    text null,             -- JSON string[] of dept keys (null/[] = all)
  checks        text null,             -- JSON string[] of enabled check keys (null = all)
  updatedAt     text default current_timestamp
)

maintenance_runs(
  id          integer pk autoincrement,
  trigger     text,                  -- 'schedule' | 'manual'
  status      text,                  -- 'running' | 'ok' | 'error' | 'skipped'
  startedAt   text default current_timestamp,
  finishedAt  text null,
  scanned     integer default 0,
  found       integer default 0,     -- NEW suggestions filed (post-dedup)
  error       text null
)

suggestions(
  id          integer pk autoincrement,
  runId       integer null,
  check       text,                  -- check key: broken-link|orphan|stale|stub|naming|llm-quality
  kind        text,                  -- 'content' (apply via reviewed diff) | 'advisory' (manual)
  confidence  text,                  -- 'high' | 'medium' | 'low'
  title       text,
  detail      text,
  path        text,                  -- primary affected page (relative)
  department  text null,             -- departmentOf(path)
  evidence    text null,             -- snippet / line for the admin
  fingerprint text,                  -- stable id for dedup + suppression
  status      text default 'open',   -- open | applied | dismissed | snoozed
  snoozedUntil text null,
  resolvedBy  text null,
  createdAt   text default current_timestamp,
  resolvedAt  text null
)
```

Seed (idempotent, `db/seed.ts`): insert `maintenance_config` row id=1 with
defaults if absent.

## Checks → `lib/checks.ts`

Each check yields `Finding { check, kind, confidence, title, detail, path,
evidence?, fingerprint }`. Fingerprint = sha256(check + path + stable-key).

Deterministic backbone (no LLM, `confidence: high`, run every time):
- **broken-link** (`content`) — a Markdown/`[[wikilink]]` ref that resolves to no
  page (reuses the docstore resolver rules). evidence = the link text/href.
- **orphan** (`advisory`) — a page with zero inbound links (via `backlinks`).
- **stale** (`advisory`) — `updatedAt` older than `staleDays`.
- **stub** (`advisory`) — body < ~200 non-frontmatter chars, or contains
  `TODO`/`TBD`/`coming soon`/`lorem ipsum`.
- **naming** (`advisory`) — path differs from `slugifyPath(path)` (legacy
  underscores/caps).

LLM check (`confidence: medium`, only on docs changed since the last run, capped
at `maxDocsPerRun`, only if a provider resolves + check enabled):
- **llm-quality** (`content`) — per-doc: ask the model for concrete, fixable
  internal problems (self-contradiction, obviously outdated version/date claims,
  broken structure). Strict JSON-array output, emoji-stripped, capped per doc.
  Skips silently if the LLM errors (never fails a run).

## API contract → `routes/maintenance.ts` (register in `routes/index.ts`)

All routes `requireAdmin`. Inputs validated with `t`; responses `ok(...)`.

| Method | Path | Request | Success |
|--------|------|---------|---------|
| GET | `/api/maintenance/config` | — | `ok(Config)` |
| PUT | `/api/maintenance/config` | body: partial config | `ok(Config)` |
| GET | `/api/maintenance/runs` | query: `limit?` | `ok(Run[])` |
| POST | `/api/maintenance/run` | body: `{}` | `ok({ runId, found, scanned })` |
| GET | `/api/maintenance/suggestions` | query: `status?`, `dept?` | `ok(Suggestion[])` |
| POST | `/api/maintenance/suggestions/:id/preview` | — | `ok({ current, proposed, version })` (LLM-drafted; no write) |
| POST | `/api/maintenance/suggestions/:id/apply` | body: `{ content, version }` | `ok(Suggestion)` (writes the reviewed content, marks applied) |
| POST | `/api/maintenance/suggestions/:id/dismiss` | — | `ok(Suggestion)` (suppressed by fingerprint) |
| POST | `/api/maintenance/suggestions/:id/snooze` | body: `{ days? }` | `ok(Suggestion)` |

- `preview`/`apply` only valid for `kind: 'content'` (else 400).
- `apply` re-checks OCC via `updateDoc(path, content, version, systemAuthor)`.
- Manual `run` is synchronous-ish (awaited) and serialized with the scheduler.

## Scheduler → `lib/maintenance.ts` (started from `index.ts` after `app.listen`)

- `startScheduler()`: a single timer (every ~15 min) — only when
  `MAINTENANCE_SCHEDULER` env != 'off' and not in tests. Each tick loads config;
  if `enabled` and not already running and `now - lastFinishedRun >= intervalHours`,
  runs. Serialized (a module-level `running` latch) — never overlaps.
- `runMaintenance(trigger)`: opens a `maintenance_runs` row; runs deterministic
  checks over all in-scope docs + the LLM check over changed docs; **dedups +
  suppresses** new findings against existing suggestions by fingerprint (skip if
  an open / dismissed / active-snoozed suggestion with that fingerprint exists);
  persists the rest (capped at `maxSuggestions`); closes the run.
- Runs with system (admin-level) access; commits attributed to a
  `TrueNote Maintenance` author when a fix is applied.

## UI

**Config** → `components/settings/MaintenanceSection.tsx` (registry, `adminOnly`):
- Switch: enabled. Number: interval hours, stale days, caps. Checkbox list of
  checks. Select: department scope (all / specific). Optional model override.
  "Run checks now" button (shows last run + open-count).

**Review** → `pages/MaintenancePage.tsx` (manifest entry, `hidden`+admin-gated;
an admin-only link in the sidebar footer). Suggestions grouped by department,
each: title, confidence/check badge, affected page link, evidence; actions
**Preview & apply** (opens a diff dialog → confirm writes), **Dismiss**, **Snooze**.
`hooks/use-maintenance.ts` mirrors `use-providers.ts`.

## Acceptance → `tests/maintenance.test.ts` + `tests/checks.test.ts`, 1:1

- [ ] all `/api/maintenance/*` → **401** without auth, **403** for a member
- [ ] GET config returns the seeded singleton; PUT updates it and round-trips
- [ ] POST run creates a `maintenance_runs` row and returns `{ runId, found }`
- [ ] a page with a `[[no-such-page]]` link produces a `broken-link` suggestion
- [ ] an old (mtime > staleDays) page produces a `stale` suggestion
- [ ] a page with no inbound links produces an `orphan` suggestion
- [ ] dismissing a suggestion → a re-run does **not** re-file the same fingerprint
- [ ] preview/apply on an `advisory` suggestion → **400**
- [ ] apply writes the reviewed content (page content changes, suggestion `applied`)
- [ ] checks.test: broken-link / orphan / stale / stub / naming detect on fixtures
```
