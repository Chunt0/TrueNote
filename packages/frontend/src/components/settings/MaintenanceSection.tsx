import { Play } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { toast } from '@/components/ui/sonner'
import { useDepartments } from '@/hooks/use-admin'
import {
  type MaintenanceConfig,
  useMaintenanceConfig,
  useMaintenanceRuns,
  useRunMaintenance,
  useUpdateMaintenanceConfig,
} from '@/hooks/use-maintenance'
import { SectionHeader } from './SectionHeader'

const CHECKS: { key: string; label: string; hint: string }[] = [
  { key: 'broken-link', label: 'Broken links', hint: 'Links pointing at a missing page' },
  { key: 'orphan', label: 'Orphan pages', hint: 'No other page links to it' },
  { key: 'stale', label: 'Stale pages', hint: 'Not edited within the threshold' },
  { key: 'stub', label: 'Stubs & placeholders', hint: 'Near-empty or TODO/TBD markers' },
  { key: 'naming', label: 'Naming violations', hint: 'Not lowercase kebab-case' },
  { key: 'llm-quality', label: 'AI drift review', hint: 'Per-page LLM check (lower confidence, uses your provider)' },
]

const NUMS: { key: keyof MaintenanceConfig; label: string; min: number }[] = [
  { key: 'intervalHours', label: 'Run every (hours)', min: 1 },
  { key: 'staleDays', label: 'Stale after (days)', min: 1 },
  { key: 'maxDocsPerRun', label: 'Max pages / run (AI)', min: 1 },
  { key: 'maxSuggestions', label: 'Max new suggestions / run', min: 1 },
]

export function MaintenanceSection() {
  const { data: config } = useMaintenanceConfig()
  const { data: departments } = useDepartments()
  const { data: runs } = useMaintenanceRuns()
  const update = useUpdateMaintenanceConfig()
  const run = useRunMaintenance()
  const [draft, setDraft] = useState<MaintenanceConfig | null>(null)

  useEffect(() => {
    if (config) setDraft(config)
  }, [config])

  if (!draft) return <p className="text-sm text-muted-foreground">Loading…</p>

  const set = (patch: Partial<MaintenanceConfig>) => setDraft({ ...draft, ...patch })
  const toggleCheck = (key: string) =>
    set({ checks: draft.checks.includes(key) ? draft.checks.filter((c) => c !== key) : [...draft.checks, key] })
  const toggleDept = (key: string) =>
    set({ scopeDepts: draft.scopeDepts.includes(key) ? draft.scopeDepts.filter((d) => d !== key) : [...draft.scopeDepts, key] })

  function save() {
    update.mutate(draft!, {
      onSuccess: () => toast.success('Maintenance settings saved'),
      onError: (e: Error) => toast.error(e.message),
    })
  }

  function runNow() {
    run.mutate(undefined, {
      onSuccess: (r) => toast.success(`Run complete — ${r.found} new suggestion(s) from ${r.scanned} page(s)`),
      onError: (e: Error) => toast.error(e.message),
    })
  }

  const lastRun = runs?.[0]

  return (
    <div className="space-y-6">
      <SectionHeader
        title="Maintenance"
        description="A scheduled agent that scans the wiki for problems and files suggestions for review. It never edits a page on its own — every fix is an admin-reviewed diff."
      />

      <div className="flex items-center justify-between rounded-lg border border-border p-4">
        <div>
          <div className="text-sm font-medium">Scheduled runs</div>
          <div className="text-xs text-muted-foreground">
            {draft.enabled ? `Runs about every ${draft.intervalHours}h` : 'Disabled — runs only when you trigger one'}
          </div>
        </div>
        <Switch checked={draft.enabled} onCheckedChange={(v) => set({ enabled: v })} />
      </div>

      {/* Checks */}
      <div className="space-y-2">
        <Label>Checks</Label>
        <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
          {CHECKS.map((c) => (
            <label key={c.key} className="flex items-start gap-2 rounded-md border border-border p-2.5">
              <Checkbox
                className="mt-0.5"
                checked={draft.checks.includes(c.key)}
                onCheckedChange={() => toggleCheck(c.key)}
              />
              <span className="min-w-0">
                <span className="block text-sm">{c.label}</span>
                <span className="block text-xs text-muted-foreground">{c.hint}</span>
              </span>
            </label>
          ))}
        </div>
      </div>

      {/* Numeric thresholds */}
      <div className="grid grid-cols-2 gap-3">
        {NUMS.map((n) => (
          <div key={n.key} className="space-y-1">
            <Label htmlFor={n.key} className="text-xs font-normal text-muted-foreground">
              {n.label}
            </Label>
            <Input
              id={n.key}
              type="number"
              min={n.min}
              value={String(draft[n.key] ?? '')}
              onChange={(e) => set({ [n.key]: Math.max(n.min, Number(e.target.value) || n.min) } as Partial<MaintenanceConfig>)}
              className="h-8"
            />
          </div>
        ))}
      </div>

      {/* LLM model override */}
      <div className="space-y-1">
        <Label htmlFor="llmModel" className="text-xs font-normal text-muted-foreground">
          AI model override (optional — defaults to the active provider's model)
        </Label>
        <Input
          id="llmModel"
          placeholder="e.g. claude-haiku-4-5-20251001 (a cheaper model for bulk checks)"
          value={draft.llmModel ?? ''}
          onChange={(e) => set({ llmModel: e.target.value || null })}
          className="h-8 font-mono text-xs"
        />
      </div>

      {/* Department scope */}
      <div className="space-y-2">
        <Label>Department scope</Label>
        {departments && departments.length > 0 ? (
          <>
            <p className="text-xs text-muted-foreground">
              {draft.scopeDepts.length === 0 ? 'All departments and shared pages.' : 'Only the selected departments.'}
            </p>
            <div className="flex flex-wrap gap-x-4 gap-y-1.5">
              {departments.map((d) => (
                <label key={d.key} className="flex items-center gap-1.5 text-xs">
                  <Checkbox checked={draft.scopeDepts.includes(d.key)} onCheckedChange={() => toggleDept(d.key)} />
                  <span className="font-mono">{d.key}</span>
                </label>
              ))}
            </div>
          </>
        ) : (
          <p className="text-xs text-muted-foreground">No departments — every page is scanned.</p>
        )}
      </div>

      <div className="flex items-center gap-3 border-t border-border pt-4">
        <Button onClick={save} disabled={update.isPending}>
          Save settings
        </Button>
        <Button variant="outline" onClick={runNow} disabled={run.isPending}>
          <Play /> {run.isPending ? 'Running…' : 'Run checks now'}
        </Button>
        <Link to="/maintenance" className="ml-auto text-sm text-primary hover:underline">
          Review suggestions →
        </Link>
      </div>

      {lastRun ? (
        <p className="text-xs text-muted-foreground">
          Last run: {lastRun.status}
          {lastRun.finishedAt ? ` · ${new Date(lastRun.finishedAt).toLocaleString()}` : ''} · scanned{' '}
          {lastRun.scanned}, found {lastRun.found}.
        </p>
      ) : null}
    </div>
  )
}
