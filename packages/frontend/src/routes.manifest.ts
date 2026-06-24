import { FileText } from 'lucide-react'
import { type ComponentType, lazy, type LazyExoticComponent } from 'react'

export interface RouteEntry {
  /** URL path. '/' is the index route. */
  path: string
  /** Sidebar label. */
  label: string
  /** Sidebar icon. */
  icon: ComponentType<{ className?: string }>
  /** Lazily-loaded page (default export). */
  Component: LazyExoticComponent<ComponentType>
  /** Routed but kept out of the sidebar nav (e.g. detail/editor pages). */
  hidden?: boolean
}

// ── The single source of truth for app pages ─────────────────────────────
// Add a page: append one entry here. router.tsx builds the routes from this
// list and Sidebar.tsx builds the nav from it — they cannot drift. (CLAUDE.md → step 5)
export const routes: RouteEntry[] = [
  { path: '/', label: 'Wiki', icon: FileText, Component: lazy(() => import('@/pages/WikiPage')) },
]
