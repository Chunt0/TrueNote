import { timingSafeEqual } from 'node:crypto'
import { Elysia } from 'elysia'
import { env } from './env'
import { ForbiddenError, UnauthorizedError } from './errors'
import { parseCookies, SESSION_COOKIE, type SessionUser, userForToken } from './session'

// ── Auth: Mode C (per-user sessions) + a service bearer token ────────────────
// Every /api/* route except the public allowlist requires identity. Two ways in:
//   1. A session cookie (humans) — set by an auth provider (dev / Entra). The
//      `user` is the signed-in person, used for attribution + git authorship.
//   2. `Authorization: Bearer <AUTH_TOKEN>` (programmatic/CI/the SPA fallback)
//      — resolves to a synthetic "service" identity.
// The cookie wins when both are present. Non-/api paths (the SPA) are public.

/** Bearer-token identity. Has no DB row, so it can't own chat threads. */
export interface ServiceUser {
  kind: 'service'
  id: 'me'
  email: string
  name: string
}

export type User = SessionUser | ServiceUser | null

const SERVICE_USER: ServiceUser = {
  kind: 'service',
  id: 'me',
  email: 'service@truenote.local',
  name: 'Service',
}

const PUBLIC_API_PATHS = new Set(['/api/health'])

function isPublic(path: string): boolean {
  // Auth provider endpoints (login/callback/logout) must be reachable pre-session.
  return PUBLIC_API_PATHS.has(path) || path.startsWith('/api/auth/')
}

function tokenMatches(provided: string): boolean {
  const a = Buffer.from(provided)
  const b = Buffer.from(env.AUTH_TOKEN)
  return a.length === b.length && timingSafeEqual(a, b)
}

export const authPlugin = new Elysia({ name: 'auth' }).derive(
  { as: 'global' },
  ({ request }): { user: User } => {
    const path = new URL(request.url).pathname
    if (!path.startsWith('/api/')) return { user: null }

    // 1. Session cookie (humans) — preferred.
    const cookies = parseCookies(request.headers.get('cookie'))
    const sessionUser = userForToken(cookies[SESSION_COOKIE] ?? '')
    if (sessionUser) return { user: sessionUser }

    // 2. Service bearer token (programmatic / SPA fallback).
    const header = request.headers.get('authorization') ?? ''
    const token = header.startsWith('Bearer ') ? header.slice(7) : ''
    if (token && tokenMatches(token)) return { user: SERVICE_USER }

    // Public endpoints don't require identity.
    if (isPublic(path)) return { user: null }

    throw new UnauthorizedError()
  },
)

/**
 * Routes that own per-user data (chat threads, git attribution) need a real
 * signed-in human, not the service token. Throws 401 otherwise.
 */
export function requireUser(user: User): SessionUser {
  if (user?.kind === 'user') return user
  throw new UnauthorizedError('Sign in to use this feature')
}

/** Admin-only routes. The service bearer token counts as admin (system). */
export function requireAdmin(user: User): void {
  if (!user) throw new UnauthorizedError()
  if (user.kind === 'service' || user.role === 'admin') return
  throw new ForbiddenError('Admin access required')
}
