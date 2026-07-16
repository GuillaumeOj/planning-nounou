import { afterEach, describe, expect, it, vi } from 'vitest'
import { api } from '@/api/client'
import { createLeave, deleteLeave, getLeaves, updateLeave } from '@/api/leaves'

afterEach(() => {
  vi.restoreAllMocks()
})

// biome-ignore lint/suspicious/noExplicitAny: canned axios response
const resp = (data: unknown) => ({ data }) as any

describe('leaves api', () => {
  it('getLeaves fetches the contract collection', async () => {
    const get = vi.spyOn(api, 'get').mockResolvedValue(resp([{ id: 1 }]))
    const result = await getLeaves('7', '2')
    expect(get).toHaveBeenCalledWith('/families/7/contracts/2/leaves/')
    expect(result).toEqual([{ id: 1 }])
  })

  it('createLeave posts to the contract', async () => {
    const post = vi.spyOn(api, 'post').mockResolvedValue(resp({ id: 3 }))
    const input = {
      leave_type: 'paid' as const,
      start_date: '2026-07-06',
      end_date: '2026-07-10',
      portion: 'full_day' as const,
    }
    await createLeave('7', '2', input)
    expect(post).toHaveBeenCalledWith('/families/7/contracts/2/leaves/', input)
  })

  it('updateLeave patches by id', async () => {
    const patch = vi.spyOn(api, 'patch').mockResolvedValue(resp({ id: 3 }))
    await updateLeave('7', '2', '3', { end_date: '2026-07-15' })
    expect(patch).toHaveBeenCalledWith('/families/7/contracts/2/leaves/3/', {
      end_date: '2026-07-15',
    })
  })

  it('deleteLeave deletes by id', async () => {
    const del = vi.spyOn(api, 'delete').mockResolvedValue(resp(''))
    await deleteLeave('7', '2', '3')
    expect(del).toHaveBeenCalledWith('/families/7/contracts/2/leaves/3/')
  })
})
