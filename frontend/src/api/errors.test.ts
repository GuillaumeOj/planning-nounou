import { AxiosError } from 'axios'
import { describe, expect, it } from 'vitest'
import { extractErrorMessages } from './errors'

function axiosErrorWith(data: unknown): AxiosError {
  const error = new AxiosError('request failed')
  // biome-ignore lint/suspicious/noExplicitAny: minimal response shape for the test
  error.response = { data } as any
  return error
}

describe('extractErrorMessages', () => {
  it('returns the fallback for a non-axios error', () => {
    expect(extractErrorMessages(new Error('boom'), 'fallback')).toEqual([
      'fallback',
    ])
  })

  it('reads a DRF detail string', () => {
    expect(
      extractErrorMessages(axiosErrorWith({ detail: 'No active account' })),
    ).toEqual(['No active account'])
  })

  it('returns every field error as a separate item', () => {
    const messages = extractErrorMessages(
      axiosErrorWith({
        email: ['Already exists.'],
        password: ['Too short.', 'Too common.'],
      }),
    )
    expect(messages).toEqual(['Already exists.', 'Too short.', 'Too common.'])
  })

  it('returns a plain string body as a single item', () => {
    expect(extractErrorMessages(axiosErrorWith('Bad Request'))).toEqual([
      'Bad Request',
    ])
  })

  it('uses the fallback when the body has no strings', () => {
    expect(extractErrorMessages(axiosErrorWith({ code: 42 }), 'nope')).toEqual([
      'nope',
    ])
  })
})
