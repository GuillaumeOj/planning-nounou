import { HttpResponse, http } from 'msw'
import { beforeEach, describe, expect, it } from 'vitest'
import { api } from '@/src/api'
import { makeStore } from '@/src/app/store'
import { clearTokens, getAccessToken, setTokens } from '@/src/auth/tokenStorage'
import { server } from '@/tests/msw/server'

// The refresh flow lives in baseQueryWithReauth (src/api/baseQuery.ts). It's exercised
// end-to-end here: dispatch a real query, have the API answer 401 for the stale token,
// and assert the base query silently refreshes and replays the request.
const FAMILIES = '*/api/families/'
const REFRESH = '*/api/auth/jwt/refresh/'

beforeEach(() => {
  clearTokens()
})

describe('baseQueryWithReauth', () => {
  it('refreshes the access token on a 401 and replays the request', async () => {
    setTokens({ access: 'stale', refresh: 'good-refresh' })
    server.use(
      // The stale token is rejected; the refreshed one is accepted.
      http.get(FAMILIES, ({ request }) => {
        const auth = request.headers.get('Authorization')
        if (auth === 'Bearer fresh') {
          return HttpResponse.json([{ id: 'f1', name: 'Home' }])
        }
        return new HttpResponse(null, { status: 401 })
      }),
      http.post(REFRESH, () => HttpResponse.json({ access: 'fresh' })),
    )

    const store = makeStore()
    const result = await store.dispatch(api.endpoints.familiesList.initiate())

    expect(result.data).toEqual([{ id: 'f1', name: 'Home' }])
    // The new access token was persisted for subsequent requests.
    expect(getAccessToken()).toBe('fresh')
  })

  it('clears the tokens when the refresh itself fails', async () => {
    setTokens({ access: 'stale', refresh: 'expired-refresh' })
    server.use(
      http.get(FAMILIES, () => new HttpResponse(null, { status: 401 })),
      http.post(REFRESH, () => new HttpResponse(null, { status: 401 })),
    )

    const store = makeStore()
    const result = await store.dispatch(api.endpoints.familiesList.initiate())

    expect(result.isError).toBe(true)
    expect(getAccessToken()).toBeNull()
  })

  it('does not attempt a refresh when no refresh token is stored', async () => {
    let refreshCalls = 0
    server.use(
      http.get(FAMILIES, () => new HttpResponse(null, { status: 401 })),
      http.post(REFRESH, () => {
        refreshCalls += 1
        return HttpResponse.json({ access: 'fresh' })
      }),
    )

    const store = makeStore()
    const result = await store.dispatch(api.endpoints.familiesList.initiate())

    expect(result.isError).toBe(true)
    expect(refreshCalls).toBe(0)
  })
})
