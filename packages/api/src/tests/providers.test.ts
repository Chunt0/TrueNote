import { describe, expect, it } from 'bun:test'
import { api, json } from './helpers'

const post = (path: string, body: unknown, auth = true) =>
  api(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }, auth)

describe('providers API', () => {
  it('401s without auth', async () => {
    const res = await api('/api/providers', {}, false)
    expect(res.status).toBe(401)
  })

  it('creates, redacts the key, sets default, updates, and deletes', async () => {
    // Create — first provider auto-becomes default.
    const created = await json(
      await post('/api/providers', {
        name: 'Claude',
        kind: 'anthropic',
        model: 'claude-sonnet-4-6',
        apiKey: 'sk-secret-should-not-leak',
      }),
    )
    expect(created.ok).toBe(true)
    expect(created.data.isDefault).toBe(true)
    expect(created.data.hasKey).toBe(true)
    // The secret must never be returned to the client.
    expect(JSON.stringify(created.data)).not.toContain('sk-secret')
    expect('apiKey' in created.data).toBe(false)
    const id = created.data.id as number

    // List is also redacted.
    const list = await json(await api('/api/providers'))
    expect(list.data.some((p: { id: number }) => p.id === id)).toBe(true)
    expect(JSON.stringify(list.data)).not.toContain('sk-secret')

    // Add a second provider and make it default.
    const second = await json(
      await post('/api/providers', {
        name: 'Local',
        kind: 'openai',
        model: 'llama3.1',
        baseUrl: 'http://localhost:11434/v1',
        isDefault: true,
      }),
    )
    expect(second.data.isDefault).toBe(true)
    // The first one is no longer default.
    const afterDefault = await json(await api('/api/providers'))
    expect(afterDefault.data.find((p: { id: number }) => p.id === id).isDefault).toBe(false)

    // Update the first without an apiKey → keeps the existing key (hasKey stays true).
    const updated = await json(
      await api(`/api/providers/${id}`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: 'Claude (prod)', kind: 'anthropic', model: 'claude-opus-4-8' }),
      }),
    )
    expect(updated.data.name).toBe('Claude (prod)')
    expect(updated.data.hasKey).toBe(true)

    // Delete the second; the first should be promoted back to default.
    const del = await api(`/api/providers/${second.data.id}`, { method: 'DELETE' })
    expect(del.status).toBe(200)
    const finalList = await json(await api('/api/providers'))
    expect(finalList.data.find((p: { id: number }) => p.id === id).isDefault).toBe(true)
  })

  it('persists detected models (availableModels round-trips, redacted)', async () => {
    const created = await json(
      await post('/api/providers', {
        name: 'WithModels',
        kind: 'anthropic',
        model: 'claude-sonnet-4-6',
        availableModels: ['claude-sonnet-4-6', 'claude-opus-4-8'],
      }),
    )
    expect(created.data.availableModels).toEqual(['claude-sonnet-4-6', 'claude-opus-4-8'])
  })
})

describe('providers detect', () => {
  it('401s without auth', async () => {
    const res = await post('/api/providers/detect', { kind: 'anthropic' }, false)
    expect(res.status).toBe(401)
  })

  it('returns the Anthropic fallback list when no key is supplied (no network)', async () => {
    const res = await json(await post('/api/providers/detect', { kind: 'anthropic' }))
    expect(res.ok).toBe(true)
    expect(Array.isArray(res.data.models)).toBe(true)
    expect(res.data.models.length).toBeGreaterThan(0)
  })
})
