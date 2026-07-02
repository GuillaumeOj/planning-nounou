import { screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App'
import { useAuth } from './auth/AuthContext'
import { makeAuth, renderWithProviders } from './test/utils'

vi.mock('./auth/AuthContext', () => ({ useAuth: vi.fn() }))
vi.mock('./pages/Home', () => ({ default: () => <p>home</p> }))
vi.mock('./pages/LoginPage', () => ({ default: () => <p>login</p> }))
vi.mock('./pages/RegisterPage', () => ({ default: () => <p>register</p> }))

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

  it('renders home at / when authenticated', () => {
    setAuthenticated(true)
    renderAt('/')
    expect(screen.getByText('home')).toBeInTheDocument()
  })

  it('redirects unauthenticated users away from /', () => {
    setAuthenticated(false)
    renderAt('/')
    expect(screen.getByText('login')).toBeInTheDocument()
  })

  it('redirects unknown routes to /', () => {
    setAuthenticated(true)
    renderAt('/nowhere')
    expect(screen.getByText('home')).toBeInTheDocument()
  })
})
