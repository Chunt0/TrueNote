import { describe, expect, it } from 'bun:test'
import {
  createDoc,
  deleteDoc,
  listDocs,
  readDoc,
  searchDocs,
  slugifyPath,
  updateDoc,
} from '../lib/docstore'

const author = { name: 'Tester', email: 'tester@truenote.local' }
const uniq = () => `unit-${Date.now()}-${Math.floor(Math.random() * 1e6)}`

describe('docstore: path safety', () => {
  it('rejects parent-directory traversal', () => {
    expect(() => createDoc('../escape', 'x', author)).toThrow()
  })
  it('rejects absolute paths', () => {
    expect(() => createDoc('/etc/passwd', 'x', author)).toThrow()
  })
  it('rejects dotfile segments (.git/.trash)', () => {
    expect(() => createDoc('.git/config', 'x', author)).toThrow()
    expect(() => createDoc('.trash/x', 'x', author)).toThrow()
  })
})

describe('docstore: naming convention (slugifyPath)', () => {
  it('lowercases and converts spaces/underscores to dashes', () => {
    expect(slugifyPath('My Notes/Setup_Guide')).toBe('my-notes/setup-guide.md')
    expect(slugifyPath('Cat/How_To_Pet')).toBe('cat/how-to-pet.md')
  })
  it('collapses separators and trims dashes; strips accents', () => {
    expect(slugifyPath('  Déjà   Vu!! ')).toBe('deja-vu.md')
    expect(slugifyPath('a//b---c.md')).toBe('a/b-c.md')
  })
  it('keeps already-valid kebab paths unchanged', () => {
    expect(slugifyPath('runbooks/vpn-setup.md')).toBe('runbooks/vpn-setup.md')
  })
  it('still rejects traversal/absolute/reserved', () => {
    expect(() => slugifyPath('../escape')).toThrow()
    expect(() => slugifyPath('/etc/passwd')).toThrow()
    expect(() => slugifyPath('.trash/x')).toThrow()
  })
  it('createDoc stores the normalized path', () => {
    const created = createDoc(`Cap Dir ${Date.now()}/My Page`, '# hi', {
      name: 'T',
      email: 't@e.com',
    })
    expect(created.path).toMatch(/^cap-dir-\d+\/my-page\.md$/)
  })
})

describe('docstore: CRUD + versioning', () => {
  it('creates, reads, and normalizes the .md extension', () => {
    const path = `${uniq()}/page`
    const created = createDoc(path, '# Hello\n\nbody', author)
    expect(created.path).toBe(`${path}.md`)
    const read = readDoc(created.path)
    expect(read.content).toContain('Hello')
    expect(read.version).toBe(created.version)
  })

  it('refuses to create over an existing page', () => {
    const path = `${uniq()}/dupe.md`
    createDoc(path, 'one', author)
    expect(() => createDoc(path, 'two', author)).toThrow()
  })

  it('enforces optimistic concurrency on update', () => {
    const path = `${uniq()}/occ.md`
    const created = createDoc(path, 'v1', author)
    // Correct version succeeds and returns a new version.
    const updated = updateDoc(path, 'v2', created.version, author)
    expect(updated.content).toBe('v2')
    expect(updated.version).not.toBe(created.version)
    // The old (stale) version now conflicts.
    expect(() => updateDoc(path, 'v3', created.version, author)).toThrow()
  })

  it('uses a frontmatter title when present', () => {
    const path = `${uniq()}/titled.md`
    const created = createDoc(path, '---\ntitle: Custom Title\n---\nbody', author)
    expect(created.title).toBe('Custom Title')
  })
})

describe('docstore: search + delete', () => {
  it('finds pages by content and hides trashed ones', () => {
    const dir = uniq()
    const needle = `zzx${Date.now()}`
    const path = `${dir}/findme.md`
    createDoc(path, `nothing special ${needle} here`, author)
    const hits = searchDocs(needle)
    expect(hits.some((h) => h.path === path)).toBe(true)

    deleteDoc(path, author)
    expect(listDocs().some((d) => d.path === path)).toBe(false)
    expect(searchDocs(needle).some((h) => h.path === path)).toBe(false)
  })

  it('tolerates typos (fuzzy match) and reports terms to highlight', () => {
    const dir = uniq()
    const path = `${dir}/enroll.md`
    createDoc(path, '# Enrollment\n\nHow to enroll a new student in the system.', author)
    const hits = searchDocs('studnet') // typo of "student"
    const hit = hits.find((h) => h.path === path)
    expect(hit).toBeDefined()
    // The actual word ("student") is reported for highlighting, not the typo.
    expect(hit?.terms).toContain('student')
  })
})
