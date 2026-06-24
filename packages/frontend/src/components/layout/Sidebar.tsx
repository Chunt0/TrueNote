import { LogOut, Settings, ShieldCheck } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router'
import { PuttyMascot } from '@/components/brand/PuttyMascot'
import { SettingsDialog } from '@/components/SettingsDialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { WikiNav } from '@/components/wiki/WikiNav'
import { useIsAdmin, useLogout, useMe } from '@/hooks/use-auth'
import { useSuggestions } from '@/hooks/use-maintenance'
import { APP_NAME } from '@/lib/config'

// Single full-height left sidebar: brand, the wiki tree (primary navigation),
// and the signed-in user + settings + sign-out pinned to the bottom.
export function Sidebar() {
  return (
    <aside className="flex h-screen w-64 shrink-0 flex-col border-r border-border bg-card">
      <Link to="/" className="flex h-14 shrink-0 items-center gap-2.5 px-4 hover:opacity-80">
        <PuttyMascot size={24} glow />
        <span className="text-base font-bold lowercase tracking-tight">{APP_NAME}</span>
      </Link>

      <WikiNav />

      <SidebarFooter />
    </aside>
  )
}

function initials(name?: string): string {
  if (!name) return '?'
  const parts = name.trim().split(/\s+/)
  return ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')).toUpperCase() || '?'
}

function SidebarFooter() {
  const { data: me } = useMe()
  const isAdmin = useIsAdmin()
  const logout = useLogout()
  const [settingsOpen, setSettingsOpen] = useState(false)

  return (
    <div className="mt-auto shrink-0 border-t border-border p-3">
      {isAdmin ? <MaintenanceLink /> : null}
      <div className="flex items-center gap-2">
        <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/15 text-xs font-semibold text-primary">
          {initials(me?.user?.name)}
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium">{me?.user?.name ?? '—'}</div>
          <div className="truncate text-xs text-muted-foreground">{me?.user?.email ?? ''}</div>
        </div>
        <Button size="icon" variant="ghost" aria-label="Settings" onClick={() => setSettingsOpen(true)}>
          <Settings />
        </Button>
        <Button size="icon" variant="ghost" aria-label="Sign out" onClick={() => logout.mutate()}>
          <LogOut />
        </Button>
      </div>
      <SettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} />
    </div>
  )
}

// Admin-only entry point to the maintenance review, with an open-count badge.
function MaintenanceLink() {
  const { data: open } = useSuggestions({ status: 'open' })
  const count = open?.length ?? 0
  return (
    <Link
      to="/maintenance"
      className="mb-2 flex items-center gap-2 rounded-md px-2 py-1.5 text-sm text-muted-foreground hover:bg-accent/60 hover:text-foreground"
    >
      <ShieldCheck className="size-4 shrink-0 opacity-70" />
      <span className="flex-1">Maintenance</span>
      {count > 0 ? <Badge variant="secondary">{count}</Badge> : null}
    </Link>
  )
}
