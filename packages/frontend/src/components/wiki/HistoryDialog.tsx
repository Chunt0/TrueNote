import { useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { toast } from '@/components/ui/sonner'
import { type DocVersion, useDocDiff, useDocHistory, useRestoreDoc } from '@/hooks/use-docs'
import { cn } from '@/lib/utils'

// Per-line diff coloring (unified patch from git).
function DiffView({ patch }: { patch: string }) {
  if (!patch.trim()) {
    return <p className="p-3 text-sm text-muted-foreground">No differences from the current version.</p>
  }
  return (
    <pre className="overflow-x-auto rounded-md border border-border bg-surface-3 p-3 text-xs leading-relaxed">
      {patch.split('\n').map((line, i) => {
        const c = line.startsWith('+') && !line.startsWith('+++')
          ? 'text-success'
          : line.startsWith('-') && !line.startsWith('---')
            ? 'text-destructive'
            : line.startsWith('@@')
              ? 'text-primary'
              : 'text-muted-foreground'
        return (
          <div key={i} className={cn('whitespace-pre-wrap font-mono', c)}>
            {line || ' '}
          </div>
        )
      })}
    </pre>
  )
}

export function HistoryDialog({
  path,
  open,
  onOpenChange,
  onRestored,
}: {
  path: string
  open: boolean
  onOpenChange: (o: boolean) => void
  onRestored: () => void
}) {
  const { data: history, isLoading } = useDocHistory(path, open)
  const [selected, setSelected] = useState<DocVersion | null>(null)
  const { data: diff, isFetching: diffLoading } = useDocDiff(path, selected?.rev ?? null)
  const restore = useRestoreDoc()

  function handleRestore() {
    if (!selected) return
    restore.mutate(
      { path, rev: selected.rev },
      {
        onSuccess: () => {
          toast.success('Restored')
          onOpenChange(false)
          setSelected(null)
          onRestored()
        },
        onError: (err) => toast.error(err.message),
      },
    )
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) setSelected(null)
        onOpenChange(o)
      }}
    >
      <DialogContent className="max-w-3xl gap-0 overflow-hidden p-0">
        <DialogHeader className="border-b border-border p-4">
          <DialogTitle>Page history</DialogTitle>
          <DialogDescription className="truncate font-mono text-xs">{path}</DialogDescription>
        </DialogHeader>
        <div className="flex h-[500px]">
          {/* Versions list */}
          <div className="w-64 shrink-0 overflow-y-auto border-r border-border p-2">
            {isLoading ? (
              <p className="p-2 text-sm text-muted-foreground">Loading…</p>
            ) : history && history.length > 0 ? (
              history.map((v) => (
                <button
                  key={v.rev}
                  type="button"
                  onClick={() => setSelected(v)}
                  className={cn(
                    'flex w-full flex-col gap-0.5 rounded-md px-2 py-1.5 text-left text-sm transition-colors',
                    selected?.rev === v.rev ? 'bg-primary/10' : 'hover:bg-accent/60',
                  )}
                >
                  <span className="truncate font-medium">{v.message}</span>
                  <span className="truncate text-xs text-muted-foreground">
                    {v.author} · {new Date(v.date).toLocaleString()}
                  </span>
                </button>
              ))
            ) : (
              <p className="p-2 text-sm text-muted-foreground">
                No history yet (git versioning may be off).
              </p>
            )}
          </div>
          {/* Diff + restore */}
          <div className="flex min-w-0 flex-1 flex-col">
            <div className="min-h-0 flex-1 overflow-y-auto p-3">
              {!selected ? (
                <p className="text-sm text-muted-foreground">
                  Select a version to see what changed since, and to restore it.
                </p>
              ) : diffLoading ? (
                <p className="text-sm text-muted-foreground">Loading diff…</p>
              ) : (
                <DiffView patch={diff?.diff ?? ''} />
              )}
            </div>
            {selected && (
              <div className="flex items-center justify-between gap-2 border-t border-border p-3">
                <span className="text-xs text-muted-foreground">
                  Restoring overwrites the current page (kept in history).
                </span>
                <Button onClick={handleRestore} disabled={restore.isPending}>
                  {restore.isPending ? 'Restoring…' : 'Restore this version'}
                </Button>
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
