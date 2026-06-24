// Department-scoped access control. A department is a registered top-level wiki
// folder; a member may only see pages in their granted departments (plus shared
// pages outside any registered department). Admins and the service token see all.
import { eq } from 'drizzle-orm'
import { db } from '../db'
import { departments, userDepartments } from '../db/schema'
import type { User } from './auth'
import { ForbiddenError } from './errors'

export interface Access {
  isAdmin: boolean
  departments: Set<string> // dept keys the user can access (ignored when isAdmin)
}

/** Resolve a user's access. Admins + the service token see everything. */
export function getAccess(user: User): Access {
  if (user && (user.kind === 'service' || user.role === 'admin')) {
    return { isAdmin: true, departments: new Set() }
  }
  if (!user) return { isAdmin: false, departments: new Set() }
  const rows = db
    .select({ k: userDepartments.deptKey })
    .from(userDepartments)
    .where(eq(userDepartments.userId, user.id))
    .all()
  return { isAdmin: false, departments: new Set(rows.map((r) => r.k)) }
}

/** The set of registered department keys (access-controlled top-level folders). */
export function registeredDepartments(): Set<string> {
  return new Set(db.select({ k: departments.key }).from(departments).all().map((r) => r.k))
}

/** A page's department = its first path segment (null for root-level pages). */
export function departmentOf(path: string): string | null {
  const i = path.indexOf('/')
  return i > 0 ? path.slice(0, i) : null
}

export function canAccess(path: string, access: Access, registered: Set<string>): boolean {
  if (access.isAdmin) return true
  const dept = departmentOf(path)
  if (!dept || !registered.has(dept)) return true // shared (not a registered department)
  return access.departments.has(dept)
}

export interface AccessCtx {
  access: Access
  registered: Set<string>
}

/** Compute access + the registered-department set once per request. */
export function accessContext(user: User): AccessCtx {
  return { access: getAccess(user), registered: registeredDepartments() }
}

export function isAccessible(path: string, ctx: AccessCtx): boolean {
  return canAccess(path, ctx.access, ctx.registered)
}

/** Guard a single path (read/write of one page). */
export function assertAccess(path: string, ctx: AccessCtx): void {
  if (!isAccessible(path, ctx)) throw new ForbiddenError('You do not have access to that page')
}

/** Filter a list of items down to the ones the user may see. */
export function filterAccessible<T>(items: T[], getPath: (t: T) => string, ctx: AccessCtx): T[] {
  if (ctx.access.isAdmin) return items
  return items.filter((it) => isAccessible(getPath(it), ctx))
}
