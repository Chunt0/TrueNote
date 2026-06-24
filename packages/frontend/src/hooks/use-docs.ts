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

// ── Version history (git-backed) ─────────────────────────────────────────────
export type DocVersion = Payload<typeof api.docs.history.get>[number]

export function useDocHistory(path: string, enabled: boolean) {
  return useQuery({
    queryKey: ['docs', 'history', path],
    queryFn: () => unwrap(api.docs.history.get({ query: { path } })),
    enabled: enabled && !!path,
  })
}

export function useDocDiff(path: string, rev: string | null) {
  return useQuery({
    queryKey: ['docs', 'diff', path, rev],
    queryFn: () => unwrap(api.docs.diff.get({ query: { path, rev: rev! } })),
    enabled: !!rev,
  })
}

export function useRestoreDoc() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: { path: string; rev: string }) => unwrap(api.docs.restore.post(input)),
    onSuccess: (doc) => {
      qc.invalidateQueries({ queryKey: docKeys.all })
      qc.setQueryData(docKeys.read(doc.path), doc)
    },
  })
}

// ── Activity feed (git-backed) ───────────────────────────────────────────────
export type ActivityEntry = Payload<typeof api.docs.activity.get>[number]

export function useActivity() {
  return useQuery({
    queryKey: ['docs', 'activity'],
    queryFn: () => unwrap(api.docs.activity.get()),
    staleTime: 15_000,
  })
}

// ── Backlinks ────────────────────────────────────────────────────────────────
export function useBacklinks(path: string | null) {
  return useQuery({
    queryKey: ['docs', 'backlinks', path],
    queryFn: () => unwrap(api.docs.backlinks.get({ query: { path: path! } })),
    enabled: !!path,
  })
}

// ── Trash (browse / restore / purge) ─────────────────────────────────────────
export type TrashItem = Payload<typeof api.docs.trash.get>[number]

export function useTrash(enabled: boolean) {
  return useQuery({
    queryKey: ['docs', 'trash'],
    queryFn: () => unwrap(api.docs.trash.get()),
    enabled,
  })
}

export function useRestoreFromTrash() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => unwrap(api.docs.trash.restore.post({ id })),
    onSuccess: () => qc.invalidateQueries({ queryKey: docKeys.all }),
  })
}

export function usePurgeTrash() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => unwrap(api.docs.trash.delete(undefined, { query: { id } })),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['docs', 'trash'] }),
  })
}
