import { History, Link as LinkIcon, Pencil, Save, Trash2, X } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router'
import { ErrorState } from '@/components/feedback/ErrorState'
import { LoadingState } from '@/components/feedback/LoadingState'
import { MarkdownView } from '@/components/MarkdownView'
import { ConfirmDialog } from '@/components/patterns/ConfirmDialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { toast } from '@/components/ui/sonner'
import { Textarea } from '@/components/ui/textarea'
import { HistoryDialog } from '@/components/wiki/HistoryDialog'
import {
  useBacklinks,
  useDeleteDoc,
  useDoc,
  useDocs,
  useRenameDoc,
  useUpdateDoc,
} from '@/hooks/use-docs'
import { linkifyWikilinks } from '@/lib/wikilinks'

// One page: rendered Markdown by default, with an Edit toggle that swaps in a
// textarea. Saves carry the version token (optimistic concurrency → 409 on a
// stale write). Rename/delete live here too.
export function DocPane({
  path,
  onDeleted,
  onRenamed,
}: {
  path: string
  onDeleted: () => void
  onRenamed: (newPath: string) => void
}) {
  const { data: doc, isLoading, error, refetch } = useDoc(path)
  const { data: allDocs } = useDocs()
  const { data: backlinks } = useBacklinks(path)
  const update = useUpdateDoc()
  const rename = useRenameDoc()
  const remove = useDeleteDoc()

  // Resolve [[wikilinks]] to real page links before rendering.
  const rendered = useMemo(
    () => linkifyWikilinks(doc?.content ?? '', allDocs ?? []),
    [doc?.content, allDocs],
  )

  const [editing, setEditing] = useState(false)
  const [content, setContent] = useState('')
  const [version, setVersion] = useState('')
  const [newPath, setNewPath] = useState(path)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [historyOpen, setHistoryOpen] = useState(false)

  // Resync (and leave edit mode) whenever the loaded page changes.
  useEffect(() => {
    if (doc) {
      setContent(doc.content)
      setVersion(doc.version)
      setNewPath(doc.path)
      setEditing(false)
    }
  }, [doc])

  if (isLoading) return <LoadingState />
  if (error || !doc)
    return (
      <ErrorState
        description={error instanceof Error ? error.message : 'Page not found.'}
        onRetry={() => refetch()}
      />
    )

  function handleSave() {
    if (!doc) return
    update.mutate(
      { path: doc.path, content, version },
      {
        onSuccess: (saved) => {
          setVersion(saved.version)
          setEditing(false)
          toast.success('Saved')
        },
        onError: (err) => {
          if (/changed since/i.test(err.message)) {
            toast.error('This page changed on disk. Reload to see the latest version.', {
              action: { label: 'Reload', onClick: () => refetch() },
            })
          } else {
            toast.error(err.message)
          }
        },
      },
    )
  }

  function handleRename() {
    if (!doc || newPath === doc.path || !newPath.trim()) return
    rename.mutate(
      { from: doc.path, to: newPath.trim() },
      {
        onSuccess: (moved) => {
          toast.success('Renamed')
          onRenamed(moved.path)
        },
        onError: (err) => toast.error(err.message),
      },
    )
  }

  function handleDelete() {
    if (!doc) return
    remove.mutate(doc.path, {
      onSuccess: () => {
        toast.success('Page moved to trash')
        setConfirmDelete(false)
        onDeleted()
      },
      onError: (err) => toast.error(err.message),
    })
  }

  const dirty = content !== doc.content

  return (
    <div className="flex h-full flex-col">
      <div className="mb-4 flex items-start justify-between gap-4">
        <div className="min-w-0 space-y-1">
          <h1 className="truncate text-2xl font-semibold tracking-tight">{doc.title}</h1>
          <p className="truncate font-mono text-xs text-muted-foreground">{doc.path}</p>
          <p className="truncate text-xs text-muted-foreground">
            {doc.lastEdit
              ? `Last edited by ${doc.lastEdit.author} · ${new Date(doc.lastEdit.date).toLocaleString()}`
              : `Last edited ${new Date(doc.updatedAt).toLocaleString()}`}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {editing ? (
            <>
              <Button
                variant="outline"
                onClick={() => {
                  setContent(doc.content)
                  setEditing(false)
                }}
              >
                <X /> Cancel
              </Button>
              <Button onClick={handleSave} disabled={!dirty || update.isPending}>
                <Save /> {update.isPending ? 'Saving…' : 'Save'}
              </Button>
            </>
          ) : (
            <>
              <Button
                variant="ghost"
                size="icon"
                aria-label="Page history"
                onClick={() => setHistoryOpen(true)}
              >
                <History />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                aria-label="Delete page"
                onClick={() => setConfirmDelete(true)}
              >
                <Trash2 />
              </Button>
              <Button onClick={() => setEditing(true)}>
                <Pencil /> Edit
              </Button>
            </>
          )}
        </div>
      </div>

      {editing ? (
        <div className="flex min-h-0 flex-1 flex-col gap-3">
          <div className="flex items-center gap-2">
            <Input
              aria-label="Page path"
              className="max-w-md font-mono text-xs"
              value={newPath}
              onChange={(e) => setNewPath(e.target.value)}
            />
            <Button
              variant="outline"
              size="sm"
              onClick={handleRename}
              disabled={newPath === doc.path || rename.isPending}
            >
              Rename / move
            </Button>
          </div>
          <Textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            spellCheck
            className="min-h-0 flex-1 w-full font-mono text-sm leading-relaxed"
            placeholder="Write Markdown…"
          />
        </div>
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto">
          <MarkdownView content={rendered} basePath={doc.path} />
          {backlinks && backlinks.length > 0 && (
            <div className="mt-8 border-t border-border pt-4">
              <h2 className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                <LinkIcon className="size-3.5" /> Linked from
              </h2>
              <ul className="space-y-1">
                {backlinks.map((b) => (
                  <li key={b.path}>
                    <Link
                      to={`/?path=${encodeURIComponent(b.path)}`}
                      className="text-sm text-primary hover:underline"
                    >
                      {b.title}
                    </Link>
                    <span className="ml-2 font-mono text-xs text-muted-foreground">{b.path}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      <HistoryDialog
        path={doc.path}
        open={historyOpen}
        onOpenChange={setHistoryOpen}
        onRestored={() => refetch()}
      />

      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title="Delete page?"
        description={`"${doc.title}" will be moved to trash (recoverable).`}
        confirmLabel="Delete"
        destructive
        onConfirm={handleDelete}
        isConfirming={remove.isPending}
      />
    </div>
  )
}
