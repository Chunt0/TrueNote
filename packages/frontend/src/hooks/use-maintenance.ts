import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, type Payload, unwrap } from '@/lib/api'

// Admin-only: the scheduled maintenance agent's config, runs, and suggestions.
export type MaintenanceConfig = Payload<typeof api.maintenance.config.get>
export type MaintenanceRun = Payload<typeof api.maintenance.runs.get>[number]
export type Suggestion = Payload<typeof api.maintenance.suggestions.get>[number]

export interface SuggestionFilter {
  status?: string
  dept?: string
}

export const maintenanceKeys = {
  config: ['maintenance', 'config'] as const,
  runs: ['maintenance', 'runs'] as const,
  suggestions: (f: SuggestionFilter = {}) => ['maintenance', 'suggestions', f] as const,
}

export function useMaintenanceConfig() {
  return useQuery({
    queryKey: maintenanceKeys.config,
    queryFn: () => unwrap(api.maintenance.config.get()),
  })
}

export function useUpdateMaintenanceConfig() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (patch: Partial<MaintenanceConfig>) => unwrap(api.maintenance.config.put(patch)),
    onSuccess: () => qc.invalidateQueries({ queryKey: maintenanceKeys.config }),
  })
}

export function useMaintenanceRuns() {
  return useQuery({
    queryKey: maintenanceKeys.runs,
    queryFn: () => unwrap(api.maintenance.runs.get({ query: {} })),
  })
}

export function useSuggestions(filter: SuggestionFilter = {}) {
  return useQuery({
    queryKey: maintenanceKeys.suggestions(filter),
    queryFn: () => unwrap(api.maintenance.suggestions.get({ query: filter })),
  })
}

function invalidateAll(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: ['maintenance'] })
}

export function useRunMaintenance() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () => unwrap(api.maintenance.run.post({})),
    onSuccess: () => invalidateAll(qc),
  })
}

export function usePreviewFix() {
  return useMutation({
    mutationFn: (id: number) => unwrap(api.maintenance.suggestions({ id }).preview.post({})),
  })
}

export function useApplyFix() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: { id: number; content: string; version: string }) =>
      unwrap(api.maintenance.suggestions({ id: input.id }).apply.post({ content: input.content, version: input.version })),
    onSuccess: () => invalidateAll(qc),
  })
}

export function useDismissSuggestion() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => unwrap(api.maintenance.suggestions({ id }).dismiss.post({})),
    onSuccess: () => invalidateAll(qc),
  })
}

export function useSnoozeSuggestion() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: { id: number; days?: number }) =>
      unwrap(api.maintenance.suggestions({ id: input.id }).snooze.post({ days: input.days })),
    onSuccess: () => invalidateAll(qc),
  })
}
