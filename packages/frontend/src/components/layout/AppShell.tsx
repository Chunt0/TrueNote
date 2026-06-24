import { Bot } from 'lucide-react'
import { useState } from 'react'
import { Outlet } from 'react-router'
import { AssistantPanel } from '@/components/assistant/AssistantPanel'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { Sidebar } from './Sidebar'

// App frame: sidebar (nav + user) on the left, the active page in the middle,
// and a dockable Assistant panel on the right (toggled from the top-right).
export function AppShell() {
  const [open, setOpen] = useState(false)
  const [maximized, setMaximized] = useState(false)

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />

      {/* Main column — hidden when the Assistant is maximized. */}
      {!maximized && (
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex h-11 shrink-0 items-center justify-end border-b border-border px-3">
            <Button
              variant={open ? 'secondary' : 'ghost'}
              size="sm"
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
          className={cn('shrink-0 border-l border-border', maximized ? 'flex-1' : 'w-[420px]')}
        />
      )}
    </div>
  )
}
