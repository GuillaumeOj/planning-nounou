import { screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  type Contract,
  getContracts,
  getPaidLeaveBalance,
  type PaidLeaveBalance,
} from '@/src/api/contracts'
import {
  getDeclarations,
  type MonthlyDeclaration,
} from '@/src/api/declarations'
import { getFamilies } from '@/src/api/family'
import { useAuth } from '@/src/auth/AuthContext'
import Home from '@/src/pages/Home'
import { makeAuth, renderWithProviders } from '@/tests/utils'

vi.mock('@/src/api/family', () => ({ getFamilies: vi.fn() }))
vi.mock('@/src/api/contracts', () => {
  const getPaidLeaveBalance = vi.fn()
  return {
    getContracts: vi.fn(),
    getPaidLeaveBalance,
    // The real one, wired to the mock, so Home's useQuery hits the mock.
    paidLeaveQueryOptions: (familyId: string, contractId: string) => ({
      queryKey: ['paid-leave', contractId],
      queryFn: () => getPaidLeaveBalance(familyId, contractId),
    }),
  }
})
vi.mock('@/src/api/declarations', () => ({ getDeclarations: vi.fn() }))
vi.mock('@/src/auth/AuthContext', () => ({ useAuth: vi.fn() }))

const m = {
  families: vi.mocked(getFamilies),
  contracts: vi.mocked(getContracts),
  paidLeave: vi.mocked(getPaidLeaveBalance),
  declarations: vi.mocked(getDeclarations),
  useAuth: vi.mocked(useAuth),
}

const family = {
  id: 'fam-1',
  name: 'Home',
  role: 'owner' as const,
  is_claimed: true,
  created_at: '',
}

const contract = {
  id: 'contract-1',
  nanny: { id: 'n1', first_name: 'Marie', last_name: 'Dupont' },
  starting_date: '2025-01-01',
  ending_date: null,
} as Contract

const balance: PaidLeaveBalance = {
  period_start: '2026-06-01',
  period_end: '2027-05-31',
  total_days: '30.00',
  accrued: '5.00',
  taken: '2.00',
  remaining: '3.00',
}

function declaration(o: Partial<MonthlyDeclaration> = {}): MonthlyDeclaration {
  return {
    id: 'dec-1',
    family: 'fam-1',
    family_name: 'Home',
    month: '2026-06-01',
    status: 'filed',
    normal_hours: '0',
    hours_25: '0',
    hours_50: '0',
    net_salary: '1000.00',
    total_amount: '1000.00',
    transport_amount: '0',
    benefits_in_kind_amount: '0',
    kilometers: '0',
    mileage_amount: '0',
    night_count: 0,
    night_indemnity: '0',
    holiday_majoration: '0',
    net_hourly_rate: '0',
    night_presence_rate: '0',
    mileage_rate: '0',
    rate_periods: [],
    warnings: [],
    computed_at: '',
    filed_at: '2026-07-03T09:30:00Z',
    is_editable: false,
    editable_until: '2026-08-31',
    ...o,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.useFakeTimers({ shouldAdvanceTime: true })
  vi.setSystemTime(new Date('2026-07-17T09:00:00Z'))
  m.useAuth.mockReturnValue(
    makeAuth({
      user: { id: '1', email: 'me@example.com', first_name: '', last_name: '' },
      isAuthenticated: true,
    }),
  )
  m.families.mockResolvedValue([family])
  m.contracts.mockResolvedValue([contract])
  m.paidLeave.mockResolvedValue(balance)
  m.declarations.mockResolvedValue([declaration()])
})

afterEach(() => {
  vi.useRealTimers()
})

describe('Home', () => {
  it('shows the signed-in email', async () => {
    renderWithProviders(<Home />)
    expect(await screen.findByText('me@example.com')).toBeInTheDocument()
  })

  it('shows the paid-leave balance for each contract', async () => {
    renderWithProviders(<Home />)

    expect(await screen.findByText('Marie Dupont')).toBeInTheDocument()
    expect(screen.getByText('Paid leave')).toBeInTheDocument()
    // remaining is the strong line: accrued 5 − taken 2 = 3.
    expect(screen.getByText('Remaining')).toBeInTheDocument()
    expect(screen.getByText('3 days')).toBeInTheDocument()
    expect(screen.getByText('30 days')).toBeInTheDocument()
  })

  it('summarises the recent months, current month included', async () => {
    renderWithProviders(<Home />)

    // Four months: current (July) and the three before it.
    expect(await screen.findByText('July 2026')).toBeInTheDocument()
    expect(screen.getByText('April 2026')).toBeInTheDocument()
    await waitFor(() =>
      expect(m.declarations).toHaveBeenCalledWith(
        'fam-1',
        'contract-1',
        '2026-07',
      ),
    )
    // Each month shows its net salary and a status badge.
    expect(screen.getAllByText('€1,000.00').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Filed').length).toBeGreaterThan(0)
  })

  it('omits months before the contract started', async () => {
    // Starts 1 June 2026, so of {Jul, Jun, May, Apr} only Jul and Jun are live.
    m.contracts.mockResolvedValue([
      { ...contract, starting_date: '2026-06-01' } as Contract,
    ])
    renderWithProviders(<Home />)

    expect(await screen.findByText('July 2026')).toBeInTheDocument()
    expect(screen.getByText('June 2026')).toBeInTheDocument()
    expect(screen.queryByText('May 2026')).not.toBeInTheDocument()
    expect(screen.queryByText('April 2026')).not.toBeInTheDocument()
    // No request is made for a month the contract did not exist for.
    expect(m.declarations).not.toHaveBeenCalledWith(
      'fam-1',
      'contract-1',
      '2026-05',
    )
  })

  it('says so when there are no contracts', async () => {
    m.contracts.mockResolvedValue([])
    renderWithProviders(<Home />)

    expect(await screen.findByText(/No nannies yet/)).toBeInTheDocument()
  })
})
