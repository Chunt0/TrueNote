import { utimesSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'bun:test'
import { docsRoot } from '../lib/docstore'
import { api, json } from './helpers'

// The service bearer (default in api()) is admin-level; a dev-login session is a
// member. Maintenance runs are scoped to a unique department so a run only scans
// this test's fixtures (the test DB/docs dir is shared across test files).
const uniq = () => `${Date.now()}${Math.floor(Math.random() * 1e6)}`

async function login(email: string, name: string): Promise<string> {
  const res = await api(
    '/api/auth/dev/login',
    { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, name }) },
    false,
  )
  return (res.headers.get('set-cookie') ?? '').split(';')[0]
}

function post(path: string, body: unknown = {}) {
  return api(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
}

async function createDoc(path: string, content: string) {
  return post('/api/docs', { path, content })
}

describe('maintenance API auth', () => {
  it('401s without auth', async () => {
    expect((await api('/api/maintenance/config', {}, false)).status).toBe(401)
  })
  it('403s for a member', async () => {
    const cookie = await login(`mm-${uniq()}@corp.example`, 'Member')
    expect((await api('/api/maintenance/config', { headers: { cookie } }, false)).status).toBe(403)
  })
})

describe('maintenance config', () => {
  it('returns the seeded singleton and round-trips a PUT', async () => {
    const got = await json(await api('/api/maintenance/config'))
    expect(got.ok).toBe(true)
    expect(typeof got.data.enabled).toBe('boolean')

    const put = await json(
      await api('/api/maintenance/config', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ staleDays: 42, checks: ['broken-link', 'orphan'] }),
      }),
    )
    expect(put.data.staleDays).toBe(42)
    expect(put.data.checks).toEqual(['broken-link', 'orphan'])

    // Restore a permissive config for the run test below.
    await api('/api/maintenance/config', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ staleDays: 180, checks: ['broken-link', 'orphan', 'stale', 'stub', 'naming'] }),
    })
  })
})

describe('maintenance run → suggestions lifecycle', () => {
  it('scans fixtures, files findings, applies a fix, and suppresses dismissals', async () => {
    const dept = `maint${uniq()}`
    const broken = `${dept}/broken.md`
    const orphan = `${dept}/orphan.md`
    const old = `${dept}/old.md`

    expect((await createDoc(broken, `# Broken\n\nSee [missing](no-such-${uniq()}.md).\n${'body '.repeat(60)}`)).status).toBe(200)
    expect((await createDoc(orphan, `# Orphan\n\n${'standalone content '.repeat(20)}`)).status).toBe(200)
    expect((await createDoc(old, `# Old\n\n${'aged content '.repeat(20)}`)).status).toBe(200)

    // Backdate the "old" page so the stale check trips (threshold 30 days).
    const past = new Date(Date.now() - 400 * 24 * 60 * 60 * 1000)
    utimesSync(join(docsRoot(), old), past, past)

    // Scope the run to this department + a low stale threshold.
    await api('/api/maintenance/config', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ scopeDepts: [dept], staleDays: 30, maxSuggestions: 500 }),
    })

    const run1 = await json(await post('/api/maintenance/run'))
    expect(run1.ok).toBe(true)
    expect(run1.data.scanned).toBe(3)
    expect(run1.data.found).toBeGreaterThanOrEqual(3)

    const list = (await json(await api(`/api/maintenance/suggestions?dept=${dept}`))).data as Array<{
      id: number
      check: string
      kind: string
      path: string
      status: string
    }>
    const brokenSug = list.find((s) => s.check === 'broken-link' && s.path === broken)
    const orphanSug = list.find((s) => s.check === 'orphan' && s.path === orphan)
    expect(brokenSug).toBeDefined()
    expect(orphanSug).toBeDefined()
    expect(list.some((s) => s.check === 'stale' && s.path === old)).toBe(true)

    // preview/apply is rejected on an advisory suggestion (orphan).
    expect((await post(`/api/maintenance/suggestions/${orphanSug!.id}/preview`)).status).toBe(400)

    // Apply a reviewed fix to the broken-link page (content suggestion). The LLM
    // isn't available in tests, so we supply the approved content directly —
    // exactly what the apply endpoint writes (preview is the only LLM step).
    const read = await json(await api(`/api/docs/read?path=${encodeURIComponent(broken)}`))
    const applied = await post(`/api/maintenance/suggestions/${brokenSug!.id}/apply`, {
      content: `# Broken\n\nThe link was removed.\n${'body '.repeat(60)}`,
      version: read.data.version,
    })
    expect(applied.status).toBe(200)
    expect((await json(applied)).data.status).toBe('applied')
    const reread = await json(await api(`/api/docs/read?path=${encodeURIComponent(broken)}`))
    expect(reread.data.content).toContain('The link was removed.')

    // Dismiss the orphan, re-run, and confirm it is NOT re-filed (suppression).
    expect((await post(`/api/maintenance/suggestions/${orphanSug!.id}/dismiss`)).status).toBe(200)
    await post('/api/maintenance/run')
    const openOrphans = (await json(await api(`/api/maintenance/suggestions?status=open&dept=${dept}`))).data as Array<{
      check: string
      path: string
    }>
    expect(openOrphans.some((s) => s.check === 'orphan' && s.path === orphan)).toBe(false)
  })
})
