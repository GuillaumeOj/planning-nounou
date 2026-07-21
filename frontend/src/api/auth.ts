import { AUTH_REFRESH_PATH, api } from '@/src/api/client'
import type { TokenPair } from '@/src/auth/tokenStorage'

// Auth is served by djoser (user flows) + SimpleJWT (tokens), all under /auth/.
//   jwt/create  jwt/refresh  jwt/blacklist  users/  users/me/
//   users/activation/  users/resend_activation/
//   users/reset_password/  users/reset_password_confirm/
//   users/set_email/  users/set_password/

export interface User {
  id: string
  email: string
  first_name: string
  last_name: string
}

export interface Credentials {
  email: string
  password: string
}

export async function login(credentials: Credentials): Promise<TokenPair> {
  const { data } = await api.post<TokenPair>('/auth/jwt/create/', credentials)
  return data
}

export async function register(
  credentials: Credentials,
  invitationToken?: string,
): Promise<User> {
  // A token joins the new account to the invited family on creation (claim flow).
  // The account is created inactive: the user must verify their email before
  // they can log in.
  const payload = invitationToken
    ? { ...credentials, invitation_token: invitationToken }
    : credentials
  const { data } = await api.post<User>('/auth/users/', payload)
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

// Best-effort logout: blacklist the refresh token server-side so it can no
// longer mint access tokens. Callers still clear the local tokens regardless.
export async function logout(refreshToken: string): Promise<void> {
  await api.post('/auth/jwt/blacklist/', { refresh: refreshToken })
}

export async function getMe(): Promise<User> {
  const { data } = await api.get<User>('/auth/users/me/')
  return data
}

export interface ProfileUpdate {
  first_name: string
  last_name: string
}

export async function updateProfile(profile: ProfileUpdate): Promise<User> {
  const { data } = await api.patch<User>('/auth/users/me/', profile)
  return data
}

export interface EmailChange {
  current_password: string
  new_email: string
}

// Returns nothing: djoser's set_email replies 204. Refetch the profile after.
export async function changeEmail(payload: EmailChange): Promise<void> {
  await api.post('/auth/users/set_email/', payload)
}

export interface PasswordChange {
  current_password: string
  new_password: string
}

export async function changePassword(payload: PasswordChange): Promise<void> {
  await api.post('/auth/users/set_password/', payload)
}

// --- Email verification (activation) ---------------------------------------

export interface UidToken {
  uid: string
  token: string
}

export async function activate(payload: UidToken): Promise<void> {
  await api.post('/auth/users/activation/', payload)
}

export async function resendActivation(email: string): Promise<void> {
  await api.post('/auth/users/resend_activation/', { email })
}

// --- Password reset (forgot password) --------------------------------------

export async function requestPasswordReset(email: string): Promise<void> {
  await api.post('/auth/users/reset_password/', { email })
}

export interface PasswordResetConfirm extends UidToken {
  new_password: string
}

export async function confirmPasswordReset(
  payload: PasswordResetConfirm,
): Promise<void> {
  await api.post('/auth/users/reset_password_confirm/', payload)
}
