import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react'
import type { Credentials, User } from '@/src/api/auth'
import {
  getMe,
  login as loginRequest,
  logout as logoutRequest,
  register as registerRequest,
} from '@/src/api/auth'
import {
  clearTokens,
  getAccessToken,
  getRefreshToken,
  setTokens,
} from '@/src/auth/tokenStorage'

export interface AuthContextValue {
  user: User | null
  isAuthenticated: boolean
  isLoading: boolean
  login: (credentials: Credentials) => Promise<void>
  // Creates the account and returns it. The account is inactive until the user
  // verifies their email, so this does NOT log them in — the caller shows a
  // "check your email" step. An optional invitation token joins the new account
  // to a family on signup.
  register: (
    credentials: Credentials,
    invitationToken?: string,
  ) => Promise<User>
  logout: () => void
  // Update the cached user after a profile or email change. Pass the updated
  // user when the caller already has it (e.g. an endpoint that returns it) to
  // avoid a redundant round-trip; omit it to re-fetch from the server.
  refreshUser: (updated?: User) => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  // On first load, resume an existing session if an access token is present.
  useEffect(() => {
    if (!getAccessToken()) {
      setIsLoading(false)
      return
    }
    getMe()
      .then(setUser)
      .catch(() => clearTokens())
      .finally(() => setIsLoading(false))
  }, [])

  const login = useCallback(async (credentials: Credentials): Promise<void> => {
    const tokens = await loginRequest(credentials)
    setTokens(tokens)
    setUser(await getMe())
  }, [])

  const register = useCallback(
    async (
      credentials: Credentials,
      invitationToken?: string,
    ): Promise<User> => {
      // No auto-login: the new account is inactive until email verification.
      return registerRequest(credentials, invitationToken)
    },
    [],
  )

  const logout = useCallback((): void => {
    // Clear the local session immediately; blacklisting the refresh token is
    // best-effort and must not delay logout, so fire it without awaiting.
    const refresh = getRefreshToken()
    clearTokens()
    setUser(null)
    if (refresh) {
      void logoutRequest(refresh).catch(() => {
        // Ignore: a failed/expired blacklist call is harmless — the tokens are
        // already gone locally.
      })
    }
  }, [])

  const refreshUser = useCallback(async (updated?: User): Promise<void> => {
    setUser(updated ?? (await getMe()))
  }, [])

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      isAuthenticated: user !== null,
      isLoading,
      login,
      register,
      logout,
      refreshUser,
    }),
    [user, isLoading, login, register, logout, refreshUser],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}
