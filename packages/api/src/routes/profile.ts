import { Elysia, t } from 'elysia'
import { authPlugin, requireUser } from '../lib/auth'
import { ok } from '../lib/response'
import { updateUserName } from '../lib/session'

// The signed-in user's own profile. Today: set the display name (the login flow
// only asks for email + password; the name is chosen here afterwards).
const profileRoutes = new Elysia({ prefix: '/api/profile' })
  .use(authPlugin)
  .put(
    '/',
    ({ user, body }) => {
      const u = requireUser(user) // a real signed-in human, not the service token
      const updated = updateUserName(u.id, body.name)
      return ok({ user: { id: updated.id, email: updated.email, name: updated.name } })
    },
    { body: t.Object({ name: t.String({ minLength: 1, maxLength: 120 }) }) },
  )

export default profileRoutes
