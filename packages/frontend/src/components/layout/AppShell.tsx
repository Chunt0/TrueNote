import { Bot, Menu } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Outlet, useLocation } from 'react-router'
import { AssistantPanel } from '@/components/assistant/AssistantPanel'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { Sidebar } from './Sidebar'

// App frame: sidebar (nav + user) on the left, the active page in the middle,
// and a dockable Assistant panel on the right (toggled from the top bar).
// Responsive: on mobile the sidebar is an off-canvas drawer (hamburger toggles
// it) and the Assistant is a full-screen overlay; on md+ both are static columns.
export function AppShell() {
  const [open, setOpen] = useState(false)
  const [maximized, setMaximized] = useState(false)
  const [navOpen, setNavOpen] = useState(false)
  const location = useLocation()

  // Close the mobile nav drawer whenever navigation happens (e.g. picking a page).
  useEffect(() => setNavOpen(false), [location.key])

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Backdrop behind the mobile drawer. */}
      {navOpen && (
        <button
          type="button"
          aria-label="Close navigation"
          className="fixed inset-0 z-40 bg-black/50 md:hidden"
          onClick={() => setNavOpen(false)}
        />
      )}

      {/* Sidebar — static column on desktop, off-canvas drawer on mobile. */}
      <div
        className={cn(
          'fixed inset-y-0 left-0 z-50 shrink-0 transition-transform',
          'md:static md:z-auto md:translate-x-0 md:transition-none',
          navOpen ? 'translate-x-0' : '-translate-x-full',
        )}
      >
        <Sidebar />
      </div>

      {/* Main column — hidden when the Assistant is maximized (desktop only). */}
      {!maximized && (
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex h-11 shrink-0 items-center justify-between gap-2 border-b border-border px-3">
            <Button
              variant="ghost"
              size="icon"
              className="md:hidden"
              aria-label="Open navigation"
              onClick={() => setNavOpen(true)}
            >
              <Menu />
            </Button>
            <Button
              variant={open ? 'secondary' : 'ghost'}
              size="sm"
              className="ml-auto"
              aria-label="Toggle assistant"
              onClick={() => setOpen((o) => !o)}
            >
              <Bot /> Assistant
            </Button>
          </div>
          <main className="min-h-0 flex-1 overflow-hidden">
            <Outlet />
          </main>
        </div>
      )}

      {open && (
        <AssistantPanel
          maximized={maximized}
          onToggleMax={() => setMaximized((m) => !m)}
          onClose={() => {
            setOpen(false)
            setMaximized(false)
          }}
          className={cn(
            // Mobile: full-screen overlay. Desktop: docked column.
            'fixed inset-0 z-50 border-border md:static md:inset-auto md:z-auto md:border-l',
            maximized ? 'md:flex-1' : 'md:w-[420px] md:shrink-0',
          )}
        />
      )}
    </div>
  )
}
