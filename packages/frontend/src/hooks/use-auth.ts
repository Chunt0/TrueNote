import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, unwrap } from '@/lib/api'

// Mode C auth. `me` is the signed-in user (or a thrown error → not signed in).
export const authKeys = {
  me: ['me'] as const,
}

export function useMe() {
  return useQuery({
    queryKey: authKeys.me,
    // /api/me lives on the root app instance, so its inferred response includes
    // the global error envelope — unwrap() can't narrow that union, so parse here.
    queryFn: async () => {
      const res = await api.me.get()
      if (res.error || !res.data || res.data.ok !== true) throw new Error('Not signed in')
      return res.data.data // { user }
    },
    retry: false, // a 401 means "show login", not "retry"
    staleTime: 60_000,
  })
}

export function useDevLogin() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: { email: string; name?: string }) =>
      unwrap(api.auth.dev.login.post(input)),
    onSuccess: () => qc.invalidateQueries({ queryKey: authKeys.me }),
  })
}

export function useLogout() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () => unwrap(api.auth.logout.post()),
    onSuccess: () => qc.clear(),
  })
}
