import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { HttpResponse, http } from 'msw'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AuthProvider, type User, useAuth } from '@/src/auth/AuthContext'
import { clearTokens, getAccessToken, setTokens } from '@/src/auth/tokenStorage'
import { server } from '@/tests/msw/server'

// AuthContext dispatches the generated auth endpoints through the app's singleton
// store, so its network is mocked at the HTTP layer with MSW. Tokens live in
// localStorage ('nounou.access' / 'nounou.refresh').
const JWT_CREATE = '*/api/auth/jwt/create/'
const JWT_REFRESH = '*/api/auth/jwt/refresh/'
const JWT_BLACKLIST = '*/api/auth/jwt/blacklist/'
const ME = '*/api/auth/users/me/'
const USERS = '*/api/auth/users/'

const USER: User = {
  id: '1',
  email: 'x@example.com',
  first_name: '',
  last_name: '',
}

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
    server.use(http.get(ME, () => HttpResponse.json(USER)))

    renderHarness()

    await waitFor(() =>
      expect(screen.getByTestId('state')).toHaveTextContent(
        'auth:x@example.com',
      ),
    )
  })

  it('clears tokens when the stored session is invalid', async () => {
    setTokens({ access: 'bad', refresh: 'r' })
    // The stored access token is rejected and the refresh cannot recover it, so
    // the session ends up cleared.
    server.use(
      http.get(ME, () => new HttpResponse(null, { status: 401 })),
      http.post(JWT_REFRESH, () => new HttpResponse(null, { status: 401 })),
    )

    renderHarness()

    await waitFor(() =>
      expect(screen.getByTestId('state')).toHaveTextContent('anon'),
    )
    expect(getAccessToken()).toBeNull()
  })

  it('login stores tokens and loads the user', async () => {
    server.use(
      http.post(JWT_CREATE, () =>
        HttpResponse.json({ access: 'a', refresh: 'r' }),
      ),
      http.get(ME, () => HttpResponse.json(USER)),
    )
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
    let registerBody: unknown
    let loginCalled = false
    server.use(
      http.post(USERS, async ({ request }) => {
        registerBody = await request.json()
        return HttpResponse.json(USER, { status: 201 })
      }),
      http.post(JWT_CREATE, () => {
        loginCalled = true
        return HttpResponse.json({ access: 'a', refresh: 'r' })
      }),
    )
    renderHarness()
    await waitFor(() =>
      expect(screen.getByTestId('state')).toHaveTextContent('anon'),
    )

    await userEvent.click(screen.getByText('register'))

    // The account is inactive until verified, so the session stays anonymous
    // and login is never called on its behalf.
    await waitFor(() =>
      expect(registerBody).toMatchObject({
        email: 'x@example.com',
        password: 'pw',
      }),
    )
    expect(screen.getByTestId('state')).toHaveTextContent('anon')
    expect(loginCalled).toBe(false)
    expect(getAccessToken()).toBeNull()
  })

  it('logout blacklists the refresh token and clears the session', async () => {
    let blacklistBody: unknown
    server.use(
      http.post(JWT_CREATE, () =>
        HttpResponse.json({ access: 'a', refresh: 'r' }),
      ),
      http.get(ME, () => HttpResponse.json(USER)),
      http.post(JWT_BLACKLIST, async ({ request }) => {
        blacklistBody = await request.json()
        return new HttpResponse(null, { status: 204 })
      }),
    )
    renderHarness()
    await userEvent.click(screen.getByText('login'))
    await waitFor(() =>
      expect(screen.getByTestId('state')).toHaveTextContent('auth:'),
    )

    await userEvent.click(screen.getByText('logout'))

    await waitFor(() =>
      expect(screen.getByTestId('state')).toHaveTextContent('anon'),
    )
    await waitFor(() => expect(blacklistBody).toMatchObject({ refresh: 'r' }))
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
