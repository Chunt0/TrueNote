import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, type Payload, unwrap } from '@/lib/api'

// Entity types derived from the API (never hand-written — they can't drift).
export type DocSummary = Payload<typeof api.docs.get>[number]
export type DocContent = Payload<typeof api.docs.read.get>

export const docKeys = {
  all: ['docs'] as const,
  list: () => ['docs', 'list'] as const,
  read: (path: string) => ['docs', 'read', path] as const,
  search: (q: string) => ['docs', 'search', q] as const,
}

export function useDocs() {
  return useQuery({
    queryKey: docKeys.list(),
    queryFn: () => unwrap(api.docs.get()),
  })
}

export function useDoc(path: string | null) {
  return useQuery({
    queryKey: docKeys.read(path ?? ''),
    queryFn: () => unwrap(api.docs.read.get({ query: { path: path! } })),
    enabled: !!path,
    staleTime: 0,
  })
}

export function useSearchDocs(q: string) {
  return useQuery({
    queryKey: docKeys.search(q),
    queryFn: () => unwrap(api.docs.search.get({ query: { q } })),
    enabled: q.trim().length > 0,
    placeholderData: (prev) => prev, // keep prior results visible while typing
  })
}

export function useCreateDoc() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: { path: string; content: string }) => unwrap(api.docs.post(input)),
    onSuccess: () => qc.invalidateQueries({ queryKey: docKeys.all }),
  })
}

export function useUpdateDoc() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: { path: string; content: string; version: string }) =>
      unwrap(api.docs.put(input)),
    onSuccess: (doc) => {
      qc.invalidateQueries({ queryKey: docKeys.all })
      qc.setQueryData(docKeys.read(doc.path), doc)
    },
  })
}

export function useRenameDoc() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: { from: string; to: string }) => unwrap(api.docs.rename.post(input)),
    onSuccess: () => qc.invalidateQueries({ queryKey: docKeys.all }),
  })
}

export function useDeleteDoc() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (path: string) => unwrap(api.docs.delete(undefined, { query: { path } })),
    onSuccess: () => qc.invalidateQueries({ queryKey: docKeys.all }),
  })
}
