import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, type Payload, unwrap } from '@/lib/api'

export type AdminUser = Payload<typeof api.admin.users.get>[number]
export type Department = Payload<typeof api.admin.departments.get>[number]

const adminKeys = {
  users: ['admin', 'users'] as const,
  departments: ['admin', 'departments'] as const,
}

export function useAdminUsers() {
  return useQuery({ queryKey: adminKeys.users, queryFn: () => unwrap(api.admin.users.get()) })
}

export function useUpdateUser() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...body }: { id: number; role?: 'admin' | 'member'; departments?: string[] }) =>
      unwrap(api.admin.users({ id }).put(body)),
    onSuccess: () => qc.invalidateQueries({ queryKey: adminKeys.users }),
  })
}

export function useDepartments() {
  return useQuery({
    queryKey: adminKeys.departments,
    queryFn: () => unwrap(api.admin.departments.get()),
  })
}

export function useCreateDepartment() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: { key: string; label?: string }) => unwrap(api.admin.departments.post(body)),
    onSuccess: () => qc.invalidateQueries({ queryKey: adminKeys.departments }),
  })
}

export function useDeleteDepartment() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (key: string) => unwrap(api.admin.departments({ key }).delete()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: adminKeys.departments })
      qc.invalidateQueries({ queryKey: adminKeys.users })
    },
  })
}
