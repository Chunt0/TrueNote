import { Elysia, t } from 'elysia'
import {
  backlinks,
  createDoc,
  deleteDoc,
  docDiff,
  docHistory,
  listDocs,
  listTrash,
  purgeTrash,
  readDoc,
  renameDoc,
  restoreDoc,
  restoreFromTrash,
  searchDocs,
  updateDoc,
} from '../lib/docstore'
import { authPlugin, type User } from '../lib/auth'
import { UnauthorizedError } from '../lib/errors'
import { ok } from '../lib/response'

// Wiki pages are `.md` files on disk (lib/docstore.ts) — not SQLite rows. Every
// write is attributed to the signed-in user (git authorship) and guarded by an
// optimistic-concurrency version token (409 on a stale save).
function authorOf(user: User): { name: string; email: string } {
  if (!user) throw new UnauthorizedError()
  return { name: user.name, email: user.email }
}

const MAX_CONTENT = 1_000_000

const docsRoutes = new Elysia({ prefix: '/api/docs' })
  .use(authPlugin)
  .get('/', () => ok(listDocs()))
  .get('/read', ({ query }) => ok(readDoc(query.path)), {
    query: t.Object({ path: t.String({ minLength: 1, maxLength: 400 }) }),
  })
  .get('/search', ({ query }) => ok(searchDocs(query.q)), {
    query: t.Object({ q: t.String({ maxLength: 200 }) }),
  })
  .get('/history', ({ query }) => ok(docHistory(query.path)), {
    query: t.Object({ path: t.String({ minLength: 1, maxLength: 400 }) }),
  })
  .get('/backlinks', ({ query }) => ok(backlinks(query.path)), {
    query: t.Object({ path: t.String({ minLength: 1, maxLength: 400 }) }),
  })
  .get('/diff', ({ query }) => ok({ diff: docDiff(query.path, query.rev) }), {
    query: t.Object({
      path: t.String({ minLength: 1, maxLength: 400 }),
      rev: t.String({ minLength: 7, maxLength: 40 }),
    }),
  })
  .post('/restore', ({ body, user }) => ok(restoreDoc(body.path, body.rev, authorOf(user))), {
    body: t.Object({
      path: t.String({ minLength: 1, maxLength: 400 }),
      rev: t.String({ minLength: 7, maxLength: 40 }),
    }),
  })
  .post('/', ({ body, user }) => ok(createDoc(body.path, body.content, authorOf(user))), {
    body: t.Object({
      path: t.String({ minLength: 1, maxLength: 400 }),
      content: t.String({ maxLength: MAX_CONTENT }),
    }),
  })
  .put('/', ({ body, user }) => ok(updateDoc(body.path, body.content, body.version, authorOf(user))), {
    body: t.Object({
      path: t.String({ minLength: 1, maxLength: 400 }),
      content: t.String({ maxLength: MAX_CONTENT }),
      version: t.String({ minLength: 1, maxLength: 64 }),
    }),
  })
  .post('/rename', ({ body, user }) => ok(renameDoc(body.from, body.to, authorOf(user))), {
    body: t.Object({
      from: t.String({ minLength: 1, maxLength: 400 }),
      to: t.String({ minLength: 1, maxLength: 400 }),
    }),
  })
  .delete('/', ({ query, user }) => ok(deleteDoc(query.path, authorOf(user))), {
    query: t.Object({ path: t.String({ minLength: 1, maxLength: 400 }) }),
  })
  .get('/trash', () => ok(listTrash()))
  .post('/trash/restore', ({ body, user }) => ok(restoreFromTrash(body.id, authorOf(user))), {
    body: t.Object({ id: t.String({ minLength: 1, maxLength: 400 }) }),
  })
  .delete('/trash', ({ query, user }) => ok(purgeTrash(query.id, authorOf(user))), {
    query: t.Object({ id: t.String({ minLength: 1, maxLength: 400 }) }),
  })

export default docsRoutes
