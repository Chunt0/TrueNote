import { QueryClientProvider } from '@tanstack/react-query'
import { RouterProvider } from 'react-router'
import { ErrorBoundary } from '@/components/ErrorBoundary'
import { LoadingState } from '@/components/feedback/LoadingState'
import { ThemeProvider } from '@/components/layout/ThemeProvider'
import { Toaster } from '@/components/ui/sonner'
import { useMe } from '@/hooks/use-auth'
import { queryClient } from '@/lib/query-client'
import { router } from '@/router'
import LoginPage from '@/pages/LoginPage'

// Gate the whole app on a session (auth Mode C). A failed /api/me (401) means
// "not signed in" → show the login screen; success renders the router.
function AuthGate() {
  const { data, isLoading } = useMe()
  if (isLoading)
    return (
      <div className="flex min-h-screen items-center justify-center">
        <LoadingState />
      </div>
    )
  if (!data?.user) return <LoginPage />
  return <RouterProvider router={router} />
}

export function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider>
        <QueryClientProvider client={queryClient}>
          <AuthGate />
          <Toaster />
        </QueryClientProvider>
      </ThemeProvider>
    </ErrorBoundary>
  )
}
