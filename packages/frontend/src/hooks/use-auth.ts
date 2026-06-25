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
    // "Not signed in" is an expected state, not an error: return null so the
    // AuthGate can render the login screen (an errored query would retain stale
    // `data` and keep showing the app — see useLogout).
    queryFn: async () => {
      const res = await api.me.get()
      if (res.error || !res.data || res.data.ok !== true) return null
      return res.data.data // { user }
    },
    retry: false, // a 401 means "show login", not "retry"
    staleTime: 60_000,
  })
}

export function useIsAdmin(): boolean {
  const { data } = useMe()
  const u = data?.user
  return !!u && 'role' in u && u.role === 'admin'
}

export function useRegister() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: { email: string; password: string }) => unwrap(api.auth.register.post(input)),
    onSuccess: () => qc.invalidateQueries({ queryKey: authKeys.me }),
  })
}

export function useLogin() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: { email: string; password: string }) => unwrap(api.auth.login.post(input)),
    onSuccess: () => qc.invalidateQueries({ queryKey: authKeys.me }),
  })
}

// Set the signed-in user's display name (Settings → Account).
export function useUpdateProfile() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: { name: string }) => unwrap(api.profile.put(input)),
    onSuccess: () => qc.invalidateQueries({ queryKey: authKeys.me }),
  })
}

export function useLogout() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () => unwrap(api.auth.logout.post()),
    // Always land on the login screen, even if the network logout errored. Pin
    // `me` to null so the AuthGate flips to LoginPage immediately (no refetch
    // flash), then drop every other cached query.
    onSettled: () => {
      qc.setQueryData(authKeys.me, null)
      qc.removeQueries({ predicate: (q) => q.queryKey[0] !== 'me' })
    },
  })
}
