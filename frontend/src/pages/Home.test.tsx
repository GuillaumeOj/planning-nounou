import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getHealth } from '../api/client'
import { useAuth } from '../auth/AuthContext'
import { I18nProvider } from '../i18n/I18nContext'
import { makeAuth } from '../test/utils'
import Home from './Home'

vi.mock('../api/client', () => ({
  getHealth: vi.fn(),
  // I18nProvider reads api.defaults to set the Accept-Language header.
  api: { defaults: { headers: { common: {} } } },
}))
vi.mock('../auth/AuthContext', () => ({ useAuth: vi.fn() }))

const mockGetHealth = vi.mocked(getHealth)
const mockUseAuth = vi.mocked(useAuth)
const logout = vi.fn()

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return (
    <I18nProvider>
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    </I18nProvider>
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  mockUseAuth.mockReturnValue(
    makeAuth({
      user: { id: 1, email: 'me@example.com', first_name: '', last_name: '' },
      isAuthenticated: true,
      logout,
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

  it('logs out when the button is clicked', async () => {
    mockGetHealth.mockResolvedValue({ status: 'ok' })
    render(<Home />, { wrapper })

    await userEvent.click(screen.getByRole('button', { name: 'Log out' }))

    expect(logout).toHaveBeenCalled()
  })
})
