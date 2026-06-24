import { LogOut, Settings } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router'
import { PuttyMascot } from '@/components/brand/PuttyMascot'
import { SettingsDialog } from '@/components/SettingsDialog'
import { Button } from '@/components/ui/button'
import { WikiNav } from '@/components/wiki/WikiNav'
import { useLogout, useMe } from '@/hooks/use-auth'
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
  const logout = useLogout()
  const [settingsOpen, setSettingsOpen] = useState(false)

  return (
    <div className="mt-auto shrink-0 border-t border-border p-3">
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
