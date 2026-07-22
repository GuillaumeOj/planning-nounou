import type { FetchBaseQueryError } from '@reduxjs/toolkit/query/react'
import { describe, expect, it } from 'vitest'
import { extractErrorMessages } from '@/src/api/errors'

// An HTTP error the way RTK Query's fetchBaseQuery surfaces it: a numeric status
// plus the parsed response body under `data`.
function httpErrorWith(data: unknown, status = 400): FetchBaseQueryError {
  return { status, data } as FetchBaseQueryError
}

describe('extractErrorMessages', () => {
  it('returns the fallback for an unknown error', () => {
    expect(extractErrorMessages({}, 'fallback')).toEqual(['fallback'])
  })

  it('reads a DRF detail string', () => {
    expect(
      extractErrorMessages(httpErrorWith({ detail: 'No active account' })),
    ).toEqual(['No active account'])
  })

  it('returns every field error as a separate item', () => {
    const messages = extractErrorMessages(
      httpErrorWith({
        email: ['Already exists.'],
        password: ['Too short.', 'Too common.'],
      }),
    )
    expect(messages).toEqual(['Already exists.', 'Too short.', 'Too common.'])
  })

  it('returns a plain string body as a single item', () => {
    expect(extractErrorMessages(httpErrorWith('Bad Request'))).toEqual([
      'Bad Request',
    ])
  })

  it('uses the fallback when the body has no strings', () => {
    expect(extractErrorMessages(httpErrorWith({ code: 42 }), 'nope')).toEqual([
      'nope',
    ])
  })

  it('uses the fallback for a response with no parseable body (e.g. 500)', () => {
    expect(extractErrorMessages(httpErrorWith(null, 500), 'nope')).toEqual([
      'nope',
    ])
  })

  it('falls back for a transport-level (FETCH_ERROR) failure', () => {
    // No structured HTTP body, so we never leak an internal string to the user.
    expect(
      extractErrorMessages(
        { status: 'FETCH_ERROR', error: 'Failed to fetch' },
        'fallback',
      ),
    ).toEqual(['fallback'])
  })

  it('falls back for a thrown JS/serialized error', () => {
    expect(
      extractErrorMessages({ message: 'Something broke' }, 'fallback'),
    ).toEqual(['fallback'])
  })
})
