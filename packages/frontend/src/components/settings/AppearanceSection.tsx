import { Check } from 'lucide-react'
import { useTheme } from '@/components/layout/ThemeProvider'
import { THEMES } from '@/lib/themes'
import { cn } from '@/lib/utils'
import { SectionHeader } from './SectionHeader'

// Theme picker — the 18 built-in themes as selectable swatches. Applies live.
export function AppearanceSection() {
  const { theme, setTheme } = useTheme()
  return (
    <div className="space-y-4">
      <SectionHeader title="Appearance" description="Pick a theme. Applies instantly across the app." />
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {THEMES.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTheme(t.key)}
            className={cn(
              'flex items-center gap-2 rounded-lg border p-2.5 text-left text-sm transition-colors',
              theme === t.key
                ? 'border-primary ring-1 ring-primary'
                : 'border-border hover:bg-accent/50',
            )}
          >
            <span
              aria-hidden
              className="size-5 shrink-0 rounded-full border border-border"
              style={{ background: `linear-gradient(135deg, ${t.swatch.bg} 50%, ${t.swatch.accent} 50%)` }}
            />
            <span className="truncate">{t.label}</span>
            {theme === t.key && <Check className="ml-auto size-4 shrink-0 text-primary" />}
          </button>
        ))}
      </div>
    </div>
  )
}
