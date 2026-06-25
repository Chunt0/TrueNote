import { LogOut } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { toast } from '@/components/ui/sonner'
import { useLogout, useMe, useUpdateProfile } from '@/hooks/use-auth'
import { SectionHeader } from './SectionHeader'

// Current identity + display-name editing + sign out. Email is the account id
// (set at registration, not editable here); the name is yours to change.
export function AccountSection() {
  const { data: me } = useMe()
  const logout = useLogout()
  const update = useUpdateProfile()
  const [name, setName] = useState('')

  useEffect(() => {
    if (me?.user?.name) setName(me.user.name)
  }, [me?.user?.name])

  const current = me?.user?.name ?? ''
  const dirty = name.trim() !== current && name.trim().length > 0

  function save() {
    update.mutate(
      { name: name.trim() },
      {
        onSuccess: () => toast.success('Display name updated'),
        onError: (e: Error) => toast.error(e.message),
      },
    )
  }

  return (
    <div className="space-y-4">
      <SectionHeader title="Account" description="Your identity and display name." />

      <div className="space-y-2">
        <Label htmlFor="account-email">Email</Label>
        <Input id="account-email" value={me?.user?.email ?? ''} readOnly disabled />
      </div>

      <div className="space-y-2">
        <Label htmlFor="account-name">Display name</Label>
        <div className="flex items-center gap-2">
          <Input
            id="account-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={120}
            placeholder="How your name appears on edits"
          />
          <Button onClick={save} disabled={!dirty || update.isPending} className="shrink-0">
            Save
          </Button>
        </div>
      </div>

      <Button variant="outline" onClick={() => logout.mutate()}>
        <LogOut /> Sign out
      </Button>
    </div>
  )
}
