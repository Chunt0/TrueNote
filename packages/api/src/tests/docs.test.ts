import { describe, expect, it } from 'bun:test'
import { api, json } from './helpers'

const uniq = () => `route-${Date.now()}-${Math.floor(Math.random() * 1e6)}`

describe('docs API (auth)', () => {
  it('401s without a token or session', async () => {
    const res = await api('/api/docs', {}, false)
    expect(res.status).toBe(401)
  })
})

describe('docs API (happy path via service bearer)', () => {
  it('creates, reads, updates, searches, and deletes a page', async () => {
    const path = `${uniq()}/page.md`

    const created = await json(
      await api('/api/docs', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ path, content: '# Title\n\nhello world' }),
      }),
    )
    expect(created.ok).toBe(true)
    expect(created.data.path).toBe(path)
    const version = created.data.version as string

    const list = await json(await api('/api/docs'))
    expect(list.data.some((d: { path: string }) => d.path === path)).toBe(true)

    const updated = await json(
      await api('/api/docs', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ path, content: '# Title\n\nupdated', version }),
      }),
    )
    expect(updated.data.content).toContain('updated')

    // Stale version → 409 conflict.
    const conflict = await api('/api/docs', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ path, content: 'x', version }),
    })
    expect(conflict.status).toBe(409)

    const del = await api(`/api/docs?path=${encodeURIComponent(path)}`, { method: 'DELETE' })
    expect(del.status).toBe(200)
  })

  it('rejects path traversal with 400', async () => {
    const res = await api('/api/docs', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ path: '../escape', content: 'x' }),
    })
    expect(res.status).toBe(400)
  })
})

describe('docs history & restore', () => {
  it('history 401s without auth', async () => {
    const res = await api('/api/docs/history?path=welcome.md', {}, false)
    expect(res.status).toBe(401)
  })

  it('history returns an array (empty when git is off in tests)', async () => {
    const res = await json(await api('/api/docs/history?path=welcome.md'))
    expect(res.ok).toBe(true)
    expect(Array.isArray(res.data)).toBe(true)
  })

  it('restore rejects a malformed revision', async () => {
    const res = await api('/api/docs/restore', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ path: 'welcome.md', rev: 'zzzzzzz' }),
    })
    expect(res.status).toBe(400)
  })
})

describe('docs trash', () => {
  it('trash list 401s without auth', async () => {
    const res = await api('/api/docs/trash', {}, false)
    expect(res.status).toBe(401)
  })

  it('delete → appears in trash → restore brings it back', async () => {
    const path = `${uniq()}/trashme.md`
    await api('/api/docs', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ path, content: '# Trash me' }),
    })
    await api(`/api/docs?path=${encodeURIComponent(path)}`, { method: 'DELETE' })

    const trash = await json(await api('/api/docs/trash'))
    const item = trash.data.find((t: { path: string }) => t.path === path)
    expect(item).toBeDefined()

    const restored = await json(
      await api('/api/docs/trash/restore', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ id: item.id }),
      }),
    )
    expect(restored.ok).toBe(true)
    expect(restored.data.path).toBe(path)
    const read = await api(`/api/docs/read?path=${encodeURIComponent(path)}`)
    expect(read.status).toBe(200)
  })
})

describe('auth: dev provider (Mode C session)', () => {
  it('logs in, sets a session cookie, and identifies the user via /api/me', async () => {
    const login = await api(
      '/api/auth/dev/login',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: 'alice@corp.example', name: 'Alice' }),
      },
      false,
    )
    expect(login.status).toBe(200)
    const setCookie = login.headers.get('set-cookie') ?? ''
    expect(setCookie).toContain('tn_session=')
    const cookie = setCookie.split(';')[0]

    const me = await json(await api('/api/me', { headers: { cookie } }, false))
    expect(me.ok).toBe(true)
    expect(me.data.user.kind).toBe('user')
    expect(me.data.user.email).toBe('alice@corp.example')
    expect(me.data.user.name).toBe('Alice')
  })
})

describe('assistant API (auth)', () => {
  it('401s for the service bearer (needs a real signed-in user)', async () => {
    const res = await api('/api/assistant/chat', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ message: 'hi' }),
    })
    expect(res.status).toBe(401)
  })

  it('401s with no auth at all', async () => {
    const res = await api(
      '/api/assistant/chat',
      { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ message: 'hi' }) },
      false,
    )
    expect(res.status).toBe(401)
  })
})
