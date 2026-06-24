import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { AssistantPanel } from './AssistantPanel'

function renderPanel() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <AssistantPanel maximized={false} onToggleMax={() => {}} onClose={() => {}} />
    </QueryClientProvider>,
  )
}

describe('AssistantPanel', () => {
  it('starts with no context attached (opt-in)', () => {
    renderPanel()
    // The "Add" affordance is present, but no page chips are auto-attached.
    expect(screen.getByRole('button', { name: /add/i })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /remove .* from context/i })).toBeNull()
  })

  it('disables Send with no input', () => {
    renderPanel()
    expect(screen.getByRole('button', { name: 'Send' })).toBeDisabled()
  })
})
