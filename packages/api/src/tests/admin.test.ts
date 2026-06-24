import { describe, expect, it } from 'bun:test'
import { api, json } from './helpers'

// Admin management API. The service bearer is admin-level; a dev-login member
// session must be rejected with 403.
const uniq = () => `${Date.now()}${Math.floor(Math.random() * 1e6)}`

async function login(email: string, name: string): Promise<string> {
  const res = await api(
    '/api/auth/dev/login',
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email, name }),
    },
    false,
  )
  return (res.headers.get('set-cookie') ?? '').split(';')[0]
}

describe('admin API auth', () => {
  it('401s without auth', async () => {
    expect((await api('/api/admin/users', {}, false)).status).toBe(401)
  })

  it('403s for a plain member', async () => {
    const cookie = await login(`member-${uniq()}@corp.example`, 'Member')
    const res = await api('/api/admin/users', { headers: { cookie } }, false)
    expect(res.status).toBe(403)
  })
})

describe('department CRUD', () => {
  it('creates (slugified), lists, and deletes a department', async () => {
    const raw = `Field Ops ${uniq()}`
    const created = await json(
      await api('/api/admin/departments', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ key: raw, label: 'Field Ops' }),
      }),
    )
    expect(created.ok).toBe(true)
    const key = created.data.key as string
    expect(key).toMatch(/^field-ops-\d+$/) // kebab-cased

    const list = await json(await api('/api/admin/departments'))
    expect(list.data.some((d: { key: string }) => d.key === key)).toBe(true)

    expect((await api(`/api/admin/departments/${key}`, { method: 'DELETE' })).status).toBe(200)
    const after = await json(await api('/api/admin/departments'))
    expect(after.data.some((d: { key: string }) => d.key === key)).toBe(false)
  })
})

describe('role + department assignment round-trip', () => {
  it('promotes a user to admin and assigns then revokes a department', async () => {
    const dept = `ops${uniq()}`
    await api('/api/admin/departments', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ key: dept }),
    })

    const email = `carol-${uniq()}@corp.example`
    await login(email, 'Carol')
    const users = await json(await api('/api/admin/users'))
    const carol = users.data.find((u: { email: string }) => u.email === email)
    expect(carol.role).toBe('member')
    expect(carol.departments).toEqual([])

    // Assign a department.
    await api(`/api/admin/users/${carol.id}`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ departments: [dept] }),
    })
    // Promote to admin.
    await api(`/api/admin/users/${carol.id}`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ role: 'admin' }),
    })

    const after = await json(await api('/api/admin/users'))
    const carol2 = after.data.find((u: { email: string }) => u.email === email)
    expect(carol2.role).toBe('admin')
    expect(carol2.departments).toContain(dept)

    // Unknown department keys are ignored (validated against the registry).
    await api(`/api/admin/users/${carol.id}`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ departments: ['does-not-exist'] }),
    })
    const after2 = await json(await api('/api/admin/users'))
    const carol3 = after2.data.find((u: { email: string }) => u.email === email)
    expect(carol3.departments).toEqual([])
  })

  it('404s when updating a missing user', async () => {
    const res = await api('/api/admin/users/99999', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ role: 'member' }),
    })
    expect(res.status).toBe(404)
  })
})
