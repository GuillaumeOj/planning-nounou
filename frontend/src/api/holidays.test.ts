import { afterEach, describe, expect, it, vi } from 'vitest'
import { api } from './client'
import { getBankHolidays } from './holidays'

afterEach(() => {
  vi.restoreAllMocks()
})

// biome-ignore lint/suspicious/noExplicitAny: canned axios response
const resp = (data: unknown) => ({ data }) as any

describe('holidays api', () => {
  it('getBankHolidays fetches the collection filtered by year', async () => {
    const get = vi
      .spyOn(api, 'get')
      .mockResolvedValue(resp([{ id: '1', name: 'Noël' }]))
    const result = await getBankHolidays(2026)
    expect(get).toHaveBeenCalledWith('/holidays/', { params: { year: 2026 } })
    expect(result).toEqual([{ id: '1', name: 'Noël' }])
  })
})
