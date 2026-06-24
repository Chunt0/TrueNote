import { type FormEvent, useState } from 'react'
import { PuttyMascot } from '@/components/brand/PuttyMascot'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { toast } from '@/components/ui/sonner'
import { APP_NAME } from '@/lib/config'
import { useDevLogin } from '@/hooks/use-auth'

// Dev sign-in (AUTH_MODE=dev): passwordless, for local development only. In
// production this screen is replaced by Microsoft Entra (OIDC) — same session
// underneath. The dev provider refuses to run under NODE_ENV=production.
export default function LoginPage() {
  const login = useDevLogin()
  const [email, setEmail] = useState('')
  const [name, setName] = useState('')

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    login.mutate(
      { email, name: name || undefined },
      { onError: (err) => toast.error(err.message) },
    )
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-6">
      <Card className="w-full max-w-sm">
        <CardHeader className="items-center text-center">
          <PuttyMascot size={40} glow />
          <CardTitle className="mt-2 lowercase">{APP_NAME}</CardTitle>
          <CardDescription>Sign in to your team wiki (dev mode).</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="you@corp.example"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoFocus
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="name">Display name</Label>
              <Input
                id="name"
                placeholder="optional"
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={120}
              />
            </div>
            <Button type="submit" className="w-full" disabled={login.isPending}>
              {login.isPending ? 'Signing in…' : 'Sign in'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
