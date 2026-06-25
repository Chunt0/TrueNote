import { PuttyMascot } from '@/components/brand/PuttyMascot'
import { useDocs } from '@/hooks/use-docs'
import { APP_NAME } from '@/lib/config'

// The wiki landing page (shown at "/" when no page is selected): a brief welcome.
// Change history + recently-edited live in the admin-only Audit log (pages/AuditPage).
export function WikiHome() {
  const { data: docs } = useDocs()

  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6 sm:py-16">
      <div className="flex flex-col items-center text-center">
        <PuttyMascot size={48} glow />
        <h1 className="mt-3 text-2xl font-semibold lowercase tracking-tight">{APP_NAME}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Your team's internal wiki — {docs?.length ?? 0} page{docs?.length === 1 ? '' : 's'}. Pick a
          page from the sidebar, or create one with the + button.
        </p>
      </div>
    </div>
  )
}
