import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  type Contract,
  type ContractSchedule,
  getContractSchedules,
  getContracts,
} from '../api/contracts'
import { getFamilies } from '../api/family'
import { renderWithProviders } from '../test/utils'
import Planning from './Planning'

vi.mock('../api/family', () => ({ getFamilies: vi.fn() }))
vi.mock('../api/contracts', () => ({
  getContracts: vi.fn(),
  getContractSchedules: vi.fn(),
}))

const m = {
  families: vi.mocked(getFamilies),
  contracts: vi.mocked(getContracts),
  schedules: vi.mocked(getContractSchedules),
}

const family = {
  id: '1',
  name: 'Home',
  role: 'owner' as const,
  is_claimed: true,
  created_at: '',
}

function makeSchedule(o: Partial<ContractSchedule> = {}): ContractSchedule {
  return {
    id: '1',
    effective_from: '2026-06-01',
    effective_to: null,
    weekly_hours: 9,
    edited: false,
    blocks: [{ weekday: 2, start_time: '08:00:00', end_time: '17:00:00' }],
    ...o,
  }
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

// A user-event bound to the fake clock so its internal delays still resolve.
const setupUser = () =>
  userEvent.setup({ advanceTimers: vi.advanceTimersByTime })

beforeEach(() => {
  // Pin "today" to a Wednesday in July 2026 so the calendar is deterministic.
  vi.useFakeTimers({ shouldAdvanceTime: true })
  vi.setSystemTime(new Date(2026, 6, 15, 12, 0, 0))
  m.families.mockResolvedValue([family])
  m.contracts.mockResolvedValue([])
  m.schedules.mockResolvedValue([makeSchedule()])
})
afterEach(() => {
  vi.useRealTimers()
  vi.clearAllMocks()
})

describe('Planning page', () => {
  it('prompts to create a family when there are none', async () => {
    m.families.mockResolvedValue([])
    renderWithProviders(<Planning />)
    expect(
      await screen.findByText('Create a family first, then add a nanny.'),
    ).toBeInTheDocument()
  })

  it('shows the current month and an empty message when no day is worked', async () => {
    renderWithProviders(<Planning />)
    expect(await screen.findByText('July 2026')).toBeInTheDocument()
    expect(
      await screen.findByText('No worked days this month.'),
    ).toBeInTheDocument()
  })

  it('marks worked days with the nanny name and hours', async () => {
    m.contracts.mockResolvedValue([makeContract()])
    renderWithProviders(<Planning />)
    // July 2026 has five Wednesdays; the scheduled block lands on each.
    expect((await screen.findAllByText('Marie Dupont')).length).toBeGreaterThan(
      0,
    )
    expect(screen.getAllByText(/08:00.*17:00/).length).toBeGreaterThan(0)
  })

  it('navigates months and returns to today', async () => {
    const user = setupUser()
    renderWithProviders(<Planning />)
    expect(await screen.findByText('July 2026')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Next month' }))
    expect(await screen.findByText('August 2026')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Previous month' }))
    await user.click(screen.getByRole('button', { name: 'Previous month' }))
    expect(await screen.findByText('June 2026')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Today' }))
    expect(await screen.findByText('July 2026')).toBeInTheDocument()
  })

  it('refetches contracts when the acting family changes', async () => {
    const family2 = { ...family, id: '2', name: 'Grandparents' }
    m.families.mockResolvedValue([family, family2])
    const user = setupUser()
    renderWithProviders(<Planning />)
    await screen.findByText('July 2026')

    await user.selectOptions(screen.getByLabelText('Acting as family'), '2')
    await waitFor(() => expect(m.contracts).toHaveBeenCalledWith('2'))
  })

  it('shows a loading state while contracts load', async () => {
    m.contracts.mockReturnValue(new Promise<Contract[]>(() => {}))
    renderWithProviders(<Planning />)
    expect(await screen.findByText('Loading…')).toBeInTheDocument()
  })

  it('surfaces a load error', async () => {
    m.contracts.mockRejectedValue(new Error('boom'))
    renderWithProviders(<Planning />)
    expect(
      await screen.findByText('Could not load the planning.'),
    ).toBeInTheDocument()
  })
})
