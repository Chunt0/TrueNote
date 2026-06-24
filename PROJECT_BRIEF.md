# PROJECT_BRIEF

Fill this in, then hand it to Claude: **"Build this per CLAUDE.md."** Describe
*what the app does* — not *how* to build it (the template already decided that).

## 1. One-liner

TrueNote — an in-house wiki for an IT department: Markdown documents stored as
plain **files on disk**, edited collaboratively in the browser, with per-user
attribution, git-backed history, and a lightweight LLM agent that can search and
operate on the same files through a small, fixed set of tools.

## 2. Users & scale

- ~20 users, single internal team, behind the company network/VPN.
- Read-heavy (a wiki), with occasional concurrent edits — **two people editing
  the same page must not silently lose an edit** (see §5).
- Data volume is modest (hundreds–low thousands of pages). Optimize for
  durability, clarity, and "who changed what," not throughput.

## 3. Auth & attribution — Mode C (per-user login), pluggable provider

> ⚠️ Escape hatch, not a config flip. The template ships **Mode B** only
> (`lib/auth.ts` hardcodes one user). Mode C is documented under "when you
> outgrow a default" — a deliberate, supported addition we must build.

Build **one auth seam, env-selected provider** (`AUTH_MODE` in `lib/env.ts`), so
dev is frictionless and production is **Microsoft Entra** with no rearchitecture:

- **`dev` provider (now, for local dev).** A trivial login — pick / type a
  name+email (or auto-login a seeded dev user), no passwords. Easy day-to-day
  dev. **Must refuse to run when `NODE_ENV=production`** (fail-fast in `env.ts`)
  so passwordless auth can never ship by accident.
- **`entra` provider (production, planned).** OIDC authorization-code flow against
  Microsoft Entra ID. Slots in as another provider — same sessions, same user
  model. Add when ready.
- **Shared across providers:** a `users` table (SQLite/Drizzle) upserted on first
  login, keyed by a stable id (email, plus Entra `oid`/`tid` as `externalId`);
  **signed-cookie sessions**; `user` on the request context. The provider only
  differs in *how* a login is established — everything downstream is identical.
- **Attribution everywhere.** "Last edited by Alice" + per-user **git commit
  authorship** `Name <email>` (§5) — identical under dev or Entra.

> Deliberately NOT building local password accounts: dev-mode covers development,
> Entra covers production. Add a `password` provider only if the team must use the
> wiki in a window *before* Entra is wired — flag it if that window exists.

## 4. Storage model — files for docs, SQLite for the rest

> ⚠️ Partial deviation from the template. The golden path stores entities in
> SQLite/Drizzle; TrueNote keeps SQLite but does **not** store doc content in it.
> Docs are real `.md` files so they're navigable and editable by **both humans
> and agents** — in the app, in an editor, in `git`, or in Obsidian.

- **Doc = one `.md` file** under a configurable root (`DOCS_DIR`, in `lib/env.ts`;
  e.g. `./data/wiki`). The file's path *is* its identity.
- **Notebook/section = a folder** under `DOCS_DIR`; nested folders are fine. The
  directory tree *is* the structure — no separate "notebook" record.
- **Title** = filename (without `.md`); optional YAML frontmatter may override.
  **Tags and other doc-intrinsic metadata go in frontmatter**, not SQLite (keeps
  them portable and rename-safe). Timestamps come from git / file mtime.
- **Soft delete = move to `${DOCS_DIR}/.trash/`** (recoverable, hidden), not a
  `deletedAt` column.
- **SQLite holds only**: (1) primary app data that isn't a note — **user
  accounts/sessions, agent chat history, settings**; (2) optional *rebuildable*
  derived caches (FTS or `[[wikilink]]` backlink index) — **skip until needed**.
  Invariant: **deleting the DB loses sessions/chat/caches, but never a note.**
- **Search = live `ripgrep`** over `DOCS_DIR` (filename + content). Fast enough at
  this scale for 20 users; do **not** build a search index yet.
- **Path safety (every write path, API and agent).** Reject `..` traversal and
  absolute paths, sanitize filenames (control chars, reserved names), and resolve
  symlinks so nothing can escape `DOCS_DIR`. This is the main attack surface.

## 5. Concurrency & history (what multi-user adds)

- **Optimistic concurrency (required).** On open, the doc carries a **version
  token** (content hash or mtime). On save, the client sends it back; if the file
  changed since, the server returns **409 Conflict** and the UI offers
  reload / show-diff — never a silent overwrite. The **agent obeys the same
  check** so it can't stomp a human's in-progress edit.
- **Atomic writes.** Write to a temp file + `rename` so a crash mid-save can't
  truncate a page.
- **Git-backed history.** `DOCS_DIR` is a git repo; the app commits on save,
  **authored as the editing user** (and "Assistant on behalf of <user>" for agent
  edits). This gives version history, `blame`, and one-click undo (`git revert`)
  for free — including for agent mistakes. Serialize commits (one writer at a
  time) to avoid `index.lock` races. A page-history UI can come later; the git
  substrate should exist from day one so nothing is lost.

## 6. Pages / views

- **Wiki browser** — browse the `DOCS_DIR` tree (folders + pages, title, last
  edited + by whom); "New page"; search box (grep); row actions to open,
  rename/move, delete (→ trash).
- **Page editor** — open a page and **manually edit title + content**, then save
  (atomic write + git commit). Handles the 409 conflict flow from §5. New pages
  land here blank.
- **Assistant** — a chat panel where the LLM **agent** runs with tools (§7) over
  the same files. Keep it simple.

## 7. AI agent

Keep it **light**. The doc I/O is trivial; spend the care on the agent loop.

- **Fixed, small tool set over the files**, confined to `DOCS_DIR`, reusing the
  same file-store service the UI uses (no powers the user doesn't have; no shell,
  no fs-outside-docs, no web tools):
  - `search_docs` (grep), `list_docs` (walk tree), `read_doc`,
    `create_doc`, `update_doc` (+ rename/move), `delete_doc` (trash)
  - Writes respect optimistic concurrency (§5) and are git-committed/revertible.
  - Consider: edits to *existing* pages surface a diff for confirmation (bigger
    blast radius on a shared wiki) — optional, decide when building.
- **Pluggable provider seam.** Provider/model/key/base-URL via `lib/env.ts`
  (fail-fast). Implement **Claude first** (template default); one
  **OpenAI-compatible** client then covers OpenAI *and* local Ollama. Don't write
  three eager integrations — design the seam, add paths on demand.

## 8. Reference project — `REFERENCE/odysseus`

A mature self-hosted AI workspace (Python). Mirror its **patterns & UX**, do NOT
copy code — and NOT its storage (it's DB-backed for docs; TrueNote is file-backed):

- Agent loop + tool-calling: `src/agent_loop.py`, `src/agent_runs.py`,
  `src/agent_tools/document_tools.py`
- Document tools / editor behavior: `routes/document_routes.py`,
  `src/document_actions.py`, `static/js/document.js`
- Provider abstraction + assistant UX: `routes/chat_routes.py`,
  `routes/assistant_routes.py`, `static/` (themes, chat panel)

## 9. Out of scope (for now — keep it light)

- No semantic/embedding search or RAG (plain grep is enough). A rebuildable
  SQLite FTS/backlink index is allowed *only if* grep gets slow.
- No inline AI editing UX (select-and-rewrite, suggestions) — a later add.
- No autonomous/background or scheduled agent runs — the agent acts only when
  asked in the Assistant.
- No agent tools beyond the docs dir (no shell, arbitrary filesystem, web, email,
  calendar — Odysseus has these; TrueNote deliberately does not).
- No real-time collaborative (Google-Docs-style) co-editing, rich-text WYSIWYG,
  uploads, or fine-grained per-page permissions (everyone on the team can
  read/write the whole wiki). Revisit RBAC only if the team asks.

---

When done building: `bun run check` green, `bun run eject:reference` run, docs
updated to match what you built.
