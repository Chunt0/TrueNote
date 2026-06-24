import { describe, expect, it } from 'vitest'
import type { DocSummary } from '@/hooks/use-docs'
import { linkifyWikilinks } from './wikilinks'

const docs: DocSummary[] = [
  { path: 'runbooks/deploy-guide.md', title: 'Deploy guide', updatedAt: '', size: 0 },
]

describe('linkifyWikilinks', () => {
  it('resolves [[basename]] to a link using the page title', () => {
    expect(linkifyWikilinks('see [[deploy-guide]]', docs)).toBe(
      'see [Deploy guide](runbooks/deploy-guide.md)',
    )
  })

  it('honors an explicit [[target|label]]', () => {
    expect(linkifyWikilinks('see [[deploy-guide|the guide]]', docs)).toBe(
      'see [the guide](runbooks/deploy-guide.md)',
    )
  })

  it('leaves unresolved wikilinks as plain text', () => {
    expect(linkifyWikilinks('see [[missing-page]]', docs)).toBe('see missing-page')
  })
})
