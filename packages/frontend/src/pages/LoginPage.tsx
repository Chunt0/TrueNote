import { type FormEvent, useState } from 'react'
import { PuttyMascot } from '@/components/brand/PuttyMascot'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { toast } from '@/components/ui/sonner'
import { useLogin, useRegister } from '@/hooks/use-auth'
import { APP_NAME } from '@/lib/config'

// Local email + password accounts. New users create an account here; the display
// name is set afterwards in Settings → Account.
export default function LoginPage() {
  const [mode, setMode] = useState<'signin' | 'register'>('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const login = useLogin()
  const register = useRegister()
  const busy = login.isPending || register.isPending

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const onError = (err: Error) => toast.error(err.message)
    if (mode === 'register') register.mutate({ email, password }, { onError })
    else login.mutate({ email, password }, { onError })
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-6">
      <Card className="w-full max-w-sm">
        <CardHeader className="items-center text-center">
          <PuttyMascot size={40} glow />
          <CardTitle className="mt-2 lowercase">{APP_NAME}</CardTitle>
          <CardDescription>
            {mode === 'register' ? 'Create your account' : 'Sign in to your wiki'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                autoComplete="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoFocus
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
                placeholder={mode === 'register' ? 'At least 8 characters' : 'Your password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={mode === 'register' ? 8 : undefined}
              />
            </div>
            <Button type="submit" className="w-full" disabled={busy}>
              {busy ? 'Please wait…' : mode === 'register' ? 'Create account' : 'Sign in'}
            </Button>
          </form>
          <p className="mt-4 text-center text-sm text-muted-foreground">
            {mode === 'register' ? 'Already have an account?' : 'No account yet?'}{' '}
            <button
              type="button"
              className="font-medium text-primary hover:underline"
              onClick={() => setMode(mode === 'register' ? 'signin' : 'register')}
            >
              {mode === 'register' ? 'Sign in' : 'Create one'}
            </button>
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
