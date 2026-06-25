import { describe, expect, it } from 'bun:test'
import { api, json } from './helpers'

// Local email + password accounts (register / login) and the profile name update.
// These routes are always available (not AUTH_MODE-gated); password hashing uses
// Bun.password (argon2id).
const uniq = () => `${Date.now()}${Math.floor(Math.random() * 1e6)}`

function post(path: string, body: unknown, cookie?: string) {
  const headers: Record<string, string> = { 'content-type': 'application/json' }
  if (cookie) headers.cookie = cookie
  return api(path, { method: 'POST', headers, body: JSON.stringify(body) }, false)
}

describe('password auth', () => {
  it('registers, logs in, blocks dupes/bad passwords, and edits the display name', async () => {
    const email = `pw-${uniq()}@corp.example`
    const password = 'secret12'

    // Register → 200 + session cookie; name defaults to the email's local part.
    const reg = await post('/api/auth/register', { email, password })
    expect(reg.status).toBe(200)
    const cookie = (reg.headers.get('set-cookie') ?? '').split(';')[0]
    expect(cookie).toContain('tn_session=')

    const me = await json(await api('/api/me', { headers: { cookie } }, false))
    expect(me.data.user.email).toBe(email)
    expect(me.data.user.name).toBe(email.split('@')[0])

    // Duplicate email → 409; too-short password → 422 (validation).
    expect((await post('/api/auth/register', { email, password })).status).toBe(409)
    expect((await post('/api/auth/register', { email: `x-${uniq()}@corp.example`, password: 'short' })).status).toBe(422)

    // Wrong password → 401; correct → 200.
    expect((await post('/api/auth/login', { email, password: 'wrongpass' })).status).toBe(401)
    expect((await post('/api/auth/login', { email, password })).status).toBe(200)

    // Set the display name (Settings → Account).
    const prof = await api(
      '/api/profile',
      { method: 'PUT', headers: { 'content-type': 'application/json', cookie }, body: JSON.stringify({ name: 'Real Name' }) },
      false,
    )
    expect(prof.status).toBe(200)
    const me2 = await json(await api('/api/me', { headers: { cookie } }, false))
    expect(me2.data.user.name).toBe('Real Name')
  })

  it('login fails for an unknown email', async () => {
    expect((await post('/api/auth/login', { email: `nobody-${uniq()}@corp.example`, password: 'whatever1' })).status).toBe(401)
  })

  it('profile update requires a signed-in human (401 unauthed / service token)', async () => {
    const body = { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: 'x' }) }
    expect((await api('/api/profile', body, false)).status).toBe(401) // no auth
    expect((await api('/api/profile', body)).status).toBe(401) // service bearer is not a real user
  })
})
