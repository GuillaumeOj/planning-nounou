import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react'
import { api, type ProfileRead } from '@/src/api'
import { store } from '@/src/app/store'
import {
  clearTokens,
  getAccessToken,
  getRefreshToken,
  setTokens,
} from '@/src/auth/tokenStorage'

// The authenticated user, as returned by /auth/users/me/ (djoser ProfileSerializer).
export type User = ProfileRead
export interface Credentials {
  email: string
  password: string
}

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

// One-shot server reads/writes run through the RTK Query store directly (not hooks),
// since auth is an imperative flow outside the React render tree. `subscribe: false`
// keeps these from leaving lingering cache subscriptions behind.
function fetchMe(): Promise<User> {
  return store
    .dispatch(
      api.endpoints.authUsersMeRetrieve.initiate(undefined, {
        subscribe: false,
        forceRefetch: true,
      }),
    )
    .unwrap()
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  // On first load, resume an existing session if an access token is present.
  useEffect(() => {
    if (!getAccessToken()) {
      setIsLoading(false)
      return
    }
    fetchMe()
      .then(setUser)
      .catch(() => clearTokens())
      .finally(() => setIsLoading(false))
  }, [])

  const login = useCallback(async (credentials: Credentials): Promise<void> => {
    const tokens = await store
      .dispatch(
        api.endpoints.authJwtCreateCreate.initiate({
          tokenObtainPairRequest: credentials,
        }),
      )
      .unwrap()
    setTokens(tokens)
    // The signed-in user changed — drop any cache from a previous session.
    store.dispatch(api.util.resetApiState())
    setUser(await fetchMe())
  }, [])

  const register = useCallback(
    async (
      credentials: Credentials,
      invitationToken?: string,
    ): Promise<User> => {
      // No auto-login: the new account is inactive until email verification.
      return store
        .dispatch(
          api.endpoints.authUsersCreate.initiate({
            registerRequest: {
              ...credentials,
              invitation_token: invitationToken,
            },
          }),
        )
        .unwrap()
    },
    [],
  )

  const logout = useCallback((): void => {
    // Clear the local session immediately; blacklisting the refresh token is
    // best-effort and must not delay logout, so fire it without awaiting.
    const refresh = getRefreshToken()
    clearTokens()
    setUser(null)
    // Wipe the RTK Query cache so a next user never sees the previous one's data.
    store.dispatch(api.util.resetApiState())
    if (refresh) {
      void store
        .dispatch(
          api.endpoints.authJwtBlacklistCreate.initiate({
            tokenBlacklistRequest: { refresh },
          }),
        )
        .unwrap()
        .catch(() => {
          // Ignore: a failed/expired blacklist call is harmless — the tokens are
          // already gone locally.
        })
    }
  }, [])

  const refreshUser = useCallback(async (updated?: User): Promise<void> => {
    setUser(updated ?? (await fetchMe()))
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
