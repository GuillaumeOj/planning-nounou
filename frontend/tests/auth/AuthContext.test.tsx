import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  getMe,
  login as loginRequest,
  logout as logoutRequest,
  register as registerRequest,
} from '@/src/api/auth'
import { AuthProvider, useAuth } from '@/src/auth/AuthContext'
import { clearTokens, getAccessToken, setTokens } from '@/src/auth/tokenStorage'

vi.mock('@/src/api/auth', () => ({
  login: vi.fn(),
  register: vi.fn(),
  logout: vi.fn(),
  getMe: vi.fn(),
}))

const mockLogin = vi.mocked(loginRequest)
const mockRegister = vi.mocked(registerRequest)
const mockLogout = vi.mocked(logoutRequest)
const mockGetMe = vi.mocked(getMe)

const USER = { id: '1', email: 'x@example.com', first_name: '', last_name: '' }

function Harness() {
  const { user, isAuthenticated, isLoading, login, register, logout } =
    useAuth()
  return (
    <div>
      <p data-testid="state">
        {isLoading
          ? 'loading'
          : isAuthenticated
            ? `auth:${user?.email}`
            : 'anon'}
      </p>
      <button
        type="button"
        onClick={() => login({ email: 'x@example.com', password: 'pw' })}
      >
        login
      </button>
      <button
        type="button"
        onClick={() => register({ email: 'x@example.com', password: 'pw' })}
      >
        register
      </button>
      <button type="button" onClick={logout}>
        logout
      </button>
    </div>
  )
}

function renderHarness() {
  return render(
    <AuthProvider>
      <Harness />
    </AuthProvider>,
  )
}

beforeEach(() => {
  clearTokens()
  vi.clearAllMocks()
})

afterEach(() => {
  clearTokens()
})

describe('AuthProvider', () => {
  it('starts anonymous when no token is stored', async () => {
    renderHarness()
    await waitFor(() =>
      expect(screen.getByTestId('state')).toHaveTextContent('anon'),
    )
  })

  it('resumes a session from a stored token', async () => {
    setTokens({ access: 'a', refresh: 'r' })
    mockGetMe.mockResolvedValue(USER)

    renderHarness()

    await waitFor(() =>
      expect(screen.getByTestId('state')).toHaveTextContent(
        'auth:x@example.com',
      ),
    )
  })

  it('clears tokens when the stored session is invalid', async () => {
    setTokens({ access: 'bad', refresh: 'r' })
    mockGetMe.mockRejectedValue(new Error('401'))

    renderHarness()

    await waitFor(() =>
      expect(screen.getByTestId('state')).toHaveTextContent('anon'),
    )
    expect(getAccessToken()).toBeNull()
  })

  it('login stores tokens and loads the user', async () => {
    mockLogin.mockResolvedValue({ access: 'a', refresh: 'r' })
    mockGetMe.mockResolvedValue(USER)
    renderHarness()
    await waitFor(() =>
      expect(screen.getByTestId('state')).toHaveTextContent('anon'),
    )

    await userEvent.click(screen.getByText('login'))

    await waitFor(() =>
      expect(screen.getByTestId('state')).toHaveTextContent(
        'auth:x@example.com',
      ),
    )
    expect(getAccessToken()).toBe('a')
  })

  it('register does NOT log the user in (email verification required)', async () => {
    mockRegister.mockResolvedValue(USER)
    renderHarness()
    await waitFor(() =>
      expect(screen.getByTestId('state')).toHaveTextContent('anon'),
    )

    await userEvent.click(screen.getByText('register'))

    // The account is inactive until verified, so the session stays anonymous
    // and login is never called on its behalf.
    await waitFor(() =>
      expect(mockRegister).toHaveBeenCalledWith(
        { email: 'x@example.com', password: 'pw' },
        undefined,
      ),
    )
    expect(screen.getByTestId('state')).toHaveTextContent('anon')
    expect(mockLogin).not.toHaveBeenCalled()
    expect(getAccessToken()).toBeNull()
  })

  it('logout blacklists the refresh token and clears the session', async () => {
    mockLogin.mockResolvedValue({ access: 'a', refresh: 'r' })
    mockLogout.mockResolvedValue(undefined)
    mockGetMe.mockResolvedValue(USER)
    renderHarness()
    await userEvent.click(screen.getByText('login'))
    await waitFor(() =>
      expect(screen.getByTestId('state')).toHaveTextContent('auth:'),
    )

    await userEvent.click(screen.getByText('logout'))

    await waitFor(() =>
      expect(screen.getByTestId('state')).toHaveTextContent('anon'),
    )
    expect(mockLogout).toHaveBeenCalledWith('r')
    expect(getAccessToken()).toBeNull()
  })
})

describe('useAuth', () => {
  it('throws when used outside a provider', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(() => render(<Harness />)).toThrow(
      'useAuth must be used within an AuthProvider',
    )
    spy.mockRestore()
  })
})
