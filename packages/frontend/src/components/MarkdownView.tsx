import DOMPurify from 'dompurify'
import { marked, type Tokens } from 'marked'
import { type MouseEvent, useMemo } from 'react'
import { useNavigate } from 'react-router'

// GitHub-style heading slug so in-doc TOC links like [x](#3-new-student) line up.
function slugifyHeading(s: string): string {
  return s
    .toLowerCase()
    .trim()
    .replace(/[^\w\- ]+/g, '')
    .replace(/\s+/g, '-')
}

marked.setOptions({ gfm: true, breaks: false })
marked.use({
  renderer: {
    heading(token: Tokens.Heading) {
      const text = this.parser.parseInline(token.tokens)
      const id = slugifyHeading(token.text)
      return `<h${token.depth} id="${id}">${text}</h${token.depth}>\n`
    },
  },
})

// Resolve a non-anchor, non-external href to a wiki page path (for ?path=).
function resolveInternal(href: string, basePath?: string): string | null {
  if (href.includes('?path=')) {
    try {
      return new URL(href, window.location.origin).searchParams.get('path')
    } catch {
      return null
    }
  }
  let h = href.replace(/^\.?\//, '') // strip leading ./ or /
  // Resolve relative links against the current doc's folder.
  if (basePath && !href.startsWith('/')) {
    const slash = basePath.lastIndexOf('/')
    const dir = slash >= 0 ? basePath.slice(0, slash) : ''
    h = dir ? `${dir}/${h}` : h
  }
  const parts: string[] = []
  for (const seg of h.split('/')) {
    if (seg === '..') parts.pop()
    else if (seg && seg !== '.') parts.push(seg)
  }
  return parts.join('/') || null
}

// Render Markdown → sanitized HTML. Content is authored by trusted team members,
// but we sanitize anyway. Themed by `.md-rendered` in tailwind.css. Links are
// handled SPA-side: #anchors scroll to the heading; wiki paths route to the page;
// external links open in a new tab. `basePath` (the current doc path) lets
// relative links resolve.
export function MarkdownView({ content, basePath }: { content: string; basePath?: string }) {
  const navigate = useNavigate()
  const html = useMemo(() => {
    const raw = marked.parse(content ?? '', { async: false }) as string
    return DOMPurify.sanitize(raw)
  }, [content])

  function onClick(e: MouseEvent<HTMLDivElement>) {
    const anchor = (e.target as HTMLElement).closest('a')
    if (!anchor) return
    const href = anchor.getAttribute('href')
    if (!href) return

    if (href.startsWith('#')) {
      e.preventDefault()
      const id = decodeURIComponent(href.slice(1))
      const el = e.currentTarget.querySelector(`#${CSS.escape(id)}`)
      el?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      return
    }
    if (/^[a-z][a-z0-9+.-]*:/i.test(href)) {
      // external (http:, https:, mailto:, …)
      e.preventDefault()
      window.open(href, '_blank', 'noopener,noreferrer')
      return
    }
    e.preventDefault()
    const path = resolveInternal(href, basePath)
    if (path) navigate(`/?path=${encodeURIComponent(path)}`)
  }

  return (
    <div className="md-rendered" onClick={onClick} dangerouslySetInnerHTML={{ __html: html }} />
  )
}
