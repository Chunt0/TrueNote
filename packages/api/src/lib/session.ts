// Server-side sessions for auth Mode C. A random opaque token is stored as a
// row (so it can expire / be revoked) and handed to the browser as an httpOnly
// cookie. Provider-agnostic: the dev and (future) Entra providers both end here.
import { and, eq, gt, lt } from 'drizzle-orm'
import { db } from '../db'
import { sessions, users } from '../db/schema'
import { env, isProd } from './env'

export const SESSION_COOKIE = 'tn_session'

/** A signed-in human. Distinct from the bearer "service" identity in auth.ts. */
export interface SessionUser {
  kind: 'user'
  id: number
  email: string
  name: string
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
  const existing = db.select().from(users).where(eq(users.email, email)).get()
  if (existing) {
    if (existing.name !== input.name || (input.externalId && existing.externalId !== input.externalId)) {
      db.update(users)
        .set({ name: input.name, externalId: input.externalId ?? existing.externalId })
        .where(eq(users.id, existing.id))
        .run()
    }
    return { id: existing.id, email: existing.email, name: input.name }
  }
  const created = db
    .insert(users)
    .values({ email, name: input.name, externalId: input.externalId ?? null })
    .returning()
    .get()
  return { id: created.id, email: created.email, name: created.name }
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
    .select({ id: users.id, email: users.email, name: users.name })
    .from(sessions)
    .innerJoin(users, eq(sessions.userId, users.id))
    .where(and(eq(sessions.id, token), gt(sessions.expiresAt, now)))
    .get()
  return row ? { kind: 'user', id: row.id, email: row.email, name: row.name } : null
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
  if (isProd) attrs.push('Secure')
  return attrs.join('; ')
}

export function clearedCookie(): string {
  const attrs = [`${SESSION_COOKIE}=`, 'Path=/', 'HttpOnly', 'SameSite=Lax', 'Max-Age=0']
  if (isProd) attrs.push('Secure')
  return attrs.join('; ')
}
