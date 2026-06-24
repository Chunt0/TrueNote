# Spec: wiki (docs on disk) + assistant

- **status:** building
- **tests:** packages/api/src/tests/docs.test.ts, packages/api/src/tests/docstore.test.ts
- **kind:** feature

## Goal

An internal IT-department wiki whose pages are plain Markdown **files on disk**
(the source of truth), editable by hand in the browser, plus a lightweight LLM
agent that searches and edits those same files through a small, fixed tool set.
See `PROJECT_BRIEF.md` for the full rationale.

## Out of scope

- Storing doc content in SQLite (docs are files; SQLite holds only users,
  sessions, and Assistant chat history).
- Semantic/embedding search or RAG (plain grep only), inline AI editing UX,
  background/scheduled agent runs, agent tools beyond the docs dir, real-time
  co-editing, version-history UI, rich-text WYSIWYG, RBAC.

## Storage model → `lib/docstore.ts`

- Doc = one `.md` file under `DOCS_DIR`; folders are sections; the path is the id.
- Title from the filename (or YAML `title:`); timestamps from file mtime.
- Soft delete = move to `${DOCS_DIR}/.trash/`. Optional git commit per save,
  authored as the editing user (best-effort).
- **Path safety:** reject traversal/absolute/dotfile/symlink-escape paths.
- **Optimistic concurrency:** reads return a content-hash `version`; an update
  with a stale version returns **409**.

## API → `routes/docs.ts`, `routes/assistant.ts`, `routes/auth.ts`

- `GET /api/docs`, `GET /api/docs/read?path`, `GET /api/docs/search?q`,
  `POST /api/docs`, `PUT /api/docs` (version → 409), `POST /api/docs/rename`,
  `DELETE /api/docs?path`.
- `POST /api/assistant/chat` (real user only), `GET /api/assistant/threads`,
  `GET /api/assistant/messages?threadId`.
- `POST /api/auth/dev/login`, `POST /api/auth/logout` (Mode C sessions).

## Auth → `lib/auth.ts`, `lib/session.ts`

Per-user sessions (Mode C), pluggable provider (`dev` now, `entra` later); a
service bearer token remains for programmatic/CI access.

## Acceptance

- [ ] `GET /api/docs` 401s without a session or service token.
- [ ] Create → read → update (correct version) → search → delete round-trips.
- [ ] Updating with a stale version returns 409.
- [ ] Path traversal (`../escape`, absolute, dotfile) is rejected (400 / throws).
- [ ] Dev login sets a session cookie; `/api/me` then identifies the user.
- [ ] The Assistant requires a real signed-in user (service bearer → 401).
- [ ] Optimistic-concurrency + path-safety covered by docstore unit tests.
