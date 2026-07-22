import { screen } from '@testing-library/react'
import { HttpResponse, http } from 'msw'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type {
  DashboardContractRead,
  FamilyRead,
  PaidLeaveBalanceRead,
  RecentDeclarationRead,
} from '@/src/api'
import { useAuth } from '@/src/auth/AuthContext'
import Home from '@/src/pages/Home'
import { server } from '@/tests/msw/server'
import { makeAuth, renderWithProviders } from '@/tests/utils'

vi.mock('@/src/auth/AuthContext', () => ({ useAuth: vi.fn() }))

const mockUseAuth = vi.mocked(useAuth)

const family: FamilyRead = {
  id: 'fam-1',
  name: 'Home',
  role: 'owner',
  is_claimed: true,
  created_at: '',
}

const balance: PaidLeaveBalanceRead = {
  period_start: '2026-06-01',
  period_end: '2027-05-31',
  total_days: '30.00',
  accrued: '5.00',
  taken: '2.00',
  // remaining is the strong line: accrued 5 − taken 2 = 3, priced on the backend.
  remaining: '3.00',
  // The dashboard leaves the « rappel de 1/10 » estimate out (served on demand).
  tenth: null,
}

function recent(o: Partial<RecentDeclarationRead> = {}): RecentDeclarationRead {
  return { month: '2026-06', net_salary: '1000.00', status: 'filed', ...o }
}

function makeContract(
  o: Partial<DashboardContractRead> = {},
): DashboardContractRead {
  return {
    id: 'contract-1',
    nanny: { id: 'n1', first_name: 'Marie', last_name: 'Dupont' },
    starting_date: '2025-01-01',
    ending_date: null,
    split_method: 'equal',
    paid_leave_days: 25,
    notes: '',
    families: [],
    current_terms: null,
    current_schedule: null,
    paid_leave_balance: balance,
    // The current month and the three before it, most recent first — the run the
    // backend already scoped and computed.
    recent_declarations: [
      recent({ month: '2026-07' }),
      recent({ month: '2026-06' }),
      recent({ month: '2026-05' }),
      recent({ month: '2026-04' }),
    ],
    ...o,
  }
}

// The two requests the dashboard fires: the family list, then the acting family's
// one-shot dashboard (contracts with paid-leave + recent declarations baked in).
const FAMILIES = '*/api/families/'
const DASHBOARD = '*/api/families/fam-1/dashboard/'
// Home also renders the year-ahead forecast chart, which fires its own request.
const SIMULATION = '*/api/families/fam-1/simulation/'

function setup(contracts: DashboardContractRead[] = [makeContract()]) {
  server.use(
    http.get(FAMILIES, () => HttpResponse.json([family])),
    http.get(DASHBOARD, () => HttpResponse.json({ contracts })),
    http.get(SIMULATION, () =>
      HttpResponse.json({
        period_start: '2026-07-01',
        period_end: '2027-06-01',
        contracts: [],
      }),
    ),
  )
}

beforeEach(() => {
  mockUseAuth.mockReturnValue(
    makeAuth({
      user: { id: '1', email: 'me@example.com', first_name: '', last_name: '' },
      isAuthenticated: true,
    }),
  )
})

describe('Home', () => {
  it('shows the signed-in email', async () => {
    setup()
    renderWithProviders(<Home />)
    expect(await screen.findByText('me@example.com')).toBeInTheDocument()
  })

  it('shows the paid-leave balance for each contract', async () => {
    setup()
    renderWithProviders(<Home />)

    expect(await screen.findByText('Marie Dupont')).toBeInTheDocument()
    expect(screen.getByText('Paid leave')).toBeInTheDocument()
    // remaining is the strong line: accrued 5 − taken 2 = 3.
    expect(screen.getByText('Remaining')).toBeInTheDocument()
    expect(screen.getByText('3 days')).toBeInTheDocument()
    expect(screen.getByText('30 days')).toBeInTheDocument()
  })

  it('summarises the recent months, current month included', async () => {
    setup()
    renderWithProviders(<Home />)

    // Four months: current (July) and the three before it, as returned.
    expect(await screen.findByText('July 2026')).toBeInTheDocument()
    expect(screen.getByText('April 2026')).toBeInTheDocument()
    // Each month shows its net salary and a status badge.
    expect(screen.getAllByText('€1,000.00').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Filed').length).toBeGreaterThan(0)
  })

  it('omits months before the contract started', async () => {
    // The backend scopes the run to months the contract was live for, so of
    // {Jul, Jun, May, Apr} only Jul and Jun come back.
    setup([
      makeContract({
        starting_date: '2026-06-01',
        recent_declarations: [
          recent({ month: '2026-07' }),
          recent({ month: '2026-06' }),
        ],
      }),
    ])
    renderWithProviders(<Home />)

    expect(await screen.findByText('July 2026')).toBeInTheDocument()
    expect(screen.getByText('June 2026')).toBeInTheDocument()
    expect(screen.queryByText('May 2026')).not.toBeInTheDocument()
    expect(screen.queryByText('April 2026')).not.toBeInTheDocument()
  })

  it('says so when there are no contracts', async () => {
    setup([])
    renderWithProviders(<Home />)

    expect(await screen.findByText(/No nannies yet/)).toBeInTheDocument()
  })
})
