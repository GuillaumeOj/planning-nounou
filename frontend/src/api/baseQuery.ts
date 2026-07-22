import type {
  BaseQueryFn,
  FetchArgs,
  FetchBaseQueryError,
} from '@reduxjs/toolkit/query/react'
import { fetchBaseQuery } from '@reduxjs/toolkit/query/react'
import {
  clearTokens,
  getAccessToken,
  getRefreshToken,
  setAccessToken,
} from '@/src/auth/tokenStorage'

// In dev, Vite proxies /api -> localhost:8002. In production the SPA and API share
// an origin on Vercel, so a relative baseUrl works in both cases. VITE_API_URL can
// override this (e.g. to point at a separate backend host). Mirrors the old axios
// client so the migration keeps identical request behaviour.
const baseUrl = import.meta.env.VITE_API_URL ?? '/api'

// Single source for the token-refresh endpoint. djoser mounts SimpleJWT under /auth/jwt/.
export const AUTH_REFRESH_PATH = '/auth/jwt/refresh/'

const rawBaseQuery = fetchBaseQuery({
  baseUrl,
  prepareHeaders: (headers) => {
    const token = getAccessToken()
    if (token) {
      headers.set('Authorization', `Bearer ${token}`)
    }
    // The backend's LocaleMiddleware localises API error messages (and picks the
    // Brevo email template) off Accept-Language. I18nContext mirrors the resolved
    // UI language onto <html lang>, so read it from there — same behaviour the old
    // axios client had when it set this header.
    const lang = document.documentElement.lang
    if (lang) {
      headers.set('Accept-Language', lang)
    }
    return headers
  },
})

// Single-flight refresh: if several requests 401 at once, only the first hits the
// refresh endpoint; the rest await the same promise. Replaces the axios interceptor's
// `_retried` guard. Null when no refresh is in flight.
let refreshPromise: Promise<string | null> | null = null

async function refreshAccessToken(): Promise<string | null> {
  const refresh = getRefreshToken()
  if (!refresh) {
    return null
  }
  // A bare fetch (not rawBaseQuery) so the refresh itself can't recurse through
  // the 401 handler below.
  try {
    const response = await fetch(`${baseUrl}${AUTH_REFRESH_PATH}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh }),
    })
    if (!response.ok) {
      return null
    }
    const data = (await response.json()) as { access: string }
    setAccessToken(data.access)
    return data.access
  } catch {
    return null
  }
}

// fetchBaseQuery wrapper that mirrors the old axios response interceptor: on a 401,
// refresh the access token once and replay the original request. On refresh failure
// the tokens are cleared so the auth layer can redirect to sign-in.
export const baseQueryWithReauth: BaseQueryFn<
  string | FetchArgs,
  unknown,
  FetchBaseQueryError
> = async (args, apiArg, extraOptions) => {
  let result = await rawBaseQuery(args, apiArg, extraOptions)

  if (result.error?.status === 401 && getRefreshToken()) {
    // Coalesce concurrent refreshes into one in-flight request.
    refreshPromise ??= refreshAccessToken().finally(() => {
      refreshPromise = null
    })
    const newAccess = await refreshPromise

    if (newAccess) {
      result = await rawBaseQuery(args, apiArg, extraOptions)
    } else {
      clearTokens()
    }
  }

  return result
}
