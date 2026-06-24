import { describe, expect, it } from 'bun:test'
import { fixCitationLinks, stripEmojis } from '../lib/agent'
import { createDoc } from '../lib/docstore'

describe('stripEmojis (no-emoji policy)', () => {
  it('removes emoji and pictographs', () => {
    expect(stripEmojis('Hello 👋 world 🐾')).toBe('Hello world')
    expect(stripEmojis('## 🎓 Steps')).toBe('## Steps')
    expect(stripEmojis('done ✅')).toBe('done')
  })

  it('removes flag pairs and ZWJ sequences', () => {
    expect(stripEmojis('flag 🇺🇸 here')).toBe('flag here')
    expect(stripEmojis('family 👨‍👩‍👧 ok')).toBe('family ok')
  })

  it('preserves normal text and newlines', () => {
    expect(stripEmojis('line one\nline two')).toBe('line one\nline two')
    expect(stripEmojis('no emoji here')).toBe('no emoji here')
  })
})

describe('fixCitationLinks (correct citation URLs)', () => {
  const author = { name: 'T', email: 't@e.com' }

  it('rewrites a fabricated absolute URL to the real page path', () => {
    const dir = `cite-${Date.now()}`
    createDoc(`${dir}/deploy-guide`, '# Deploy', author)
    const out = fixCitationLinks(`See [Deploy](http://localhost:3000/docs/${dir}/deploy-guide).`)
    expect(out).toBe(`See [Deploy](${dir}/deploy-guide.md).`)
  })

  it('keeps a genuine external link', () => {
    const out = fixCitationLinks('Ref [ACME](https://acme.example/whatever-xyz-123).')
    expect(out).toBe('Ref [ACME](https://acme.example/whatever-xyz-123).')
  })

  it('neutralizes a broken local link with no matching page', () => {
    const out = fixCitationLinks('[ghostpage](http://localhost/nope/missing-zzz).')
    expect(out).toBe('ghostpage.')
  })
})
