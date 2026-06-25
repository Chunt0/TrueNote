import { Clock, Play, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { EmptyState } from '@/components/feedback/EmptyState'
import { ErrorState } from '@/components/feedback/ErrorState'
import { LoadingState } from '@/components/feedback/LoadingState'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { toast } from '@/components/ui/sonner'
import { useIsAdmin } from '@/hooks/use-auth'
import {
  type Suggestion,
  useApplyFix,
  useDismissSuggestion,
  usePreviewFix,
  useRunMaintenance,
  useSnoozeSuggestion,
  useSuggestions,
} from '@/hooks/use-maintenance'

const CONFIDENCE: Record<string, 'destructive' | 'secondary' | 'outline'> = {
  high: 'destructive',
  medium: 'secondary',
  low: 'outline',
}
const PAGE_SIZE = 10
const SHARED = '__shared__'

interface PreviewState {
  sug: Suggestion
  current: string
  proposed: string
  version: string
}

export default function MaintenancePage() {
  const isAdmin = useIsAdmin()
  const [status, setStatus] = useState<'open' | 'all'>('open')
  const [checkF, setCheckF] = useState('all')
  const [confF, setConfF] = useState('all')
  const [deptF, setDeptF] = useState('all')
  const [page, setPage] = useState(1)
  const [diff, setDiff] = useState<PreviewState | null>(null)

  const { data: suggestions, isLoading, isError, refetch } = useSuggestions({
    status: status === 'all' ? undefined : 'open',
  })
  const run = useRunMaintenance()
  const preview = usePreviewFix()
  const apply = useApplyFix()
  const dismiss = useDismissSuggestion()
  const snooze = useSnoozeSuggestion()

  // Reset to the first page whenever the result set or filters change.
  useEffect(() => setPage(1), [status, checkF, confF, deptF, suggestions?.length])

  if (!isAdmin) {
    return <EmptyState title="Admins only" description="The maintenance review is restricted to administrators." />
  }

  const all = suggestions ?? []
  const checkOpts = [...new Set(all.map((s) => s.check))].sort()
  const deptOpts = [...new Set(all.map((s) => s.department ?? SHARED))].sort()

  const filtered = all.filter(
    (s) =>
      (checkF === 'all' || s.check === checkF) &&
      (confF === 'all' || s.confidence === confF) &&
      (deptF === 'all' || (s.department ?? SHARED) === deptF),
  )
  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const current = Math.min(page, pageCount)
  const shown = filtered.slice((current - 1) * PAGE_SIZE, current * PAGE_SIZE)

  function runNow() {
    run.mutate(undefined, {
      onSuccess: (r) => toast.success(`Run complete — ${r.found} new suggestion(s)`),
      onError: (e: Error) => toast.error(e.message),
    })
  }
  function openPreview(sug: Suggestion) {
    preview.mutate(sug.id, {
      onSuccess: (p) => setDiff({ sug, current: p.current, proposed: p.proposed, version: p.version }),
      onError: (e: Error) => toast.error(e.message),
    })
  }
  function confirmApply() {
    if (!diff) return
    apply.mutate(
      { id: diff.sug.id, content: diff.proposed, version: diff.version },
      {
        onSuccess: () => {
          toast.success('Fix applied')
          setDiff(null)
        },
        onError: (e: Error) => toast.error(e.message),
      },
    )
  }

  return (
    <div className="flex h-full flex-col">
      {/* Fixed header + filters */}
      <header className="shrink-0 border-b border-border px-4 py-4 sm:px-6">
        <div className="mx-auto flex max-w-4xl flex-col gap-3">
          <div className="flex items-center gap-3">
            <div className="flex-1">
              <h1 className="text-xl font-semibold tracking-tight">Maintenance</h1>
              <p className="text-sm text-muted-foreground">
                Findings from the wiki-maintenance agent. Apply a fix as a reviewed diff, or dismiss a false
                positive (it won't come back).
              </p>
            </div>
            <Button variant="outline" size="sm" onClick={runNow} disabled={run.isPending}>
              <Play /> {run.isPending ? 'Running…' : 'Run checks now'}
            </Button>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1 rounded-md border border-border p-0.5 text-sm">
              {(['open', 'all'] as const).map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setStatus(s)}
                  className={`rounded px-2.5 py-1 capitalize ${status === s ? 'bg-primary/10 text-foreground' : 'text-muted-foreground'}`}
                >
                  {s}
                </button>
              ))}
            </div>

            <FilterSelect value={checkF} onChange={setCheckF} allLabel="All checks" options={checkOpts.map((c) => [c, c])} />
            <FilterSelect
              value={confF}
              onChange={setConfF}
              allLabel="Any confidence"
              options={[['high', 'high'], ['medium', 'medium'], ['low', 'low']]}
            />
            {deptOpts.length > 0 ? (
              <FilterSelect
                value={deptF}
                onChange={setDeptF}
                allLabel="All departments"
                options={deptOpts.map((d) => [d, d === SHARED ? 'Shared' : d])}
              />
            ) : null}

            <span className="ml-auto text-xs text-muted-foreground">{filtered.length} suggestion(s)</span>
          </div>
        </div>
      </header>

      {/* Scrollable body */}
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-5 sm:px-6">
        <div className="mx-auto max-w-4xl">
          {isLoading ? (
            <LoadingState />
          ) : isError ? (
            <ErrorState onRetry={() => refetch()} />
          ) : filtered.length === 0 ? (
            <EmptyState
              title="Nothing to review"
              description={
                all.length === 0
                  ? status === 'open'
                    ? 'No open suggestions. Run the checks to scan the wiki.'
                    : 'No suggestions yet.'
                  : 'No suggestions match these filters.'
              }
            />
          ) : (
            <>
              <div className="space-y-2">
                {shown.map((s) => (
                  <SuggestionCard
                    key={s.id}
                    s={s}
                    busy={preview.isPending || dismiss.isPending || snooze.isPending}
                    onPreview={() => openPreview(s)}
                    onDismiss={() => dismiss.mutate(s.id, { onError: (e: Error) => toast.error(e.message) })}
                    onSnooze={() => snooze.mutate({ id: s.id, days: 30 }, { onError: (e: Error) => toast.error(e.message) })}
                  />
                ))}
              </div>

              {pageCount > 1 ? (
                <div className="mt-4 flex items-center justify-between border-t border-border pt-3 text-sm">
                  <span className="text-muted-foreground">
                    {(current - 1) * PAGE_SIZE + 1}–{Math.min(current * PAGE_SIZE, filtered.length)} of {filtered.length}
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
        </div>
      </div>

      <Dialog open={!!diff} onOpenChange={(o) => !o && setDiff(null)}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Review fix — {diff?.sug.path}</DialogTitle>
            <DialogDescription>{diff?.sug.detail}</DialogDescription>
          </DialogHeader>
          {diff ? (
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <div className="space-y-1">
                <span className="text-xs font-medium text-muted-foreground">Current</span>
                <pre className="h-56 overflow-auto whitespace-pre-wrap rounded-md border border-border bg-muted/40 p-2 text-xs md:h-72">
                  {diff.current}
                </pre>
              </div>
              <div className="space-y-1">
                <span className="text-xs font-medium text-muted-foreground">Proposed (editable)</span>
                <Textarea
                  value={diff.proposed}
                  onChange={(e) => setDiff({ ...diff, proposed: e.target.value })}
                  className="h-56 font-mono text-xs md:h-72"
                />
              </div>
            </div>
          ) : null}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDiff(null)}>
              Cancel
            </Button>
            <Button onClick={confirmApply} disabled={apply.isPending}>
              {apply.isPending ? 'Applying…' : 'Apply fix'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function FilterSelect({
  value,
  onChange,
  allLabel,
  options,
}: {
  value: string
  onChange: (v: string) => void
  allLabel: string
  options: [string, string][] // [value, label]
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="h-8 w-auto gap-1.5 text-sm">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="all">{allLabel}</SelectItem>
        {options.map(([v, label]) => (
          <SelectItem key={v} value={v}>
            {label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

function SuggestionCard({
  s,
  busy,
  onPreview,
  onDismiss,
  onSnooze,
}: {
  s: Suggestion
  busy: boolean
  onPreview: () => void
  onDismiss: () => void
  onSnooze: () => void
}) {
  return (
    <div className="rounded-lg border border-border p-3">
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge variant={CONFIDENCE[s.confidence] ?? 'outline'}>{s.confidence}</Badge>
            <Badge variant="outline">{s.check}</Badge>
            {s.department ? <Badge variant="outline">{s.department}</Badge> : null}
            {s.status !== 'open' ? <Badge variant="secondary">{s.status}</Badge> : null}
            <span className="text-sm font-medium">{s.title}</span>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">{s.detail}</p>
          {s.evidence ? (
            <code className="mt-1 block truncate text-xs text-muted-foreground">{s.evidence}</code>
          ) : null}
          <Link
            to={`/?path=${encodeURIComponent(s.path)}`}
            className="mt-1 inline-block text-xs text-primary hover:underline"
          >
            {s.path}
          </Link>
        </div>
        {s.status === 'open' ? (
          <div className="flex shrink-0 items-center gap-1">
            {s.kind === 'content' ? (
              <Button size="sm" variant="outline" onClick={onPreview} disabled={busy}>
                Preview & apply
              </Button>
            ) : null}
            <Button size="icon" variant="ghost" aria-label="Snooze 30 days" onClick={onSnooze} disabled={busy}>
              <Clock />
            </Button>
            <Button size="icon" variant="ghost" aria-label="Dismiss" onClick={onDismiss} disabled={busy}>
              <X />
            </Button>
          </div>
        ) : null}
      </div>
    </div>
  )
}
