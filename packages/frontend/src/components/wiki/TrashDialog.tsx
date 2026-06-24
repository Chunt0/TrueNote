import { FileText, RotateCcw, Trash2 } from 'lucide-react'
import { useNavigate } from 'react-router'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { toast } from '@/components/ui/sonner'
import { usePurgeTrash, useRestoreFromTrash, useTrash } from '@/hooks/use-docs'

// Browse deleted pages (moved to .trash/) and restore or permanently delete them.
export function TrashDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const { data: items, isLoading } = useTrash(open)
  const restore = useRestoreFromTrash()
  const purge = usePurgeTrash()
  const navigate = useNavigate()

  function handleRestore(id: string) {
    restore.mutate(id, {
      onSuccess: (doc) => {
        toast.success(`Restored to ${doc.path}`)
        onOpenChange(false)
        navigate(`/?path=${encodeURIComponent(doc.path)}`)
      },
      onError: (err) => toast.error(err.message),
    })
  }

  function handlePurge(id: string) {
    purge.mutate(id, {
      onSuccess: () => toast.success('Permanently deleted'),
      onError: (err) => toast.error(err.message),
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Trash</DialogTitle>
          <DialogDescription>Deleted pages are recoverable here.</DialogDescription>
        </DialogHeader>
        <div className="max-h-[60vh] space-y-1 overflow-y-auto">
          {isLoading ? (
            <p className="p-2 text-sm text-muted-foreground">Loading…</p>
          ) : items && items.length > 0 ? (
            items.map((it) => (
              <div
                key={it.id}
                className="flex items-center justify-between gap-3 rounded-md border border-border p-2.5"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5 text-sm font-medium">
                    <FileText className="size-3.5 shrink-0 opacity-50" />
                    <span className="truncate font-mono text-xs">{it.path}</span>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    Deleted {new Date(it.deletedAt).toLocaleString()}
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleRestore(it.id)}
                    disabled={restore.isPending}
                  >
                    <RotateCcw /> Restore
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    aria-label={`Permanently delete ${it.path}`}
                    onClick={() => handlePurge(it.id)}
                    disabled={purge.isPending}
                  >
                    <Trash2 />
                  </Button>
                </div>
              </div>
            ))
          ) : (
            <p className="p-2 text-sm text-muted-foreground">Trash is empty.</p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
