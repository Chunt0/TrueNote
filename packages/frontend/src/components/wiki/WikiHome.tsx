import { FileText, GitCommitHorizontal } from 'lucide-react'
import { Link } from 'react-router'
import { PuttyMascot } from '@/components/brand/PuttyMascot'
import { Card } from '@/components/ui/card'
import { useActivity, useDocs } from '@/hooks/use-docs'
import { APP_NAME } from '@/lib/config'

// The wiki landing page (shown at "/" when no page is selected): a brief welcome,
// a git-backed activity feed (who changed what), and recently-edited pages.
export function WikiHome() {
  const { data: docs } = useDocs()
  const { data: activity } = useActivity()
  const recent = [...(docs ?? [])]
    .sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)))
    .slice(0, 6)

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6 sm:py-10">
      <div className="flex flex-col items-center text-center">
        <PuttyMascot size={48} glow />
        <h1 className="mt-3 text-2xl font-semibold lowercase tracking-tight">{APP_NAME}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Your team's internal wiki — {docs?.length ?? 0} page{docs?.length === 1 ? '' : 's'}. Pick a
          page from the sidebar, or create one with the + button.
        </p>
      </div>

      {activity && activity.length > 0 && (
        <div className="mt-10">
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Recent activity
          </h2>
          <ul className="space-y-1.5">
            {activity.slice(0, 12).map((a) => {
              const file = a.files[0]
              return (
                <li key={a.rev} className="flex items-start gap-2 text-sm">
                  <GitCommitHorizontal className="mt-0.5 size-4 shrink-0 text-primary/70" />
                  <div className="min-w-0">
                    {file ? (
                      <Link to={`/?path=${encodeURIComponent(file)}`} className="hover:underline">
                        {a.message}
                      </Link>
                    ) : (
                      <span>{a.message}</span>
                    )}
                    <span className="ml-2 text-xs text-muted-foreground">
                      {a.author} · {new Date(a.date).toLocaleString()}
                    </span>
                  </div>
                </li>
              )
            })}
          </ul>
        </div>
      )}

      {recent.length > 0 ? (
        <div className="mt-10">
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Recently edited
          </h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {recent.map((d) => (
              <Link key={d.path} to={`/?path=${encodeURIComponent(d.path)}`} className="block">
                <Card className="p-4 transition-colors hover:border-primary/50">
                  <div className="flex items-center gap-2 font-medium">
                    <FileText className="size-4 shrink-0 text-primary" />
                    <span className="truncate">{d.title}</span>
                  </div>
                  <div className="mt-1 truncate font-mono text-xs text-muted-foreground">{d.path}</div>
                  <div className="mt-2 text-xs text-muted-foreground">
                    Edited {new Date(d.updatedAt).toLocaleString()}
                  </div>
                </Card>
              </Link>
            ))}
          </div>
        </div>
      ) : (
        <p className="mt-10 text-center text-sm text-muted-foreground">
          No pages yet — create your first one with the + button in the sidebar.
        </p>
      )}
    </div>
  )
}
