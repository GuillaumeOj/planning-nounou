import { afterEach, describe, expect, it, vi } from 'vitest'
import { createChild, deleteChild, listChildren, updateChild } from './children'
import { api } from './client'

afterEach(() => {
  vi.restoreAllMocks()
})

describe('children api', () => {
  it('listChildren fetches the collection', async () => {
    const get = vi
      .spyOn(api, 'get')
      // biome-ignore lint/suspicious/noExplicitAny: canned axios response
      .mockResolvedValue({ data: [{ id: 1, first_name: 'Leo' }] } as any)

    const result = await listChildren()

    expect(get).toHaveBeenCalledWith('/auth/children/')
    expect(result).toEqual([{ id: 1, first_name: 'Leo' }])
  })

  it('createChild posts the first name', async () => {
    const post = vi
      .spyOn(api, 'post')
      // biome-ignore lint/suspicious/noExplicitAny: canned axios response
      .mockResolvedValue({ data: { id: 2, first_name: 'Mia' } } as any)

    const result = await createChild('Mia')

    expect(post).toHaveBeenCalledWith('/auth/children/', { first_name: 'Mia' })
    expect(result).toMatchObject({ id: 2, first_name: 'Mia' })
  })

  it('updateChild patches the named child', async () => {
    const patch = vi
      .spyOn(api, 'patch')
      // biome-ignore lint/suspicious/noExplicitAny: canned axios response
      .mockResolvedValue({ data: { id: 2, first_name: 'Mila' } } as any)

    const result = await updateChild(2, 'Mila')

    expect(patch).toHaveBeenCalledWith('/auth/children/2/', {
      first_name: 'Mila',
    })
    expect(result).toMatchObject({ first_name: 'Mila' })
  })

  it('deleteChild deletes by id', async () => {
    const del = vi
      .spyOn(api, 'delete')
      // biome-ignore lint/suspicious/noExplicitAny: canned axios response
      .mockResolvedValue({ data: '' } as any)

    await deleteChild(2)

    expect(del).toHaveBeenCalledWith('/auth/children/2/')
  })
})
