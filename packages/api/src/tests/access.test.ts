import { describe, expect, it } from 'bun:test'
import { api, json } from './helpers'

// Department-scoped access control. The service bearer (used by `api()` by
// default) is admin-level, so it sets up departments + pages; a dev-login member
// session is then checked against them.
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

function asMember(path: string, cookie: string, init: RequestInit = {}) {
  return api(path, { ...init, headers: { ...init.headers, cookie } }, false)
}

async function createDoc(path: string, content: string) {
  return api('/api/docs', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ path, content }),
  })
}

describe('department access control', () => {
  it('scopes a member to their departments + shared pages; admin sees all', async () => {
    const dept = `eng${uniq()}`
    const engPath = `${dept}/secret.md`
    const sharedPath = `notes-${uniq()}.md`

    // Admin (service token) registers a department + pages.
    const deptRes = await api('/api/admin/departments', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ key: dept }),
    })
    expect(deptRes.status).toBe(200)
    expect((await createDoc(engPath, '# Secret\n\ndept-only')).status).toBe(200)
    expect((await createDoc(sharedPath, '# Shared\n\nfor everyone')).status).toBe(200)

    // A fresh member: no departments granted.
    const email = `bob-${uniq()}@corp.example`
    const cookie = await login(email, 'Bob')

    // List omits the department page, keeps the shared one.
    const list = await json(await asMember('/api/docs', cookie))
    const paths = list.data.map((d: { path: string }) => d.path)
    expect(paths).toContain(sharedPath)
    expect(paths).not.toContain(engPath)

    // Direct read of the department page → 403; shared page → 200.
    expect((await asMember(`/api/docs/read?path=${encodeURIComponent(engPath)}`, cookie)).status).toBe(403)
    expect((await asMember(`/api/docs/read?path=${encodeURIComponent(sharedPath)}`, cookie)).status).toBe(200)

    // Search excludes the department page.
    const search = await json(await asMember('/api/docs/search?q=secret', cookie))
    expect(search.data.some((d: { path: string }) => d.path === engPath)).toBe(false)

    // Creating inside the department → 403.
    const blocked = await asMember(`/api/docs`, cookie, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ path: `${dept}/intruder.md`, content: 'x' }),
    })
    expect(blocked.status).toBe(403)

    // Admin (service token) sees the department page in the full list.
    const adminList = await json(await api('/api/docs'))
    expect(adminList.data.some((d: { path: string }) => d.path === engPath)).toBe(true)

    // Grant the member the department, and access opens up.
    const users = await json(await api('/api/admin/users'))
    const me = users.data.find((u: { email: string }) => u.email === email)
    expect(me).toBeDefined()
    const put = await api(`/api/admin/users/${me.id}`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ departments: [dept] }),
    })
    expect(put.status).toBe(200)

    expect((await asMember(`/api/docs/read?path=${encodeURIComponent(engPath)}`, cookie)).status).toBe(200)
    const list2 = await json(await asMember('/api/docs', cookie))
    expect(list2.data.some((d: { path: string }) => d.path === engPath)).toBe(true)
  })
})
