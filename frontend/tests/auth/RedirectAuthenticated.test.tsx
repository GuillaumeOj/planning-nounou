import { screen } from '@testing-library/react'
import { Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useAuth } from '@/src/auth/AuthContext'
import { RedirectAuthenticated } from '@/src/auth/RedirectAuthenticated'
import { getAccessToken } from '@/src/auth/tokenStorage'
import { makeAuth, renderWithProviders } from '@/tests/utils'

vi.mock('@/src/auth/AuthContext', () => ({ useAuth: vi.fn() }))
vi.mock('@/src/auth/tokenStorage', () => ({ getAccessToken: vi.fn() }))
const mockUseAuth = vi.mocked(useAuth)
const mockGetAccessToken = vi.mocked(getAccessToken)

function renderGuard() {
  return renderWithProviders(
    <Routes>
      <Route
        path="/"
        element={
          <RedirectAuthenticated>
            <p>public landing</p>
          </RedirectAuthenticated>
        }
      />
      <Route path="/dashboard" element={<p>dashboard</p>} />
    </Routes>,
    { route: '/' },
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  mockGetAccessToken.mockReturnValue(null)
})

describe('RedirectAuthenticated', () => {
  it('sends a signed-in visitor to the dashboard', () => {
    mockUseAuth.mockReturnValue(makeAuth({ isAuthenticated: true }))
    renderGuard()
    expect(screen.getByText('dashboard')).toBeInTheDocument()
  })

  it('shows the public content to anonymous visitors', () => {
    mockUseAuth.mockReturnValue(makeAuth({ isAuthenticated: false }))
    renderGuard()
    expect(screen.getByText('public landing')).toBeInTheDocument()
  })

  it('shows the landing while auth resolves for an anonymous visitor (no token)', () => {
    mockUseAuth.mockReturnValue(makeAuth({ isLoading: true }))
    mockGetAccessToken.mockReturnValue(null)
    renderGuard()
    expect(screen.getByText('public landing')).toBeInTheDocument()
  })

  it('renders nothing while auth resolves when a token is stored', () => {
    mockUseAuth.mockReturnValue(makeAuth({ isLoading: true }))
    mockGetAccessToken.mockReturnValue('a-token')
    renderGuard()
    expect(screen.queryByText('public landing')).not.toBeInTheDocument()
    expect(screen.queryByText('dashboard')).not.toBeInTheDocument()
  })
})
