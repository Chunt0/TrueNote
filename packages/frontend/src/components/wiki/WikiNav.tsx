import { FileText, Plus } from 'lucide-react'
import { type FormEvent, type ReactNode, useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router'
import { ErrorState } from '@/components/feedback/ErrorState'
import { LoadingState } from '@/components/feedback/LoadingState'
import { FormDialog } from '@/components/patterns/FormDialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { toast } from '@/components/ui/sonner'
import { SectionTree } from '@/components/wiki/SectionTree'
import { useCreateDoc, useDocs, useSearchDocs } from '@/hooks/use-docs'
import { cn } from '@/lib/utils'

// Mirror of the server's slugifyPath (lib/docstore.ts) for a live preview only —
// the server is the source of truth for the actual stored path.
function previewSlug(input: string): string {
  const segs = input
    .replace(/\\/g, '/')
    .replace(/\.md$/i, '')
    .split('/')
    .map((s) =>
      s
        .normalize('NFKD')
        .replace(/[̀-ͯ]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, ''),
    )
    .filter(Boolean)
  return segs.length ? `${segs.join('/')}.md` : ''
}

// The wiki's primary navigation, living in the app sidebar: section tree +
// filter + new page. Selecting a page routes to /?path=… (the WikiPage content).
export function WikiNav() {
  const { data: docs, isLoading, error, refetch } = useDocs()
  const create = useCreateDoc()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const selected = params.get('path')

  const [filter, setFilter] = useState('')
  const [query, setQuery] = useState('') // debounced filter
  const [newOpen, setNewOpen] = useState(false)
  const [newPath, setNewPath] = useState('')

  // Debounce so we don't grep on every keystroke.
  useEffect(() => {
    const id = setTimeout(() => setQuery(filter.trim()), 220)
    return () => clearTimeout(id)
  }, [filter])

  // Full-text search (title + path + content, ranked, with snippets) when there's
  // a query; otherwise browse the section tree.
  const searching = query.length > 0
  const { data: results, isFetching } = useSearchDocs(query)

  const open = (path: string) => navigate(`/?path=${encodeURIComponent(path)}`)

  function openNew(folder?: string) {
    setNewPath(folder ? `${folder}/` : '')
    setNewOpen(true)
  }

  function handleCreate(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const path = newPath.trim()
    if (!path) return
    const title = path.split('/').pop()!.replace(/\.md$/i, '')
    create.mutate(
      { path, content: `# ${title}\n\n` },
      {
        onSuccess: (doc) => {
          setNewOpen(false)
          setNewPath('')
          open(doc.path)
        },
        onError: (err) => toast.error(err.message),
      },
    )
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center justify-between px-4 pb-1">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Wiki</h2>
        <Button size="icon" variant="ghost" className="size-6" aria-label="New page" onClick={() => openNew()}>
          <Plus className="size-4" />
        </Button>
      </div>
      <div className="px-3 pb-2">
        <Input
          placeholder="Search title & contents…"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="h-8"
        />
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-2">
        {isLoading ? (
          <LoadingState />
        ) : error ? (
          <ErrorState
            description={error instanceof Error ? error.message : undefined}
            onRetry={() => refetch()}
          />
        ) : searching ? (
          <SearchResults results={results} loading={isFetching} active={selected} onSelect={open} />
        ) : (
          <SectionTree docs={docs ?? []} activePath={selected} onSelect={open} onAddPage={openNew} />
        )}
      </div>

      <FormDialog
        open={newOpen}
        onOpenChange={(o) => {
          setNewOpen(o)
          if (!o) setNewPath('')
        }}
        title="New page"
        description="Lowercase kebab-case, slashes for sections — e.g. runbooks/deploy-guide.md"
        onSubmit={handleCreate}
        submitLabel="Create"
        isSubmitting={create.isPending}
      >
        <div className="space-y-2">
          <Label htmlFor="path">Path</Label>
          <Input
            id="path"
            placeholder="runbooks/deploy-guide.md"
            value={newPath}
            onChange={(e) => setNewPath(e.target.value)}
            required
            autoFocus
          />
          {newPath.trim() && (
            <p className="font-mono text-xs text-muted-foreground">
              Saved as: {previewSlug(newPath) || '—'}
            </p>
          )}
        </div>
      </FormDialog>
    </div>
  )
}

// Wrap matched terms in <mark>. `terms` are the actual matched words (incl. the
// real word for fuzzy/typo hits), so highlighting lines up with what's shown.
function highlight(text: string, terms: string[]): ReactNode {
  if (!text || !terms.length) return text
  const set = new Set(terms.map((t) => t.toLowerCase()))
  const escaped = [...set].map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).filter(Boolean)
  if (!escaped.length) return text
  const re = new RegExp(`(${escaped.join('|')})`, 'gi')
  return text.split(re).map((part, i) =>
    set.has(part.toLowerCase()) ? (
      <mark key={i} className="rounded-sm bg-primary/25 text-foreground">
        {part}
      </mark>
    ) : (
      part
    ),
  )
}

// Flat, ranked search results with a matched-content snippet under each title.
function SearchResults({
  results,
  loading,
  active,
  onSelect,
}: {
  results: { path: string; title: string; snippet: string; terms: string[] }[] | undefined
  loading: boolean
  active: string | null
  onSelect: (path: string) => void
}) {
  if (!results) return loading ? <LoadingState /> : null
  if (results.length === 0) {
    return <p className="px-2 py-4 text-sm text-muted-foreground">No matches.</p>
  }
  return (
    <div className="space-y-0.5">
      {results.map((r) => {
        const isActive = r.path === active
        return (
          <button
            key={r.path}
            type="button"
            onClick={() => onSelect(r.path)}
            className={cn(
              'flex w-full flex-col gap-0.5 rounded-md px-2 py-1.5 text-left transition-colors',
              isActive ? 'bg-primary/10' : 'hover:bg-accent/60',
            )}
          >
            <span className="flex items-center gap-1.5 text-sm">
              <FileText className={cn('size-3.5 shrink-0', isActive ? 'text-primary' : 'opacity-50')} />
              <span className="truncate font-medium">{highlight(r.title, r.terms)}</span>
            </span>
            {r.snippet && (
              <span className="truncate pl-5 text-xs text-muted-foreground">
                {highlight(r.snippet, r.terms)}
              </span>
            )}
            <span className="truncate pl-5 font-mono text-[10px] text-muted-foreground/70">{r.path}</span>
          </button>
        )
      })}
    </div>
  )
}
