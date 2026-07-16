import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getHealth } from '@/src/api/client'
import { useAuth } from '@/src/auth/AuthContext'
import { I18nProvider } from '@/src/i18n/I18nContext'
import Home from '@/src/pages/Home'
import { makeAuth } from '@/tests/utils'

vi.mock('@/src/api/client', () => ({
  getHealth: vi.fn(),
  // I18nProvider reads api.defaults to set the Accept-Language header.
  api: { defaults: { headers: { common: {} } } },
}))
vi.mock('@/src/auth/AuthContext', () => ({ useAuth: vi.fn() }))

const mockGetHealth = vi.mocked(getHealth)
const mockUseAuth = vi.mocked(useAuth)

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return (
    <I18nProvider>
      <QueryClientProvider client={client}>
        <MemoryRouter>{children}</MemoryRouter>
      </QueryClientProvider>
    </I18nProvider>
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  mockUseAuth.mockReturnValue(
    makeAuth({
      user: { id: '1', email: 'me@example.com', first_name: '', last_name: '' },
      isAuthenticated: true,
    }),
  )
})

describe('Home', () => {
  it('shows the signed-in email and backend status', async () => {
    mockGetHealth.mockResolvedValue({ status: 'ok' })
    render(<Home />, { wrapper })

    expect(screen.getByText('me@example.com')).toBeInTheDocument()
    await waitFor(() => expect(screen.getByText('ok')).toBeInTheDocument())
  })

  it('reports an unreachable backend', async () => {
    mockGetHealth.mockRejectedValue(new Error('down'))
    render(<Home />, { wrapper })

    await waitFor(() =>
      expect(screen.getByText('unreachable')).toBeInTheDocument(),
    )
  })
})
