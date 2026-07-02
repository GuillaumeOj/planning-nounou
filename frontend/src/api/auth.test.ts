import { afterEach, describe, expect, it, vi } from 'vitest'
import { getMe, login, refresh, register } from './auth'
import { api } from './client'

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

    expect(post).toHaveBeenCalledWith('/auth/login/', {
      email: 'x@example.com',
      password: 'pw',
    })
    expect(result).toEqual({ access: 'a', refresh: 'r' })
  })

  it('register posts credentials and returns the user', async () => {
    const post = vi
      .spyOn(api, 'post')
      // biome-ignore lint/suspicious/noExplicitAny: canned axios response
      .mockResolvedValue({ data: { id: 1, email: 'x@example.com' } } as any)

    const result = await register({ email: 'x@example.com', password: 'pw' })

    expect(post).toHaveBeenCalledWith('/auth/register/', {
      email: 'x@example.com',
      password: 'pw',
    })
    expect(result).toMatchObject({ id: 1, email: 'x@example.com' })
  })

  it('refresh posts the refresh token', async () => {
    const post = vi
      .spyOn(api, 'post')
      // biome-ignore lint/suspicious/noExplicitAny: canned axios response
      .mockResolvedValue({ data: { access: 'new' } } as any)

    const result = await refresh('r1')

    expect(post).toHaveBeenCalledWith('/auth/token/refresh/', { refresh: 'r1' })
    expect(result).toEqual({ access: 'new' })
  })

  it('getMe fetches the current user', async () => {
    const get = vi
      .spyOn(api, 'get')
      // biome-ignore lint/suspicious/noExplicitAny: canned axios response
      .mockResolvedValue({ data: { id: 1, email: 'x@example.com' } } as any)

    const result = await getMe()

    expect(get).toHaveBeenCalledWith('/auth/me/')
    expect(result).toMatchObject({ email: 'x@example.com' })
  })
})
