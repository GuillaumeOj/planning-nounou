import { screen, within } from '@testing-library/react'
import { HttpResponse, http } from 'msw'
import { describe, expect, it } from 'vitest'
import type { FamilyRead, SimulationContractRead } from '@/src/api'
import Simulation from '@/src/pages/Simulation'
import { server } from '@/tests/msw/server'
import { renderWithProviders } from '@/tests/utils'

const family: FamilyRead = {
  id: 'fam-1',
  name: 'Home',
  role: 'owner',
  is_claimed: true,
  created_at: '',
}

const FAMILIES = '*/api/families/'
const SIMULATION = '*/api/families/fam-1/simulation/'

function contract(
  o: Partial<SimulationContractRead> = {},
): SimulationContractRead {
  return {
    id: 'c1',
    nanny: { id: 'n1', first_name: 'Marie', last_name: 'Dupont' },
    starting_date: '2024-01-01',
    ending_date: null,
    split_method: 'equal',
    paid_leave_days: 25,
    notes: '',
    families: [],
    current_terms: null,
    current_schedule: null,
    months: [
      {
        month: '2026-06',
        net_wage: '1000.00',
        transport: '50.00',
        mileage: '0.00',
        benefits_in_kind: '30.00',
        paid_leave_rappel: '0.00',
        total: '1080.00',
      },
      {
        month: '2027-05',
        net_wage: '1000.00',
        transport: '50.00',
        mileage: '0.00',
        benefits_in_kind: '30.00',
        paid_leave_rappel: '120.00',
        total: '1200.00',
      },
    ],
    total: '2280.00',
    ...o,
  }
}

function setup(contracts: SimulationContractRead[] = [contract()]) {
  server.use(
    http.get(FAMILIES, () => HttpResponse.json([family])),
    http.get(SIMULATION, () =>
      HttpResponse.json({
        period_start: '2026-06-01',
        period_end: '2027-05-31',
        contracts,
      }),
    ),
  )
}

describe('Simulation', () => {
  it('renders a detail table per contract with month rows and a footer total', async () => {
    setup()
    renderWithProviders(<Simulation />)

    expect(await screen.findByText('Marie Dupont')).toBeInTheDocument()
    // The component columns.
    expect(screen.getByText('Net wage')).toBeInTheDocument()
    expect(screen.getByText('Benefits in kind')).toBeInTheDocument()
    expect(screen.getByText('Paid-leave 1/10')).toBeInTheDocument()

    // A month row and its total.
    expect(screen.getByText('June 2026')).toBeInTheDocument()
    expect(screen.getByText('May 2027')).toBeInTheDocument()
    expect(screen.getByText('€1,200.00')).toBeInTheDocument()

    // The footer sums each column: net wage 2×1000, transport 2×50, rappel 120,
    // and the whole-period total 2280.
    const footer = screen.getByText('Total', { selector: 'td' }).closest('tr')
    expect(footer).not.toBeNull()
    const cells = within(footer as HTMLElement).getAllByRole('cell')
    expect(cells.map((c) => c.textContent)).toEqual([
      'Total',
      '€2,000.00',
      '€100.00',
      '€0.00',
      '€60.00',
      '€120.00',
      '€2,280.00',
    ])
  })

  it('shows an empty message when there is nothing to simulate', async () => {
    setup([])
    renderWithProviders(<Simulation />)
    expect(
      await screen.findByText('No contracts to simulate over this period.'),
    ).toBeInTheDocument()
  })

  it('shows an error message when the request fails', async () => {
    server.use(
      http.get(FAMILIES, () => HttpResponse.json([family])),
      http.get(SIMULATION, () => new HttpResponse(null, { status: 500 })),
    )
    renderWithProviders(<Simulation />)
    expect(
      await screen.findByText('Could not load the simulation.'),
    ).toBeInTheDocument()
  })
})
