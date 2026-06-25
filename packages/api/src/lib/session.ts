// Server-side sessions for auth Mode C. A random opaque token is stored as a
// row (so it can expire / be revoked) and handed to the browser as an httpOnly
// cookie. Provider-agnostic: the dev and (future) Entra providers both end here.
import { and, eq, gt, lt } from 'drizzle-orm'
import { db } from '../db'
import { sessions, users } from '../db/schema'
import { ADMIN_EMAILS, env } from './env'
import { ConflictError } from './errors'

export const SESSION_COOKIE = 'tn_session'

export type Role = 'admin' | 'member'

/** A signed-in human. Distinct from the bearer "service" identity in auth.ts. */
export interface SessionUser {
  kind: 'user'
  id: number
  email: string
  name: string
  role: Role
}

function randomToken(): string {
  return Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString('hex')
}

/** Create-or-update a user by email; returns the row. Used by every provider. */
export function upsertUser(input: {
  email: string
  name: string
  externalId?: string | null
}): { id: number; email: string; name: string } {
  const email = input.email.trim().toLowerCase()
  // Emails in ADMIN_EMAILS are admins; otherwise keep the existing role (members
  // default to 'member' on create). Admins are never auto-demoted here.
  const promote = ADMIN_EMAILS.has(email)
  const existing = db.select().from(users).where(eq(users.email, email)).get()
  if (existing) {
    const role = promote ? 'admin' : existing.role
    db.update(users)
      .set({ name: input.name, externalId: input.externalId ?? existing.externalId, role })
      .where(eq(users.id, existing.id))
      .run()
    return { id: existing.id, email: existing.email, name: input.name }
  }
  const created = db
    .insert(users)
    .values({
      email,
      name: input.name,
      externalId: input.externalId ?? null,
      role: promote ? 'admin' : 'member',
    })
    .returning()
    .get()
  return { id: created.id, email: created.email, name: created.name }
}

// ── Email + password provider (local accounts) ───────────────────────────────
// Passwords are hashed with Bun.password (argon2id) — no external dependency.
// Self-service: anyone who can reach the instance can register (local use). The
// display name defaults to the email's local part; users set a real one in
// Settings → Account.

/** Create a new local account. Throws if the email is taken. */
export async function createPasswordUser(input: {
  email: string
  password: string
  name?: string
}): Promise<SessionUser> {
  const email = input.email.trim().toLowerCase()
  if (db.select({ id: users.id }).from(users).where(eq(users.email, email)).get()) {
    throw new ConflictError('An account with that email already exists')
  }
  const name = input.name?.trim() || email.split('@')[0]
  const passwordHash = await Bun.password.hash(input.password)
  const role: Role = ADMIN_EMAILS.has(email) ? 'admin' : 'member'
  const created = db.insert(users).values({ email, name, passwordHash, role }).returning().get()
  return { kind: 'user', id: created.id, email: created.email, name: created.name, role }
}

/** Verify email + password; null if no such account / wrong password / no password set. */
export async function verifyCredentials(input: {
  email: string
  password: string
}): Promise<SessionUser | null> {
  const email = input.email.trim().toLowerCase()
  const row = db.select().from(users).where(eq(users.email, email)).get()
  if (!row?.passwordHash) return null
  if (!(await Bun.password.verify(input.password, row.passwordHash))) return null
  // Keep admin promotion in sync with ADMIN_EMAILS (never auto-demote).
  let role: Role = row.role === 'admin' ? 'admin' : 'member'
  if (role !== 'admin' && ADMIN_EMAILS.has(email)) {
    db.update(users).set({ role: 'admin' }).where(eq(users.id, row.id)).run()
    role = 'admin'
  }
  return { kind: 'user', id: row.id, email: row.email, name: row.name, role }
}

/** Update the signed-in user's display name (Settings → Account). */
export function updateUserName(userId: number, name: string): SessionUser {
  db.update(users).set({ name: name.trim() }).where(eq(users.id, userId)).run()
  const row = db
    .select({ id: users.id, email: users.email, name: users.name, role: users.role })
    .from(users)
    .where(eq(users.id, userId))
    .get()!
  return { kind: 'user', id: row.id, email: row.email, name: row.name, role: row.role === 'admin' ? 'admin' : 'member' }
}

/** Open a session for a user; returns the opaque token + expiry. */
export function createSession(userId: number): { token: string; expiresAt: Date } {
  const token = randomToken()
  const expiresAt = new Date(Date.now() + env.SESSION_TTL_HOURS * 3600_000)
  db.insert(sessions).values({ id: token, userId, expiresAt: expiresAt.toISOString() }).run()
  return { token, expiresAt }
}

/** Resolve a session token to its user, or null if missing/expired. */
export function userForToken(token: string): SessionUser | null {
  if (!token) return null
  const now = new Date().toISOString()
  const row = db
    .select({ id: users.id, email: users.email, name: users.name, role: users.role })
    .from(sessions)
    .innerJoin(users, eq(sessions.userId, users.id))
    .where(and(eq(sessions.id, token), gt(sessions.expiresAt, now)))
    .get()
  return row
    ? { kind: 'user', id: row.id, email: row.email, name: row.name, role: row.role === 'admin' ? 'admin' : 'member' }
    : null
}

export function destroySession(token: string): void {
  if (token) db.delete(sessions).where(eq(sessions.id, token)).run()
}

/** Opportunistic cleanup of expired rows; cheap, called on logout. */
export function purgeExpiredSessions(): void {
  db.delete(sessions).where(lt(sessions.expiresAt, new Date().toISOString())).run()
}

// ── Cookie (de)serialization ────────────────────────────────────────────────

export function parseCookies(header: string | null): Record<string, string> {
  const out: Record<string, string> = {}
  if (!header) return out
  for (const part of header.split(';')) {
    const i = part.indexOf('=')
    if (i === -1) continue
    out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim())
  }
  return out
}

export function sessionCookie(token: string, expiresAt: Date): string {
  const attrs = [
    `${SESSION_COOKIE}=${token}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Expires=${expiresAt.toUTCString()}`,
  ]
  if (env.COOKIE_SECURE) attrs.push('Secure')
  return attrs.join('; ')
}

export function clearedCookie(): string {
  const attrs = [`${SESSION_COOKIE}=`, 'Path=/', 'HttpOnly', 'SameSite=Lax', 'Max-Age=0']
  if (env.COOKIE_SECURE) attrs.push('Secure')
  return attrs.join('; ')
}
