import { PuttyRunner } from '@/components/game/PuttyRunner'
import { useDocs } from '@/hooks/use-docs'
import { APP_NAME } from '@/lib/config'

// The wiki landing (shown at "/" when no page is selected): a fun little
// procedurally-generated platformer starring the putty-ai blob. Pick a page from
// the sidebar to start reading/writing. (Change history lives in the Audit log.)
export function WikiHome() {
  const { data: docs } = useDocs()
  return (
    <div className="relative h-full w-full">
      <PuttyRunner />
      <div className="pointer-events-none absolute left-0 right-0 top-0 flex items-center justify-center p-3">
        <p className="rounded-full bg-black/30 px-3 py-1 text-center text-xs text-white/80 backdrop-blur">
          <span className="lowercase">{APP_NAME}</span> — {docs?.length ?? 0} page{docs?.length === 1 ? '' : 's'}. Pick one
          from the sidebar, or take a stroll.
        </p>
      </div>
    </div>
  )
}
