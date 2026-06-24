import { describe, expect, it } from 'bun:test'
import { type Finding, runDeterministicChecks } from '../lib/checks'

// Pure unit tests for the deterministic backbone — synthetic docs + contents, no
// disk or DB. Each check is exercised on a fixture that should trip exactly it.
const ALL = new Set<string>(['broken-link', 'orphan', 'stale', 'stub', 'naming'])

function doc(path: string, updatedAt = new Date().toISOString()) {
  return { path, title: path.replace(/\.md$/, ''), updatedAt, size: 100 }
}

function run(docs: ReturnType<typeof doc>[], contents: Record<string, string>, staleDays = 180): Finding[] {
  return runDeterministicChecks({
    docs,
    contents: new Map(Object.entries(contents)),
    enabled: ALL,
    staleDays,
    now: Date.now(),
  })
}

describe('deterministic checks', () => {
  it('flags a broken internal link but not external/anchor links', () => {
    const docs = [doc('a.md')]
    const f = run(docs, {
      'a.md': '# A\n\n[gone](missing-page.md) [ext](https://example.com) [anchor](#top)\n\nbody '.repeat(10),
    })
    const broken = f.filter((x) => x.check === 'broken-link')
    expect(broken).toHaveLength(1)
    expect(broken[0].evidence).toBe('missing-page.md')
    expect(broken[0].kind).toBe('content')
  })

  it('flags an orphan but not a linked page', () => {
    const docs = [doc('hub.md'), doc('child.md')]
    const f = run(docs, {
      'hub.md': '# Hub\n\nSee [child](child.md).\n\n'.padEnd(300, 'x'),
      'child.md': '# Child\n\n'.padEnd(300, 'x'),
    })
    const orphans = f.filter((x) => x.check === 'orphan').map((x) => x.path)
    expect(orphans).toContain('hub.md') // nothing links to the hub
    expect(orphans).not.toContain('child.md') // hub links to child
  })

  it('flags a stale page past the threshold', () => {
    const old = new Date(Date.now() - 400 * 24 * 60 * 60 * 1000).toISOString()
    const f = run([doc('old.md', old)], { 'old.md': '# Old\n\n'.padEnd(300, 'x') }, 180)
    expect(f.some((x) => x.check === 'stale' && x.path === 'old.md')).toBe(true)
  })

  it('flags stubs (too short / placeholder markers)', () => {
    const f = run([doc('short.md'), doc('todo.md')], {
      'short.md': '# Short',
      'todo.md': '# Todo\n\nTODO: write this section.\n\n'.padEnd(300, 'x'),
    })
    const stubs = f.filter((x) => x.check === 'stub').map((x) => x.path)
    expect(stubs).toContain('short.md')
    expect(stubs).toContain('todo.md')
  })

  it('flags a non-kebab page name with the canonical form', () => {
    const f = run([doc('Bad_Name.md')], { 'Bad_Name.md': '# Bad\n\n'.padEnd(300, 'x') })
    const naming = f.find((x) => x.check === 'naming')
    expect(naming?.evidence).toBe('bad-name.md')
  })

  it('respects the enabled set (disabled checks produce nothing)', () => {
    const findings = runDeterministicChecks({
      docs: [doc('a.md')],
      contents: new Map([['a.md', '# A [x](missing.md)']]),
      enabled: new Set<string>(['orphan']), // broken-link disabled
      staleDays: 180,
      now: Date.now(),
    })
    expect(findings.some((x) => x.check === 'broken-link')).toBe(false)
    expect(findings.some((x) => x.check === 'orphan')).toBe(true)
  })
})
