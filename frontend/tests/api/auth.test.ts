import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  activate,
  changeEmail,
  changePassword,
  confirmPasswordReset,
  getMe,
  login,
  logout,
  refresh,
  register,
  requestPasswordReset,
  resendActivation,
  updateProfile,
} from '@/src/api/auth'
import { api } from '@/src/api/client'

afterEach(() => {
  vi.restoreAllMocks()
})

describe('auth api', () => {
  it('login posts credentials and returns tokens', async () => {
    const post = vi
      .spyOn(api, 'post')
      // biome-ignore lint/suspicious/noExplicitAny: canned axios response
      .mockResolvedValue({ data: { access: 'a', refresh: 'r' } } as any)

    const result = await login({ email: 'x@example.com', password: 'pw' })

    expect(post).toHaveBeenCalledWith('/auth/jwt/create/', {
      email: 'x@example.com',
      password: 'pw',
    })
    expect(result).toEqual({ access: 'a', refresh: 'r' })
  })

  it('register posts credentials and returns the user', async () => {
    const post = vi
      .spyOn(api, 'post')
      // biome-ignore lint/suspicious/noExplicitAny: canned axios response
      .mockResolvedValue({ data: { id: '1', email: 'x@example.com' } } as any)

    const result = await register({ email: 'x@example.com', password: 'pw' })

    expect(post).toHaveBeenCalledWith('/auth/users/', {
      email: 'x@example.com',
      password: 'pw',
    })
    expect(result).toMatchObject({ id: '1', email: 'x@example.com' })
  })

  it('register includes the invitation token when provided', async () => {
    const post = vi
      .spyOn(api, 'post')
      // biome-ignore lint/suspicious/noExplicitAny: canned axios response
      .mockResolvedValue({ data: { id: '1', email: 'x@example.com' } } as any)

    await register({ email: 'x@example.com', password: 'pw' }, 'tok123')

    expect(post).toHaveBeenCalledWith('/auth/users/', {
      email: 'x@example.com',
      password: 'pw',
      invitation_token: 'tok123',
    })
  })

  it('refresh posts the refresh token', async () => {
    const post = vi
      .spyOn(api, 'post')
      // biome-ignore lint/suspicious/noExplicitAny: canned axios response
      .mockResolvedValue({ data: { access: 'new' } } as any)

    const result = await refresh('r1')

    expect(post).toHaveBeenCalledWith('/auth/jwt/refresh/', { refresh: 'r1' })
    expect(result).toEqual({ access: 'new' })
  })

  it('logout blacklists the refresh token', async () => {
    const post = vi
      .spyOn(api, 'post')
      // biome-ignore lint/suspicious/noExplicitAny: canned axios response
      .mockResolvedValue({ data: {} } as any)

    await logout('r1')

    expect(post).toHaveBeenCalledWith('/auth/jwt/blacklist/', { refresh: 'r1' })
  })

  it('getMe fetches the current user', async () => {
    const get = vi
      .spyOn(api, 'get')
      // biome-ignore lint/suspicious/noExplicitAny: canned axios response
      .mockResolvedValue({ data: { id: '1', email: 'x@example.com' } } as any)

    const result = await getMe()

    expect(get).toHaveBeenCalledWith('/auth/users/me/')
    expect(result).toMatchObject({ email: 'x@example.com' })
  })

  it('updateProfile patches the names and returns the user', async () => {
    const patch = vi
      .spyOn(api, 'patch')
      // biome-ignore lint/suspicious/noExplicitAny: canned axios response
      .mockResolvedValue({ data: { id: '1', first_name: 'Ada' } } as any)

    const result = await updateProfile({
      first_name: 'Ada',
      last_name: 'Lovelace',
    })

    expect(patch).toHaveBeenCalledWith('/auth/users/me/', {
      first_name: 'Ada',
      last_name: 'Lovelace',
    })
    expect(result).toMatchObject({ first_name: 'Ada' })
  })

  it('changeEmail posts new_email guarded by the current password', async () => {
    const post = vi
      .spyOn(api, 'post')
      // biome-ignore lint/suspicious/noExplicitAny: canned axios response
      .mockResolvedValue({ data: '' } as any)

    await changeEmail({
      current_password: 'pw',
      new_email: 'new@example.com',
    })

    expect(post).toHaveBeenCalledWith('/auth/users/set_email/', {
      current_password: 'pw',
      new_email: 'new@example.com',
    })
  })

  it('changePassword posts the payload', async () => {
    const post = vi
      .spyOn(api, 'post')
      // biome-ignore lint/suspicious/noExplicitAny: canned axios response
      .mockResolvedValue({ data: '' } as any)

    await changePassword({ current_password: 'pw', new_password: 'newpw' })

    expect(post).toHaveBeenCalledWith('/auth/users/set_password/', {
      current_password: 'pw',
      new_password: 'newpw',
    })
  })

  it('activate posts the uid and token', async () => {
    const post = vi
      .spyOn(api, 'post')
      // biome-ignore lint/suspicious/noExplicitAny: canned axios response
      .mockResolvedValue({ data: '' } as any)

    await activate({ uid: 'u1', token: 't1' })

    expect(post).toHaveBeenCalledWith('/auth/users/activation/', {
      uid: 'u1',
      token: 't1',
    })
  })

  it('resendActivation posts the email', async () => {
    const post = vi
      .spyOn(api, 'post')
      // biome-ignore lint/suspicious/noExplicitAny: canned axios response
      .mockResolvedValue({ data: '' } as any)

    await resendActivation('x@example.com')

    expect(post).toHaveBeenCalledWith('/auth/users/resend_activation/', {
      email: 'x@example.com',
    })
  })

  it('requestPasswordReset posts the email', async () => {
    const post = vi
      .spyOn(api, 'post')
      // biome-ignore lint/suspicious/noExplicitAny: canned axios response
      .mockResolvedValue({ data: '' } as any)

    await requestPasswordReset('x@example.com')

    expect(post).toHaveBeenCalledWith('/auth/users/reset_password/', {
      email: 'x@example.com',
    })
  })

  it('confirmPasswordReset posts the uid, token and new password', async () => {
    const post = vi
      .spyOn(api, 'post')
      // biome-ignore lint/suspicious/noExplicitAny: canned axios response
      .mockResolvedValue({ data: '' } as any)

    await confirmPasswordReset({
      uid: 'u1',
      token: 't1',
      new_password: 'newpw',
    })

    expect(post).toHaveBeenCalledWith('/auth/users/reset_password_confirm/', {
      uid: 'u1',
      token: 't1',
      new_password: 'newpw',
    })
  })
})
