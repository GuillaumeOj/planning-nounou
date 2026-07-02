import { beforeEach, describe, expect, it, vi } from 'vitest'
import { api } from './client'
import { createNanny, deleteNanny, getNannies, updateNanny } from './nannies'

vi.mock('./client', () => ({
  api: {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  },
}))

const mockApi = vi.mocked(api)

const nanny = {
  id: 1,
  first_name: 'Marie',
  last_name: 'Dupont',
  starting_date: '2026-01-05',
  ending_date: null,
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('nannies api', () => {
  it('getNannies fetches the list', async () => {
    mockApi.get.mockResolvedValue({ data: [nanny] })

    const result = await getNannies()

    expect(mockApi.get).toHaveBeenCalledWith('/nannies/')
    expect(result).toEqual([nanny])
  })

  it('createNanny posts the payload', async () => {
    const input = {
      first_name: 'Marie',
      last_name: 'Dupont',
      starting_date: '2026-01-05',
      ending_date: null,
    }
    mockApi.post.mockResolvedValue({ data: nanny })

    const result = await createNanny(input)

    expect(mockApi.post).toHaveBeenCalledWith('/nannies/', input)
    expect(result).toEqual(nanny)
  })

  it('updateNanny patches the given id', async () => {
    const input = {
      first_name: 'Marie',
      last_name: 'Dupont',
      starting_date: '2026-01-05',
      ending_date: '2026-12-31',
    }
    mockApi.patch.mockResolvedValue({ data: { ...nanny, ...input } })

    const result = await updateNanny(1, input)

    expect(mockApi.patch).toHaveBeenCalledWith('/nannies/1/', input)
    expect(result.ending_date).toBe('2026-12-31')
  })

  it('deleteNanny deletes the given id', async () => {
    mockApi.delete.mockResolvedValue({ data: '' })

    await deleteNanny(1)

    expect(mockApi.delete).toHaveBeenCalledWith('/nannies/1/')
  })
})
