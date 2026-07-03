import { afterEach, describe, expect, it, vi } from 'vitest'
import { api } from './client'
import {
  acceptInvitation,
  createFamily,
  createInvitation,
  declineInvitation,
  deleteFamily,
  getFamilies,
  getFamilyMembers,
  getInvitationPreview,
  getInvitations,
  getMyInvitations,
  leaveFamily,
  removeFamilyMember,
  revokeInvitation,
  updateFamily,
} from './family'

afterEach(() => {
  vi.restoreAllMocks()
})

// biome-ignore lint/suspicious/noExplicitAny: canned axios response helper
const resolved = (data: unknown) => ({ data }) as any

describe('family api', () => {
  it('getFamilies fetches the collection', async () => {
    const get = vi.spyOn(api, 'get').mockResolvedValue(resolved([{ id: '1' }]))

    const result = await getFamilies()

    expect(get).toHaveBeenCalledWith('/families/')
    expect(result).toEqual([{ id: '1' }])
  })

  it('createFamily posts the input', async () => {
    const post = vi
      .spyOn(api, 'post')
      .mockResolvedValue(resolved({ id: '3', name: 'Home' }))

    const result = await createFamily({ name: 'Home', claim: false })

    expect(post).toHaveBeenCalledWith('/families/', {
      name: 'Home',
      claim: false,
    })
    expect(result).toMatchObject({ id: '3' })
  })

  it('updateFamily patches the name', async () => {
    const patch = vi
      .spyOn(api, 'patch')
      .mockResolvedValue(resolved({ id: '3', name: 'Nest' }))

    await updateFamily('3', { name: 'Nest' })

    expect(patch).toHaveBeenCalledWith('/families/3/', { name: 'Nest' })
  })

  it('deleteFamily deletes by id', async () => {
    const del = vi.spyOn(api, 'delete').mockResolvedValue(resolved(''))

    await deleteFamily('3')

    expect(del).toHaveBeenCalledWith('/families/3/')
  })

  it('leaveFamily posts to the leave action', async () => {
    const post = vi.spyOn(api, 'post').mockResolvedValue(resolved(''))

    await leaveFamily('3')

    expect(post).toHaveBeenCalledWith('/families/3/leave/')
  })

  it('getFamilyMembers fetches members', async () => {
    const get = vi.spyOn(api, 'get').mockResolvedValue(resolved([{ id: '9' }]))

    const result = await getFamilyMembers('3')

    expect(get).toHaveBeenCalledWith('/families/3/members/')
    expect(result).toEqual([{ id: '9' }])
  })

  it('removeFamilyMember deletes a membership', async () => {
    const del = vi.spyOn(api, 'delete').mockResolvedValue(resolved(''))

    await removeFamilyMember('3', '9')

    expect(del).toHaveBeenCalledWith('/families/3/members/9/')
  })

  it('getInvitations fetches invitations', async () => {
    const get = vi.spyOn(api, 'get').mockResolvedValue(resolved([{ id: '4' }]))

    const result = await getInvitations('3')

    expect(get).toHaveBeenCalledWith('/families/3/invitations/')
    expect(result).toEqual([{ id: '4' }])
  })

  it('createInvitation posts email and role', async () => {
    const post = vi
      .spyOn(api, 'post')
      .mockResolvedValue(resolved({ id: '4', token: 'abc' }))

    const result = await createInvitation('3', {
      email: 'a@b.com',
      role: 'member',
    })

    expect(post).toHaveBeenCalledWith('/families/3/invitations/', {
      email: 'a@b.com',
      role: 'member',
    })
    expect(result).toMatchObject({ token: 'abc' })
  })

  it('revokeInvitation deletes an invitation', async () => {
    const del = vi.spyOn(api, 'delete').mockResolvedValue(resolved(''))

    await revokeInvitation('3', '4')

    expect(del).toHaveBeenCalledWith('/families/3/invitations/4/')
  })

  it('getMyInvitations fetches the current user inbox', async () => {
    const get = vi
      .spyOn(api, 'get')
      .mockResolvedValue(resolved([{ id: '7', family_name: 'Dupont' }]))

    const result = await getMyInvitations()

    expect(get).toHaveBeenCalledWith('/invitations/')
    expect(result).toEqual([{ id: '7', family_name: 'Dupont' }])
  })

  it('getInvitationPreview fetches by token', async () => {
    const get = vi
      .spyOn(api, 'get')
      .mockResolvedValue(resolved({ family_name: 'Home' }))

    const result = await getInvitationPreview('tok123')

    expect(get).toHaveBeenCalledWith('/invitations/tok123/')
    expect(result).toMatchObject({ family_name: 'Home' })
  })

  it('acceptInvitation posts to accept and returns the family', async () => {
    const post = vi
      .spyOn(api, 'post')
      .mockResolvedValue(resolved({ id: '3', role: 'member' }))

    const result = await acceptInvitation('tok123')

    expect(post).toHaveBeenCalledWith('/invitations/tok123/accept/')
    expect(result).toMatchObject({ id: '3' })
  })

  it('declineInvitation posts to decline', async () => {
    const post = vi.spyOn(api, 'post').mockResolvedValue(resolved(''))

    await declineInvitation('tok123')

    expect(post).toHaveBeenCalledWith('/invitations/tok123/decline/')
  })
})
