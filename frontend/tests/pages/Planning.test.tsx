import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  type Contract,
  type ContractSchedule,
  getContractSchedules,
  getContracts,
} from '@/src/api/contracts'
import { getFamilies } from '@/src/api/family'
import { getBankHolidays } from '@/src/api/holidays'
import { MOBILE_QUERY } from '@/src/hooks/useMediaQuery'
import Planning from '@/src/pages/Planning'
import { renderWithProviders } from '@/tests/utils'

vi.mock('@/src/api/family', () => ({ getFamilies: vi.fn() }))
vi.mock('@/src/api/contracts', () => ({
  getContracts: vi.fn(),
  getContractSchedules: vi.fn(),
}))
vi.mock('@/src/api/holidays', () => ({ getBankHolidays: vi.fn() }))

const m = {
  families: vi.mocked(getFamilies),
  contracts: vi.mocked(getContracts),
  schedules: vi.mocked(getContractSchedules),
  holidays: vi.mocked(getBankHolidays),
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

const realMatchMedia = window.matchMedia

// Report a phone-sized viewport to useMediaQuery. Everything else — notably the
// theme's prefers-color-scheme probe — keeps answering "no".
function useMobileViewport() {
  window.matchMedia = ((query: string) =>
    ({
      matches: query === MOBILE_QUERY,
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }) as unknown as MediaQueryList) as typeof window.matchMedia
}

beforeEach(() => {
  // Pin "today" to a Wednesday in July 2026 so the calendar is deterministic.
  vi.useFakeTimers({ shouldAdvanceTime: true })
  vi.setSystemTime(new Date(2026, 6, 15, 12, 0, 0))
  m.families.mockResolvedValue([family])
  m.contracts.mockResolvedValue([])
  m.schedules.mockResolvedValue([makeSchedule()])
  m.holidays.mockResolvedValue([])
})
afterEach(() => {
  vi.useRealTimers()
  vi.clearAllMocks()
  window.matchMedia = realMatchMedia
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

  it('shows the holiday name on the planning', async () => {
    m.holidays.mockResolvedValue([
      {
        id: 'h1',
        name: 'Fête Nationale',
        date: '2026-07-14',
        is_workable: false,
      },
    ])
    renderWithProviders(<Planning />)
    expect(await screen.findByText('Fête Nationale')).toBeInTheDocument()
  })

  it('removes the worked block on a non-workable holiday', async () => {
    m.contracts.mockResolvedValue([makeContract()])
    // 2026-07-08 is one of July's five worked Wednesdays.
    m.holidays.mockResolvedValue([
      { id: 'h1', name: 'Jour férié', date: '2026-07-08', is_workable: false },
    ])
    renderWithProviders(<Planning />)
    await screen.findByText('Jour férié')
    // Five Wednesdays minus the neutralized one leaves four worked days.
    await waitFor(() =>
      expect(screen.getAllByText('Marie Dupont')).toHaveLength(4),
    )
  })

  it('keeps the worked block on a workable holiday', async () => {
    m.contracts.mockResolvedValue([makeContract()])
    m.holidays.mockResolvedValue([
      { id: 'h1', name: 'Solidarité', date: '2026-07-08', is_workable: true },
    ])
    renderWithProviders(<Planning />)
    await screen.findByText('Solidarité')
    await waitFor(() =>
      expect(screen.getAllByText('Marie Dupont')).toHaveLength(5),
    )
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

describe('Planning page on a phone', () => {
  beforeEach(() => {
    useMobileViewport()
  })

  it('describes the selected day instead of filling the cells', async () => {
    m.contracts.mockResolvedValue([makeContract()])
    renderWithProviders(<Planning />)

    // Today (Wed 15 July) is worked and selected by default. The name appears
    // once — in the day panel — rather than in each of the five worked cells.
    await waitFor(() =>
      expect(screen.getAllByText('Marie Dupont')).toHaveLength(1),
    )
    expect(screen.getByText(/08:00.*17:00/)).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: /July 15th/, pressed: true }),
    ).toBeInTheDocument()
  })

  it('switches the panel to the day that was tapped', async () => {
    const user = setupUser()
    m.contracts.mockResolvedValue([makeContract()])
    renderWithProviders(<Planning />)
    await screen.findByText('Marie Dupont')

    // 14 July 2026 is a Tuesday, so nothing is scheduled on it.
    await user.click(screen.getByRole('button', { name: /July 14th/ }))
    expect(
      await screen.findByText('Nothing scheduled on this day.'),
    ).toBeInTheDocument()
    expect(screen.queryByText('Marie Dupont')).not.toBeInTheDocument()
  })

  it('names the holiday of the selected day', async () => {
    const user = setupUser()
    m.holidays.mockResolvedValue([
      {
        id: 'h1',
        name: 'Fête Nationale',
        date: '2026-07-14',
        is_workable: false,
      },
    ])
    renderWithProviders(<Planning />)
    await screen.findByText('July 2026')

    // The name is only in the panel now, so it takes a tap to reach it.
    expect(screen.queryByText('Fête Nationale')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /July 14th/ }))
    expect(await screen.findByText('Fête Nationale')).toBeInTheDocument()
  })

  it('falls back to the 1st when the month changes under the selection', async () => {
    const user = setupUser()
    // 1 August 2026 is a Saturday: schedule the nanny then, so the day the
    // selection falls back to is a worked one and the panel has to say so.
    m.contracts.mockResolvedValue([makeContract()])
    m.schedules.mockResolvedValue([
      makeSchedule({
        blocks: [{ weekday: 5, start_time: '08:00:00', end_time: '17:00:00' }],
      }),
    ])
    renderWithProviders(<Planning />)
    await screen.findByText('July 2026')

    await user.click(screen.getByRole('button', { name: 'Next month' }))
    expect(
      await screen.findByRole('button', { name: /August 1st/, pressed: true }),
    ).toBeInTheDocument()
    expect(await screen.findByText('Marie Dupont')).toBeInTheDocument()
  })
})
