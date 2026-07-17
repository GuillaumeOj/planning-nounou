import axios, { type AxiosRequestConfig } from 'axios'
import {
  clearTokens,
  getAccessToken,
  getRefreshToken,
  setAccessToken,
} from '@/src/auth/tokenStorage'

// In dev, Vite proxies /api -> localhost:8000. In production the SPA and API
// share an origin on Vercel, so a relative baseURL works in both cases.
// VITE_API_URL can override this (e.g. to point at a separate backend host).
const baseURL = import.meta.env.VITE_API_URL ?? '/api'

export const api = axios.create({ baseURL })

// Single source for the token-refresh endpoint (used by the interceptor below
// and by api/auth.ts).
export const AUTH_REFRESH_PATH = '/auth/token/refresh/'

// Attach the bearer access token to every outgoing request when present.
api.interceptors.request.use((config) => {
  const token = getAccessToken()
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

// On a 401, try to refresh the access token once and replay the request. A bare
// axios call is used for the refresh so it does not recurse through this handler.
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const original = error.config as
      | (AxiosRequestConfig & { _retried?: boolean })
      | undefined
    const refresh = getRefreshToken()

    if (
      error.response?.status === 401 &&
      refresh &&
      original &&
      !original._retried
    ) {
      original._retried = true
      try {
        const { data } = await axios.post<{ access: string }>(
          `${baseURL}${AUTH_REFRESH_PATH}`,
          { refresh },
        )
        setAccessToken(data.access)
        original.headers = {
          ...original.headers,
          Authorization: `Bearer ${data.access}`,
        }
        return api(original)
      } catch (refreshError) {
        clearTokens()
        return Promise.reject(refreshError)
      }
    }

    return Promise.reject(error)
  },
)
