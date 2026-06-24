import { LogOut } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useLogout, useMe } from '@/hooks/use-auth'
import { SectionHeader } from './SectionHeader'

// Current identity + sign out. Will grow (e.g. Entra account linking) later.
export function AccountSection() {
  const { data: me } = useMe()
  const logout = useLogout()
  return (
    <div className="space-y-4">
      <SectionHeader title="Account" description="Your signed-in identity." />
      <div className="space-y-1 rounded-lg border border-border p-4">
        <div className="font-medium">{me?.user?.name ?? '—'}</div>
        <div className="text-sm text-muted-foreground">{me?.user?.email ?? ''}</div>
      </div>
      <p className="text-xs text-muted-foreground">
        Signed in via dev mode (passwordless). Microsoft Entra SSO is planned for production.
      </p>
      <Button variant="outline" onClick={() => logout.mutate()}>
        <LogOut /> Sign out
      </Button>
    </div>
  )
}
