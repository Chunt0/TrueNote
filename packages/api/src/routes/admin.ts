import { eq } from 'drizzle-orm'
import { Elysia, t } from 'elysia'
import { db } from '../db'
import { departments, userDepartments, users } from '../db/schema'
import { authPlugin, requireAdmin } from '../lib/auth'
import { BadRequestError, NotFoundError } from '../lib/errors'
import { ok } from '../lib/response'
import { idParam } from '../lib/schemas'

// Admin-only: manage users (role + department access) and the department registry.
// Departments are access-controlled top-level wiki folders (kebab keys).
function slugKey(s: string): string {
  return s
    .toLowerCase()
    .trim()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

const adminRoutes = new Elysia({ prefix: '/api/admin' })
  .use(authPlugin)
  .onBeforeHandle(({ user }) => requireAdmin(user))

  // ── Users ──────────────────────────────────────────────────────────────────
  .get('/users', () => {
    const rows = db
      .select({ id: users.id, email: users.email, name: users.name, role: users.role })
      .from(users)
      .orderBy(users.email)
      .all()
    const links = db.select().from(userDepartments).all()
    const byUser = new Map<number, string[]>()
    for (const l of links) byUser.set(l.userId, [...(byUser.get(l.userId) ?? []), l.deptKey])
    return ok(rows.map((u) => ({ ...u, departments: byUser.get(u.id) ?? [] })))
  })
  .put(
    '/users/:id',
    ({ params, body }) => {
      const u = db.select().from(users).where(eq(users.id, params.id)).get()
      if (!u) throw new NotFoundError('User not found')
      if (body.role) db.update(users).set({ role: body.role }).where(eq(users.id, params.id)).run()
      if (body.departments) {
        const valid = new Set(db.select({ k: departments.key }).from(departments).all().map((r) => r.k))
        db.delete(userDepartments).where(eq(userDepartments.userId, params.id)).run()
        for (const k of body.departments) {
          if (valid.has(k)) {
            db.insert(userDepartments).values({ userId: params.id, deptKey: k }).onConflictDoNothing().run()
          }
        }
      }
      return ok({ id: params.id, updated: true })
    },
    {
      params: idParam,
      body: t.Object({
        role: t.Optional(t.Union([t.Literal('admin'), t.Literal('member')])),
        departments: t.Optional(t.Array(t.String({ maxLength: 60 }))),
      }),
    },
  )

  // ── Departments ──────────────────────────────────────────────────────────────
  .get('/departments', () => ok(db.select().from(departments).orderBy(departments.key).all()))
  .post(
    '/departments',
    ({ body }) => {
      const key = slugKey(body.key)
      if (!key) throw new BadRequestError('Invalid department key')
      db.insert(departments).values({ key, label: body.label?.trim() || key }).onConflictDoNothing().run()
      return ok(db.select().from(departments).where(eq(departments.key, key)).get())
    },
    {
      body: t.Object({
        key: t.String({ minLength: 1, maxLength: 60 }),
        label: t.Optional(t.String({ maxLength: 80 })),
      }),
    },
  )
  .delete(
    '/departments/:key',
    ({ params }) => {
      // Un-register the department (pages under it become shared again) and drop
      // its access grants. Files on disk are untouched.
      db.delete(userDepartments).where(eq(userDepartments.deptKey, params.key)).run()
      db.delete(departments).where(eq(departments.key, params.key)).run()
      return ok({ key: params.key, deleted: true })
    },
    { params: t.Object({ key: t.String({ minLength: 1, maxLength: 60 }) }) },
  )

export default adminRoutes
