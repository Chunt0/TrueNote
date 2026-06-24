import type { DocSummary } from '@/hooks/use-docs'

// Resolve a wikilink target to a real page (by exact path, unique basename, or
// unique title slug) — mirrors the server resolver used for backlinks.
function makeResolver(docs: DocSummary[]): (ref: string) => DocSummary | null {
  const slug = (s: string) => s.toLowerCase().trim().replace(/[^\w\s-]/g, '').replace(/\s+/g, '-')
  const byPath = new Map<string, DocSummary>()
  const byBase = new Map<string, DocSummary[]>()
  const byTitle = new Map<string, DocSummary[]>()
  for (const d of docs) {
    const lc = d.path.toLowerCase()
    byPath.set(lc, d)
    byPath.set(lc.replace(/\.md$/, ''), d)
    const base = lc.split('/').pop()!.replace(/\.md$/, '')
    byBase.set(base, [...(byBase.get(base) ?? []), d])
    const ts = slug(d.title)
    byTitle.set(ts, [...(byTitle.get(ts) ?? []), d])
  }
  return (ref: string) => {
    const r = ref.trim().replace(/^\/+/, '').replace(/[#?].*$/, '').replace(/\/+$/, '')
    const lc = r.toLowerCase()
    let d = byPath.get(lc) || byPath.get(lc.replace(/\.md$/, ''))
    if (!d) {
      const m = byBase.get(lc.split('/').pop()!.replace(/\.md$/, ''))
      if (m?.length === 1) d = m[0]
    }
    if (!d) {
      const m = byTitle.get(slug(ref))
      if (m?.length === 1) d = m[0]
    }
    return d ?? null
  }
}

// Convert [[target]] / [[target|label]] into Markdown links to the resolved page.
// Resolved → [label or page title](path); unresolved → plain label text.
export function linkifyWikilinks(content: string, docs: DocSummary[]): string {
  if (!content.includes('[[')) return content
  const resolve = makeResolver(docs)
  return content.replace(/\[\[([^\]|]+)(?:\|([^\]]*))?\]\]/g, (_m, target: string, label?: string) => {
    const doc = resolve(target.trim())
    const text = (label ?? '').trim() || (doc ? doc.title : target.trim())
    return doc ? `[${text}](${doc.path})` : text
  })
}
