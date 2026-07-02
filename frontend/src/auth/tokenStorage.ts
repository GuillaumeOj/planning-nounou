// Small wrapper around localStorage so token persistence lives in one place and
// is easy to stub in tests.
const ACCESS_KEY = 'nounou.access'
const REFRESH_KEY = 'nounou.refresh'

export interface TokenPair {
  access: string
  refresh: string
}

export function getAccessToken(): string | null {
  return localStorage.getItem(ACCESS_KEY)
}

export function getRefreshToken(): string | null {
  return localStorage.getItem(REFRESH_KEY)
}

export function setTokens({ access, refresh }: TokenPair): void {
  localStorage.setItem(ACCESS_KEY, access)
  localStorage.setItem(REFRESH_KEY, refresh)
}

export function setAccessToken(access: string): void {
  localStorage.setItem(ACCESS_KEY, access)
}

export function clearTokens(): void {
  localStorage.removeItem(ACCESS_KEY)
  localStorage.removeItem(REFRESH_KEY)
}
