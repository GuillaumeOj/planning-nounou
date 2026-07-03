import { afterEach, describe, expect, it, vi } from 'vitest'
import { createChild, deleteChild, listChildren, updateChild } from './children'
import { api } from './client'

afterEach(() => {
  vi.restoreAllMocks()
})

describe('children api', () => {
  it('listChildren fetches the family collection', async () => {
    const get = vi
      .spyOn(api, 'get')
      // biome-ignore lint/suspicious/noExplicitAny: canned axios response
      .mockResolvedValue({ data: [{ id: '1', first_name: 'Leo' }] } as any)

    const result = await listChildren('7')

    expect(get).toHaveBeenCalledWith('/families/7/children/')
    expect(result).toEqual([{ id: '1', first_name: 'Leo' }])
  })

  it('createChild posts the first name to the family', async () => {
    const post = vi
      .spyOn(api, 'post')
      // biome-ignore lint/suspicious/noExplicitAny: canned axios response
      .mockResolvedValue({ data: { id: '2', first_name: 'Mia' } } as any)

    const result = await createChild('7', 'Mia')

    expect(post).toHaveBeenCalledWith('/families/7/children/', {
      first_name: 'Mia',
    })
    expect(result).toMatchObject({ id: '2', first_name: 'Mia' })
  })

  it('updateChild patches the named child in the family', async () => {
    const patch = vi
      .spyOn(api, 'patch')
      // biome-ignore lint/suspicious/noExplicitAny: canned axios response
      .mockResolvedValue({ data: { id: '2', first_name: 'Mila' } } as any)

    const result = await updateChild('7', '2', 'Mila')

    expect(patch).toHaveBeenCalledWith('/families/7/children/2/', {
      first_name: 'Mila',
    })
    expect(result).toMatchObject({ first_name: 'Mila' })
  })

  it('deleteChild deletes by family and id', async () => {
    const del = vi
      .spyOn(api, 'delete')
      // biome-ignore lint/suspicious/noExplicitAny: canned axios response
      .mockResolvedValue({ data: '' } as any)

    await deleteChild('7', '2')

    expect(del).toHaveBeenCalledWith('/families/7/children/2/')
  })
})
