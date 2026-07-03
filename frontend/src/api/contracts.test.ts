import { afterEach, describe, expect, it, vi } from 'vitest'
import { api } from './client'
import {
  createContract,
  createContractInvitation,
  createContractSchedule,
  createContractTerms,
  deleteContract,
  deleteContractSchedule,
  deleteContractTerms,
  getContractInvitations,
  getContractSchedules,
  getContracts,
  getContractTerms,
  getMinimumWage,
  revokeContractInvitation,
  updateContract,
  updateContractSchedule,
  updateContractTerms,
} from './contracts'

afterEach(() => {
  vi.restoreAllMocks()
})

// biome-ignore lint/suspicious/noExplicitAny: canned axios response
const resp = (data: unknown) => ({ data }) as any

describe('contracts api', () => {
  it('getContracts fetches the family collection', async () => {
    const get = vi.spyOn(api, 'get').mockResolvedValue(resp([{ id: 1 }]))
    const result = await getContracts('7')
    expect(get).toHaveBeenCalledWith('/families/7/contracts/')
    expect(result).toEqual([{ id: 1 }])
  })

  it('createContract posts to the family', async () => {
    const post = vi.spyOn(api, 'post').mockResolvedValue(resp({ id: 2 }))
    await createContract('7', {
      first_name: 'Marie',
      last_name: 'Dupont',
      starting_date: '2026-01-05',
    })
    expect(post).toHaveBeenCalledWith('/families/7/contracts/', {
      first_name: 'Marie',
      last_name: 'Dupont',
      starting_date: '2026-01-05',
    })
  })

  it('updateContract patches by id', async () => {
    const patch = vi.spyOn(api, 'patch').mockResolvedValue(resp({ id: 2 }))
    await updateContract('7', '2', { notes: 'x' })
    expect(patch).toHaveBeenCalledWith('/families/7/contracts/2/', {
      notes: 'x',
    })
  })

  it('deleteContract deletes by id', async () => {
    const del = vi.spyOn(api, 'delete').mockResolvedValue(resp(''))
    await deleteContract('7', '2')
    expect(del).toHaveBeenCalledWith('/families/7/contracts/2/')
  })

  it('getContractTerms fetches history', async () => {
    const get = vi.spyOn(api, 'get').mockResolvedValue(resp([]))
    await getContractTerms('7', '2')
    expect(get).toHaveBeenCalledWith('/families/7/contracts/2/terms/')
  })

  it('createContractTerms posts a new version', async () => {
    const post = vi.spyOn(api, 'post').mockResolvedValue(resp({ id: 3 }))
    await createContractTerms('7', '2', { net_hourly_rate: '12.00' })
    expect(post).toHaveBeenCalledWith('/families/7/contracts/2/terms/', {
      net_hourly_rate: '12.00',
    })
  })

  it('updateContractTerms patches a snapshot', async () => {
    const patch = vi.spyOn(api, 'patch').mockResolvedValue(resp({ id: 3 }))
    await updateContractTerms('7', '2', '3', { net_hourly_rate: '13.00' })
    expect(patch).toHaveBeenCalledWith('/families/7/contracts/2/terms/3/', {
      net_hourly_rate: '13.00',
    })
  })

  it('deleteContractTerms deletes a snapshot', async () => {
    const del = vi.spyOn(api, 'delete').mockResolvedValue(resp(''))
    await deleteContractTerms('7', '2', '3')
    expect(del).toHaveBeenCalledWith('/families/7/contracts/2/terms/3/')
  })

  it('getContractSchedules fetches history', async () => {
    const get = vi.spyOn(api, 'get').mockResolvedValue(resp([]))
    await getContractSchedules('7', '2')
    expect(get).toHaveBeenCalledWith('/families/7/contracts/2/schedule/')
  })

  it('createContractSchedule posts a new version', async () => {
    const post = vi.spyOn(api, 'post').mockResolvedValue(resp({ id: 3 }))
    await createContractSchedule('7', '2', { blocks: [] })
    expect(post).toHaveBeenCalledWith('/families/7/contracts/2/schedule/', {
      blocks: [],
    })
  })

  it('updateContractSchedule patches a snapshot', async () => {
    const patch = vi.spyOn(api, 'patch').mockResolvedValue(resp({ id: 3 }))
    await updateContractSchedule('7', '2', '3', { blocks: [] })
    expect(patch).toHaveBeenCalledWith('/families/7/contracts/2/schedule/3/', {
      blocks: [],
    })
  })

  it('deleteContractSchedule deletes a snapshot', async () => {
    const del = vi.spyOn(api, 'delete').mockResolvedValue(resp(''))
    await deleteContractSchedule('7', '2', '3')
    expect(del).toHaveBeenCalledWith('/families/7/contracts/2/schedule/3/')
  })

  it('getContractInvitations fetches the list', async () => {
    const get = vi.spyOn(api, 'get').mockResolvedValue(resp([]))
    await getContractInvitations('7', '2')
    expect(get).toHaveBeenCalledWith('/families/7/contracts/2/invitations/')
  })

  it('createContractInvitation posts the email', async () => {
    const post = vi.spyOn(api, 'post').mockResolvedValue(resp({ id: 4 }))
    await createContractInvitation('7', '2', 'friend@example.com')
    expect(post).toHaveBeenCalledWith('/families/7/contracts/2/invitations/', {
      email: 'friend@example.com',
    })
  })

  it('getMinimumWage passes the date param', async () => {
    const get = vi
      .spyOn(api, 'get')
      .mockResolvedValue(resp({ net_hourly_rate: '10.07' }))
    await getMinimumWage('2026-06-01')
    expect(get).toHaveBeenCalledWith('/minimum-wage/', {
      params: { on: '2026-06-01' },
    })
  })

  it('getMinimumWage omits params when no date', async () => {
    const get = vi
      .spyOn(api, 'get')
      .mockResolvedValue(resp({ net_hourly_rate: '10.07' }))
    await getMinimumWage()
    expect(get).toHaveBeenCalledWith('/minimum-wage/', { params: undefined })
  })

  it('revokeContractInvitation deletes by id', async () => {
    const del = vi.spyOn(api, 'delete').mockResolvedValue(resp(''))
    await revokeContractInvitation('7', '2', '4')
    expect(del).toHaveBeenCalledWith('/families/7/contracts/2/invitations/4/')
  })
})
