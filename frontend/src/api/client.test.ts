import axios from 'axios'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { clearTokens, getAccessToken, setTokens } from '../auth/tokenStorage'
import { api } from './client'

// biome-ignore lint/suspicious/noExplicitAny: test helpers build partial axios shapes
type Any = any

function unauthorizedAdapter() {
  return vi.fn(async (config: Any) => {
    const error: Any = new Error('unauthorized')
    error.config = config
    error.response = { status: 401, data: {} }
    throw error
  })
}

beforeEach(() => {
  clearTokens()
  vi.restoreAllMocks()
})

afterEach(() => {
  // Reset to the default XHR/http adapter so other suites are unaffected.
  api.defaults.adapter = undefined
})

describe('api client interceptors', () => {
  it('attaches the bearer token when present', async () => {
    setTokens({ access: 'abc', refresh: 'r1' })
    const adapter = vi.fn(async (config: Any) => ({
      data: { ok: true },
      status: 200,
      statusText: 'OK',
      headers: {},
      config,
    }))
    api.defaults.adapter = adapter

    await api.get('/thing/')

    expect(adapter.mock.calls[0][0].headers.Authorization).toBe('Bearer abc')
  })

  it('omits the header when no token is stored', async () => {
    const adapter = vi.fn(async (config: Any) => ({
      data: {},
      status: 200,
      statusText: 'OK',
      headers: {},
      config,
    }))
    api.defaults.adapter = adapter

    await api.get('/thing/')

    expect(adapter.mock.calls[0][0].headers.Authorization).toBeUndefined()
  })

  it('refreshes on 401 and replays the request', async () => {
    setTokens({ access: 'old', refresh: 'r1' })
    const post = vi
      .spyOn(axios, 'post')
      .mockResolvedValue({ data: { access: 'new' } } as Any)

    let call = 0
    api.defaults.adapter = vi.fn(async (config: Any) => {
      call += 1
      if (call === 1) {
        const error: Any = new Error('unauthorized')
        error.config = config
        error.response = { status: 401, data: {} }
        throw error
      }
      return {
        data: { ok: true },
        status: 200,
        statusText: 'OK',
        headers: {},
        config,
      }
    })

    const response = await api.get('/secure/')

    expect(post).toHaveBeenCalledWith(
      expect.stringContaining('/auth/token/refresh/'),
      {
        refresh: 'r1',
      },
    )
    expect(response.data).toEqual({ ok: true })
    expect(getAccessToken()).toBe('new')
  })

  it('clears tokens when the refresh fails', async () => {
    setTokens({ access: 'old', refresh: 'r1' })
    vi.spyOn(axios, 'post').mockRejectedValue(new Error('refresh failed'))
    api.defaults.adapter = unauthorizedAdapter()

    await expect(api.get('/secure/')).rejects.toThrow()
    expect(getAccessToken()).toBeNull()
  })

  it('does not attempt refresh without a refresh token', async () => {
    setTokens({ access: 'old', refresh: 'r1' })
    clearTokens()
    setTokens({ access: 'old', refresh: '' })
    // Empty refresh string is falsy after storage read only if cleared; ensure
    // no refresh token present.
    clearTokens()
    const post = vi.spyOn(axios, 'post')
    api.defaults.adapter = unauthorizedAdapter()

    await expect(api.get('/secure/')).rejects.toThrow()
    expect(post).not.toHaveBeenCalled()
  })

  it('passes non-401 errors straight through', async () => {
    api.defaults.adapter = vi.fn(async (config: Any) => {
      const error: Any = new Error('server error')
      error.config = config
      error.response = { status: 500, data: {} }
      throw error
    })

    await expect(api.get('/x/')).rejects.toThrow('server error')
  })
})
