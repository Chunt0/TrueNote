import { Plus, Trash2 } from 'lucide-react'
import { type FormEvent, useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { toast } from '@/components/ui/sonner'
import {
  type AdminUser,
  useAdminUsers,
  useCreateDepartment,
  useDeleteDepartment,
  useDepartments,
  useUpdateUser,
} from '@/hooks/use-admin'
import { SectionHeader } from './SectionHeader'

export function TeamSection() {
  const { data: departments } = useDepartments()
  const { data: users } = useAdminUsers()
  const createDept = useCreateDepartment()
  const deleteDept = useDeleteDepartment()
  const updateUser = useUpdateUser()
  const [deptKey, setDeptKey] = useState('')
  const [deptLabel, setDeptLabel] = useState('')

  const onError = (err: Error) => toast.error(err.message)

  function addDepartment(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!deptKey.trim()) return
    createDept.mutate(
      { key: deptKey, label: deptLabel || undefined },
      {
        onSuccess: () => {
          setDeptKey('')
          setDeptLabel('')
        },
        onError,
      },
    )
  }

  function toggleDept(u: AdminUser, key: string) {
    const next = u.departments.includes(key)
      ? u.departments.filter((d) => d !== key)
      : [...u.departments, key]
    updateUser.mutate({ id: u.id, departments: next }, { onError })
  }

  return (
    <div className="space-y-6">
      <SectionHeader
        title="Team"
        description="Departments are access-controlled top-level folders. Members see only their departments (plus shared pages); admins see everything."
      />

      {/* Departments */}
      <div className="space-y-2">
        <Label>Departments</Label>
        {departments && departments.length > 0 ? (
          <div className="flex flex-wrap gap-1.5">
            {departments.map((d) => (
              <span
                key={d.key}
                className="inline-flex items-center gap-1 rounded-full border border-border bg-muted px-2 py-0.5 text-xs"
              >
                <span className="font-mono">{d.key}</span>
                <button
                  type="button"
                  aria-label={`Delete department ${d.key}`}
                  onClick={() => deleteDept.mutate(d.key, { onError })}
                  className="opacity-60 hover:opacity-100"
                >
                  <Trash2 className="size-3" />
                </button>
              </span>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">No departments yet.</p>
        )}
        <form onSubmit={addDepartment} className="flex items-end gap-2 pt-1">
          <div className="space-y-1">
            <Label htmlFor="dept-key" className="text-xs font-normal text-muted-foreground">
              key (folder)
            </Label>
            <Input
              id="dept-key"
              placeholder="engineering"
              value={deptKey}
              onChange={(e) => setDeptKey(e.target.value)}
              className="h-8 w-40 font-mono text-xs"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="dept-label" className="text-xs font-normal text-muted-foreground">
              label (optional)
            </Label>
            <Input
              id="dept-label"
              placeholder="Engineering"
              value={deptLabel}
              onChange={(e) => setDeptLabel(e.target.value)}
              className="h-8 w-40"
            />
          </div>
          <Button type="submit" size="sm" variant="outline" disabled={createDept.isPending}>
            <Plus /> Add
          </Button>
        </form>
      </div>

      {/* Users */}
      <div className="space-y-2">
        <Label>Users</Label>
        <div className="space-y-2">
          {users?.map((u) => (
            <div key={u.id} className="space-y-2 rounded-lg border border-border p-3">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium">{u.name}</div>
                  <div className="truncate text-xs text-muted-foreground">{u.email}</div>
                </div>
                <Select
                  value={u.role}
                  onValueChange={(role) =>
                    updateUser.mutate({ id: u.id, role: role as 'admin' | 'member' }, { onError })
                  }
                >
                  <SelectTrigger className="h-8 w-28">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="member">member</SelectItem>
                    <SelectItem value="admin">admin</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {u.role === 'admin' ? (
                <Badge variant="secondary">Sees all departments</Badge>
              ) : departments && departments.length > 0 ? (
                <div className="flex flex-wrap gap-x-4 gap-y-1.5">
                  {departments.map((d) => (
                    <label key={d.key} className="flex items-center gap-1.5 text-xs">
                      <Checkbox
                        checked={u.departments.includes(d.key)}
                        onCheckedChange={() => toggleDept(u, d.key)}
                      />
                      <span className="font-mono">{d.key}</span>
                    </label>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">Create a department to grant access.</p>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
