import type { TokenPair } from '../auth/tokenStorage'
import { AUTH_REFRESH_PATH, api } from './client'

export interface User {
  id: number
  email: string
  first_name: string
  last_name: string
}

export interface Credentials {
  email: string
  password: string
}

export async function login(credentials: Credentials): Promise<TokenPair> {
  const { data } = await api.post<TokenPair>('/auth/login/', credentials)
  return data
}

export async function register(credentials: Credentials): Promise<User> {
  const { data } = await api.post<User>('/auth/register/', credentials)
  return data
}

export async function refresh(
  refreshToken: string,
): Promise<{ access: string }> {
  const { data } = await api.post<{ access: string }>(AUTH_REFRESH_PATH, {
    refresh: refreshToken,
  })
  return data
}

export async function getMe(): Promise<User> {
  const { data } = await api.get<User>('/auth/me/')
  return data
}
