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

export interface ProfileUpdate {
  first_name: string
  last_name: string
}

export async function updateProfile(profile: ProfileUpdate): Promise<User> {
  const { data } = await api.patch<User>('/auth/me/', profile)
  return data
}

export interface EmailChange {
  current_password: string
  email: string
}

export async function changeEmail(payload: EmailChange): Promise<User> {
  const { data } = await api.put<User>('/auth/email/', payload)
  return data
}

export interface PasswordChange {
  current_password: string
  new_password: string
}

export async function changePassword(payload: PasswordChange): Promise<void> {
  await api.put('/auth/password/', payload)
}
