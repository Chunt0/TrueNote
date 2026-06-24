import { useState } from 'react'
import { SETTINGS_SECTIONS } from '@/components/settings/registry'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog'
import { useIsAdmin } from '@/hooks/use-auth'
import { cn } from '@/lib/utils'

// Extensible, registry-driven settings shell (mirrors the Odysseus pattern: a
// left nav of sections + a swappable panel). Add a section in
// components/settings/registry.ts — this shell needs no changes. `adminOnly`
// sections are filtered out for members.
export function SettingsDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const isAdmin = useIsAdmin()
  const sections = SETTINGS_SECTIONS.filter((s) => !s.adminOnly || isAdmin)
  const [activeId, setActiveId] = useState(sections[0].id)
  const section = sections.find((s) => s.id === activeId) ?? sections[0]
  const Active = section.Component

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl gap-0 overflow-hidden p-0">
        <div className="flex h-[560px]">
          <nav className="flex w-48 shrink-0 flex-col gap-0.5 border-r border-border bg-background/40 p-3">
            <DialogTitle className="px-2 pb-2 pt-1 text-base">Settings</DialogTitle>
            {sections.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => setActiveId(s.id)}
                className={cn(
                  'flex items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-sm transition-colors',
                  activeId === s.id
                    ? 'bg-primary/10 font-medium text-foreground'
                    : 'text-muted-foreground hover:bg-accent/60 hover:text-foreground',
                )}
              >
                <s.icon className={cn('size-4 shrink-0', activeId === s.id ? 'text-primary' : 'opacity-60')} />
                {s.label}
              </button>
            ))}
          </nav>
          <div className="min-w-0 flex-1 overflow-y-auto p-6 pr-10">
            <DialogDescription className="sr-only">Application settings</DialogDescription>
            <Active />
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
