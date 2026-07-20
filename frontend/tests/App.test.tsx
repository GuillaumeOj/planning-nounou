import { screen } from '@testing-library/react'
import { Outlet } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import App from '@/src/App'
import { useAuth } from '@/src/auth/AuthContext'
import { makeAuth, renderWithProviders } from '@/tests/utils'

vi.mock('@/src/auth/AuthContext', () => ({ useAuth: vi.fn() }))
vi.mock('@/src/api/family', () => ({
  getMyInvitations: vi.fn(() => Promise.resolve([])),
}))
vi.mock('@/src/pages/Home', () => ({ default: () => <p>home</p> }))
vi.mock('@/src/pages/Landing', () => ({ default: () => <p>landing</p> }))
vi.mock('@/src/pages/Features', () => ({ default: () => <p>features</p> }))
vi.mock('@/src/pages/Pricing', () => ({ default: () => <p>pricing</p> }))
vi.mock('@/src/pages/Privacy', () => ({ default: () => <p>privacy</p> }))
vi.mock('@/src/pages/LegalNotice', () => ({ default: () => <p>legal</p> }))
vi.mock('@/src/components/landing/PublicLayout', () => ({
  PublicLayout: () => (
    <div>
      public-shell
      <Outlet />
    </div>
  ),
}))
vi.mock('@/src/pages/LoginPage', () => ({ default: () => <p>login</p> }))
vi.mock('@/src/pages/RegisterPage', () => ({ default: () => <p>register</p> }))
vi.mock('@/src/pages/Planning', () => ({ default: () => <p>planning</p> }))
vi.mock('@/src/pages/Declarations', () => ({
  default: () => <p>declarations</p>,
}))

const mockUseAuth = vi.mocked(useAuth)

function setAuthenticated(value: boolean) {
  mockUseAuth.mockReturnValue(makeAuth({ isAuthenticated: value }))
}

function renderAt(path: string) {
  return renderWithProviders(<App />, { route: path })
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('App routing', () => {
  it('renders the login page', () => {
    setAuthenticated(false)
    renderAt('/login')
    expect(screen.getByText('login')).toBeInTheDocument()
  })

  it('renders the register page', () => {
    setAuthenticated(false)
    renderAt('/register')
    expect(screen.getByText('register')).toBeInTheDocument()
  })

  it('shows the public landing at / for anonymous visitors', () => {
    setAuthenticated(false)
    renderAt('/')
    expect(screen.getByText('landing')).toBeInTheDocument()
  })

  it('sends signed-in visitors from / to their dashboard', () => {
    setAuthenticated(true)
    renderAt('/')
    expect(screen.getByText('home')).toBeInTheDocument()
  })

  it('renders the dashboard at /dashboard when authenticated', () => {
    setAuthenticated(true)
    renderAt('/dashboard')
    expect(screen.getByText('home')).toBeInTheDocument()
  })

  it('keeps the dashboard behind the login', () => {
    setAuthenticated(false)
    renderAt('/dashboard')
    expect(screen.getByText('login')).toBeInTheDocument()
  })

  it('renders the features page for anyone', () => {
    setAuthenticated(false)
    renderAt('/features')
    expect(screen.getByText('features')).toBeInTheDocument()
  })

  it('renders the public pricing, privacy and legal pages', () => {
    setAuthenticated(false)
    renderAt('/pricing')
    expect(screen.getByText('pricing')).toBeInTheDocument()
    renderAt('/privacy')
    expect(screen.getByText('privacy')).toBeInTheDocument()
    renderAt('/legal')
    expect(screen.getByText('legal')).toBeInTheDocument()
  })

  it('renders the declarations page', () => {
    setAuthenticated(true)
    renderAt('/declarations')
    expect(screen.getByText('declarations')).toBeInTheDocument()
  })

  it('keeps the declarations page behind the login', () => {
    setAuthenticated(false)
    renderAt('/declarations')
    expect(screen.getByText('login')).toBeInTheDocument()
  })

  it('redirects unknown routes to the dashboard', () => {
    setAuthenticated(true)
    renderAt('/nowhere')
    expect(screen.getByText('home')).toBeInTheDocument()
  })

  it('sends the old /leaves address to the planning it became a tab of', () => {
    setAuthenticated(true)
    renderAt('/leaves')
    expect(screen.getByText('planning')).toBeInTheDocument()
  })
})
