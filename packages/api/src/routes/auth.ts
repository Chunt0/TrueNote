import { Elysia, t } from 'elysia'
import { env } from '../lib/env'
import { ServiceUnavailableError } from '../lib/errors'
import { ok } from '../lib/response'
import {
  clearedCookie,
  createSession,
  destroySession,
  parseCookies,
  purgeExpiredSessions,
  SESSION_COOKIE,
  sessionCookie,
  upsertUser,
} from '../lib/session'

// ── Auth provider endpoints (public; see lib/auth.ts isPublic) ───────────────
// One seam, env-selected provider (env.AUTH_MODE). `dev` is passwordless for
// local development (and refuses to boot under NODE_ENV=production, see env.ts).
// `entra` (Microsoft Entra OIDC) is the planned production provider — it slots
// in here using the SAME upsertUser + createSession + cookie below.
const authRoutes = new Elysia({ prefix: '/api/auth' })
  .post(
    '/dev/login',
    ({ body, set }) => {
      if (env.AUTH_MODE !== 'dev') {
        throw new ServiceUnavailableError('Dev login is disabled (AUTH_MODE is not "dev")')
      }
      const name = body.name?.trim() || body.email.split('@')[0]
      const user = upsertUser({ email: body.email, name })
      const { token, expiresAt } = createSession(user.id)
      set.headers['set-cookie'] = sessionCookie(token, expiresAt)
      return ok({ user: { id: user.id, email: user.email, name: user.name } })
    },
    {
      body: t.Object({
        email: t.String({ format: 'email', minLength: 3, maxLength: 200 }),
        name: t.Optional(t.String({ maxLength: 120 })),
      }),
    },
  )
  .post('/logout', ({ request, set }) => {
    const token = parseCookies(request.headers.get('cookie'))[SESSION_COOKIE] ?? ''
    destroySession(token)
    purgeExpiredSessions()
    set.headers['set-cookie'] = clearedCookie()
    return ok({ loggedOut: true })
  })
  // Placeholder for the production provider — wired later (OIDC code flow).
  .get('/entra/login', () => {
    throw new ServiceUnavailableError('Microsoft Entra login is not configured yet')
  })

export default authRoutes
