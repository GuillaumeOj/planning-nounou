import { afterEach, describe, expect, it } from 'vitest'
import {
  clearTokens,
  getAccessToken,
  getRefreshToken,
  setAccessToken,
  setTokens,
} from './tokenStorage'

describe('tokenStorage', () => {
  afterEach(() => {
    clearTokens()
  })

  it('returns null when nothing is stored', () => {
    expect(getAccessToken()).toBeNull()
    expect(getRefreshToken()).toBeNull()
  })

  it('stores and reads a token pair', () => {
    setTokens({ access: 'a1', refresh: 'r1' })
    expect(getAccessToken()).toBe('a1')
    expect(getRefreshToken()).toBe('r1')
  })

  it('replaces only the access token', () => {
    setTokens({ access: 'a1', refresh: 'r1' })
    setAccessToken('a2')
    expect(getAccessToken()).toBe('a2')
    expect(getRefreshToken()).toBe('r1')
  })

  it('clears both tokens', () => {
    setTokens({ access: 'a1', refresh: 'r1' })
    clearTokens()
    expect(getAccessToken()).toBeNull()
    expect(getRefreshToken()).toBeNull()
  })
})
