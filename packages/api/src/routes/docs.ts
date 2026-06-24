import { Elysia, t } from 'elysia'
import { accessContext, assertAccess, filterAccessible, isAccessible } from '../lib/access'
import { authPlugin, type User } from '../lib/auth'
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
  recentChanges,
  renameDoc,
  restoreDoc,
  restoreFromTrash,
  searchDocs,
  slugifyPath,
  updateDoc,
} from '../lib/docstore'
import { UnauthorizedError } from '../lib/errors'
import { ok } from '../lib/response'

// Wiki pages are `.md` files on disk (lib/docstore.ts) — not SQLite rows. Every
// write is attributed to the signed-in user (git authorship), guarded by an
// optimistic-concurrency version token (409 on a stale save), and scoped by
// department access (403 on a page outside the user's departments).
function authorOf(user: User): { name: string; email: string } {
  if (!user) throw new UnauthorizedError()
  return { name: user.name, email: user.email }
}

const MAX_CONTENT = 1_000_000
const pathQuery = t.Object({ path: t.String({ minLength: 1, maxLength: 400 }) })

const docsRoutes = new Elysia({ prefix: '/api/docs' })
  .use(authPlugin)
  .get('/', ({ user }) => ok(filterAccessible(listDocs(), (d) => d.path, accessContext(user))))
  .get(
    '/read',
    ({ query, user }) => {
      const ctx = accessContext(user)
      assertAccess(query.path, ctx)
      return ok(readDoc(query.path))
    },
    { query: pathQuery },
  )
  .get('/search', ({ query, user }) => ok(filterAccessible(searchDocs(query.q), (h) => h.path, accessContext(user))), {
    query: t.Object({ q: t.String({ maxLength: 200 }) }),
  })
  .get(
    '/history',
    ({ query, user }) => {
      assertAccess(query.path, accessContext(user))
      return ok(docHistory(query.path))
    },
    { query: pathQuery },
  )
  .get(
    '/backlinks',
    ({ query, user }) => {
      const ctx = accessContext(user)
      assertAccess(query.path, ctx)
      return ok(filterAccessible(backlinks(query.path), (d) => d.path, ctx))
    },
    { query: pathQuery },
  )
  .get('/activity', ({ user }) => {
    const ctx = accessContext(user)
    const entries = recentChanges()
      .map((e) => ({ ...e, files: e.files.filter((f) => isAccessible(f, ctx)) }))
      .filter((e) => e.files.length > 0)
    return ok(entries)
  })
  .get(
    '/diff',
    ({ query, user }) => {
      assertAccess(query.path, accessContext(user))
      return ok({ diff: docDiff(query.path, query.rev) })
    },
    {
      query: t.Object({
        path: t.String({ minLength: 1, maxLength: 400 }),
        rev: t.String({ minLength: 7, maxLength: 40 }),
      }),
    },
  )
  .post(
    '/restore',
    ({ body, user }) => {
      assertAccess(body.path, accessContext(user))
      return ok(restoreDoc(body.path, body.rev, authorOf(user)))
    },
    {
      body: t.Object({
        path: t.String({ minLength: 1, maxLength: 400 }),
        rev: t.String({ minLength: 7, maxLength: 40 }),
      }),
    },
  )
  .post(
    '/',
    ({ body, user }) => {
      const target = slugifyPath(body.path) // normalize so the access check sees the real dept
      assertAccess(target, accessContext(user))
      return ok(createDoc(target, body.content, authorOf(user)))
    },
    {
      body: t.Object({
        path: t.String({ minLength: 1, maxLength: 400 }),
        content: t.String({ maxLength: MAX_CONTENT }),
      }),
    },
  )
  .put(
    '/',
    ({ body, user }) => {
      assertAccess(body.path, accessContext(user))
      return ok(updateDoc(body.path, body.content, body.version, authorOf(user)))
    },
    {
      body: t.Object({
        path: t.String({ minLength: 1, maxLength: 400 }),
        content: t.String({ maxLength: MAX_CONTENT }),
        version: t.String({ minLength: 1, maxLength: 64 }),
      }),
    },
  )
  .post(
    '/rename',
    ({ body, user }) => {
      const ctx = accessContext(user)
      assertAccess(body.from, ctx)
      assertAccess(slugifyPath(body.to), ctx)
      return ok(renameDoc(body.from, body.to, authorOf(user)))
    },
    {
      body: t.Object({
        from: t.String({ minLength: 1, maxLength: 400 }),
        to: t.String({ minLength: 1, maxLength: 400 }),
      }),
    },
  )
  .delete(
    '/',
    ({ query, user }) => {
      assertAccess(query.path, accessContext(user))
      return ok(deleteDoc(query.path, authorOf(user)))
    },
    { query: pathQuery },
  )
  .get('/trash', ({ user }) => ok(filterAccessible(listTrash(), (i) => i.path, accessContext(user))))
  .post(
    '/trash/restore',
    ({ body, user }) => {
      const ctx = accessContext(user)
      const item = listTrash().find((i) => i.id === body.id)
      if (item) assertAccess(item.path, ctx)
      return ok(restoreFromTrash(body.id, authorOf(user)))
    },
    { body: t.Object({ id: t.String({ minLength: 1, maxLength: 400 }) }) },
  )
  .delete(
    '/trash',
    ({ query, user }) => {
      const ctx = accessContext(user)
      const item = listTrash().find((i) => i.id === query.id)
      if (item) assertAccess(item.path, ctx)
      return ok(purgeTrash(query.id, authorOf(user)))
    },
    { query: t.Object({ id: t.String({ minLength: 1, maxLength: 400 }) }) },
  )

export default docsRoutes
