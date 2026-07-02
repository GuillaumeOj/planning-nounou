import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react'
import type { Credentials, User } from '../api/auth'
import {
  getMe,
  login as loginRequest,
  register as registerRequest,
} from '../api/auth'
import { clearTokens, getAccessToken, setTokens } from './tokenStorage'

export interface AuthContextValue {
  user: User | null
  isAuthenticated: boolean
  isLoading: boolean
  login: (credentials: Credentials) => Promise<void>
  register: (credentials: Credentials) => Promise<void>
  logout: () => void
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
    async (credentials: Credentials): Promise<void> => {
      // Registration returns the user but no tokens, so log in for the tokens and
      // reuse the returned user instead of a second round-trip to getMe().
      const newUser = await registerRequest(credentials)
      const tokens = await loginRequest(credentials)
      setTokens(tokens)
      setUser(newUser)
    },
    [],
  )

  const logout = useCallback((): void => {
    clearTokens()
    setUser(null)
  }, [])

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      isAuthenticated: user !== null,
      isLoading,
      login,
      register,
      logout,
    }),
    [user, isLoading, login, register, logout],
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
