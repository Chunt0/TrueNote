import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, type Payload, unwrap } from '@/lib/api'

// Redacted provider profile (no apiKey — the API returns only `hasKey`).
export type Provider = Payload<typeof api.providers.get>[number]

export interface ProviderInput {
  name: string
  kind: 'anthropic' | 'openai'
  model: string
  baseUrl?: string
  apiKey?: string
  availableModels?: string[]
  isDefault?: boolean
}

export const providerKeys = { all: ['providers'] as const }

// Probe a provider's endpoint for its available models (no DB write).
export function useDetectModels() {
  return useMutation({
    mutationFn: (input: { kind: 'anthropic' | 'openai'; baseUrl?: string; apiKey?: string; id?: number }) =>
      unwrap(api.providers.detect.post(input)),
  })
}

export function useProviders() {
  return useQuery({
    queryKey: providerKeys.all,
    queryFn: () => unwrap(api.providers.get()),
  })
}

export function useCreateProvider() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: ProviderInput) => unwrap(api.providers.post(input)),
    onSuccess: () => qc.invalidateQueries({ queryKey: providerKeys.all }),
  })
}

export function useUpdateProvider() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...input }: ProviderInput & { id: number }) =>
      unwrap(api.providers({ id }).put(input)),
    onSuccess: () => qc.invalidateQueries({ queryKey: providerKeys.all }),
  })
}

export function useDeleteProvider() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => unwrap(api.providers({ id }).delete()),
    onSuccess: () => qc.invalidateQueries({ queryKey: providerKeys.all }),
  })
}

export function useSetDefaultProvider() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => unwrap(api.providers({ id }).default.post()),
    onSuccess: () => qc.invalidateQueries({ queryKey: providerKeys.all }),
  })
}
