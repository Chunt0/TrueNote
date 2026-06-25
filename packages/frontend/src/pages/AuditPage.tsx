import { FileText, GitCommitHorizontal } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { EmptyState } from '@/components/feedback/EmptyState'
import { ErrorState } from '@/components/feedback/ErrorState'
import { LoadingState } from '@/components/feedback/LoadingState'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useIsAdmin } from '@/hooks/use-auth'
import { type AuditEntry, useAudit } from '@/hooks/use-admin'
import { useDocs } from '@/hooks/use-docs'

const PAGE_SIZE = 25

// Admin-only audit trail: the full git-backed change history (who/what/when, with
// commit hashes), fully searchable, plus a recently-edited overview. Every change
// is traceable to a page (open it to see per-page History + diffs).
export default function AuditPage() {
  const isAdmin = useIsAdmin()
  const { data: entries, isLoading, isError, refetch } = useAudit()
  const { data: docs } = useDocs()
  const [q, setQ] = useState('')
  const [author, setAuthor] = useState('all')
  const [page, setPage] = useState(1)

  useEffect(() => setPage(1), [q, author, entries?.length])

  if (!isAdmin) {
    return <EmptyState title="Admins only" description="The audit log is restricted to administrators." />
  }

  const all = entries ?? []
  const authors = [...new Set(all.map((e) => e.author))].sort()
  const needle = q.trim().toLowerCase()
  const filtered = all.filter((e) => {
    if (author !== 'all' && e.author !== author) return false
    if (!needle) return true
    return (
      e.message.toLowerCase().includes(needle) ||
      e.author.toLowerCase().includes(needle) ||
      e.rev.toLowerCase().includes(needle) ||
      e.files.some((f) => f.toLowerCase().includes(needle))
    )
  })
  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const current = Math.min(page, pageCount)
  const shown = filtered.slice((current - 1) * PAGE_SIZE, current * PAGE_SIZE)

  const recent = [...(docs ?? [])]
    .sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)))
    .slice(0, 6)

  return (
    <div className="flex h-full flex-col">
      <header className="shrink-0 border-b border-border px-4 py-4 sm:px-6">
        <div className="mx-auto flex max-w-4xl flex-col gap-3">
          <div>
            <h1 className="text-xl font-semibold tracking-tight">Audit log</h1>
            <p className="text-sm text-muted-foreground">
              Every change to the wiki, who made it, and when — backed by git history. Open a page to
              see its full per-page history and diffs.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Input
              placeholder="Search message, author, file, or commit…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              className="h-8 w-full max-w-xs"
            />
            <Select value={author} onValueChange={setAuthor}>
              <SelectTrigger className="h-8 w-auto gap-1.5 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All authors</SelectItem>
                {authors.map((a) => (
                  <SelectItem key={a} value={a}>
                    {a}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <span className="ml-auto text-xs text-muted-foreground">{filtered.length} change(s)</span>
          </div>
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-5 sm:px-6">
        <div className="mx-auto max-w-4xl space-y-8">
          {/* Recently edited overview */}
          {recent.length > 0 ? (
            <section>
              <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Recently edited
              </h2>
              <div className="grid gap-3 sm:grid-cols-2">
                {recent.map((d) => (
                  <Link key={d.path} to={`/?path=${encodeURIComponent(d.path)}`} className="block">
                    <div className="rounded-lg border border-border p-3 transition-colors hover:border-primary/50">
                      <div className="flex items-center gap-2 font-medium">
                        <FileText className="size-4 shrink-0 text-primary" />
                        <span className="truncate">{d.title}</span>
                      </div>
                      <div className="mt-1 truncate font-mono text-xs text-muted-foreground">{d.path}</div>
                      <div className="mt-1 text-xs text-muted-foreground">
                        {new Date(d.updatedAt).toLocaleString()}
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            </section>
          ) : null}

          {/* Change history (the audit trail) */}
          <section>
            <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Change history
            </h2>
            {isLoading ? (
              <LoadingState />
            ) : isError ? (
              <ErrorState onRetry={() => refetch()} />
            ) : all.length === 0 ? (
              <EmptyState
                title="No history yet"
                description="Changes appear here once git versioning records them."
              />
            ) : filtered.length === 0 ? (
              <EmptyState title="No matches" description="No changes match your search." />
            ) : (
              <>
                <ul className="space-y-2">
                  {shown.map((e) => (
                    <AuditRow key={e.rev} e={e} />
                  ))}
                </ul>
                {pageCount > 1 ? (
                  <div className="mt-4 flex items-center justify-between border-t border-border pt-3 text-sm">
                    <span className="text-muted-foreground">
                      {(current - 1) * PAGE_SIZE + 1}–{Math.min(current * PAGE_SIZE, filtered.length)} of{' '}
                      {filtered.length}
                    </span>
                    <div className="flex items-center gap-2">
                      <Button size="sm" variant="outline" disabled={current <= 1} onClick={() => setPage(current - 1)}>
                        Prev
                      </Button>
                      <span className="text-muted-foreground">
                        {current} / {pageCount}
                      </span>
                      <Button size="sm" variant="outline" disabled={current >= pageCount} onClick={() => setPage(current + 1)}>
                        Next
                      </Button>
                    </div>
                  </div>
                ) : null}
              </>
            )}
          </section>
        </div>
      </div>
    </div>
  )
}

function AuditRow({ e }: { e: AuditEntry }) {
  return (
    <li className="rounded-lg border border-border p-3">
      <div className="flex items-start gap-2">
        <GitCommitHorizontal className="mt-0.5 size-4 shrink-0 text-primary/70" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="text-sm font-medium">{e.message}</span>
            <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground">
              {e.rev.slice(0, 8)}
            </code>
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
            <Badge variant="outline">{e.author}</Badge>
            <span>{new Date(e.date).toLocaleString()}</span>
          </div>
          {e.files.length > 0 ? (
            <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5">
              {e.files.map((f) => (
                <Link
                  key={f}
                  to={`/?path=${encodeURIComponent(f)}`}
                  className="truncate font-mono text-xs text-primary hover:underline"
                >
                  {f}
                </Link>
              ))}
            </div>
          ) : null}
        </div>
      </div>
    </li>
  )
}
