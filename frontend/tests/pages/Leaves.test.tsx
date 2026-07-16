import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { type Contract, getContracts } from '@/api/contracts'
import { getFamilies } from '@/api/family'
import { getLeaves } from '@/api/leaves'
import Leaves from '@/pages/Leaves'
import { renderWithProviders } from '../utils'

vi.mock('@/api/family', () => ({ getFamilies: vi.fn() }))
vi.mock('@/api/contracts', () => ({ getContracts: vi.fn() }))
vi.mock('@/api/leaves', () => ({
  getLeaves: vi.fn(),
  createLeave: vi.fn(),
  updateLeave: vi.fn(),
  deleteLeave: vi.fn(),
}))

const m = {
  families: vi.mocked(getFamilies),
  contracts: vi.mocked(getContracts),
  leaves: vi.mocked(getLeaves),
}

const family = {
  id: '1',
  name: 'Home',
  role: 'owner' as const,
  is_claimed: true,
  created_at: '',
}

function makeContract(o: Partial<Contract> = {}): Contract {
  return {
    id: '10',
    nanny: { id: '5', first_name: 'Marie', last_name: 'Dupont' },
    starting_date: '2026-06-01',
    ending_date: null,
    paid_leave_days: 25,
    notes: '',
    families: [{ id: '1', name: 'Home', is_originator: true }],
    current_terms: null,
    current_schedule: null,
    ...o,
  }
}

beforeEach(() => {
  m.families.mockResolvedValue([family])
  m.contracts.mockResolvedValue([])
  m.leaves.mockResolvedValue([])
})
afterEach(() => vi.clearAllMocks())

describe('Leaves page', () => {
  it('prompts to create a family when there are none', async () => {
    m.families.mockResolvedValue([])
    renderWithProviders(<Leaves />)
    expect(
      await screen.findByText('Create a family first, then add a nanny.'),
    ).toBeInTheDocument()
  })

  it('shows an empty message when the family has no nannies', async () => {
    renderWithProviders(<Leaves />)
    expect(
      await screen.findByText('No nannies yet. Add your first one below.'),
    ).toBeInTheDocument()
  })

  it('renders a card per nanny', async () => {
    m.contracts.mockResolvedValue([makeContract()])
    renderWithProviders(<Leaves />)
    expect(await screen.findByText('Marie Dupont')).toBeInTheDocument()
    expect(screen.getByText('No days off recorded yet.')).toBeInTheDocument()
  })

  it('shows a loading state while contracts load', async () => {
    m.contracts.mockReturnValue(new Promise<Contract[]>(() => {}))
    renderWithProviders(<Leaves />)
    expect(await screen.findByText('Loading…')).toBeInTheDocument()
  })

  it('surfaces a load error', async () => {
    m.contracts.mockRejectedValue(new Error('boom'))
    renderWithProviders(<Leaves />)
    expect(
      await screen.findByText('Could not load contracts.'),
    ).toBeInTheDocument()
  })

  it('refetches contracts when the acting family changes', async () => {
    const family2 = { ...family, id: '2', name: 'Grandparents' }
    m.families.mockResolvedValue([family, family2])
    const user = userEvent.setup()
    renderWithProviders(<Leaves />)
    await screen.findByText('No nannies yet. Add your first one below.')

    await user.selectOptions(screen.getByLabelText('Acting as family'), '2')
    await waitFor(() => expect(m.contracts).toHaveBeenCalledWith('2'))
  })
})
