import { screen } from '@testing-library/react'
import { HttpResponse, http } from 'msw'
import { describe, expect, it } from 'vitest'
import type { SimulationContractRead } from '@/src/api'
import {
  compactMoney,
  ForecastTooltip,
  fullMonth,
  legendLabel,
  PaymentForecastChart,
  shortMonth,
  toRows,
} from '@/src/components/PaymentForecastChart'
import { server } from '@/tests/msw/server'
import { renderWithProviders } from '@/tests/utils'

const SIMULATION = '*/api/families/fam-1/simulation/'

function month(m: string, total: string) {
  return {
    month: m,
    net_wage: total,
    transport: '0.00',
    mileage: '0.00',
    benefits_in_kind: '0.00',
    paid_leave_rappel: '0.00',
    total,
  }
}

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
    months: [month('2026-07', '1000.00'), month('2026-08', '1100.00')],
    total: '2100.00',
    ...o,
  }
}

describe('toRows', () => {
  it('pivots per-contract months into one row per month', () => {
    const rows = toRows([
      contract(),
      contract({
        id: 'c2',
        months: [month('2026-08', '500.00'), month('2026-09', '600.00')],
      }),
    ])
    // The union of both contracts' months, sorted; each contract a numeric key.
    expect(rows.map((r) => r.month)).toEqual(['2026-07', '2026-08', '2026-09'])
    // July: only c1 is live; c2 contributes 0.
    expect(rows[0]).toMatchObject({ c1: 1000, c2: 0 })
    expect(rows[1]).toMatchObject({ c1: 1100, c2: 500 })
    expect(rows[2]).toMatchObject({ c1: 0, c2: 600 })
  })
})

// Recharts never invokes these callbacks under jsdom (no layout), so they are
// exercised directly rather than through a rendered chart.
describe('chart formatters', () => {
  it('shortMonth abbreviates the month in the given locale', () => {
    expect(shortMonth('2026-01', 'en')).toBe('Jan')
    expect(shortMonth('2026-01', 'fr')).toBe('janv.')
  })

  it('fullMonth spells the month and year in the given locale', () => {
    expect(fullMonth('2026-07', 'en')).toBe('July 2026')
    expect(fullMonth('2026-07', 'fr')).toBe('juillet 2026')
  })

  it('compactMoney renders a short currency amount', () => {
    expect(compactMoney(1500, 'en')).toMatch(/1\.5/)
    expect(compactMoney(1500, 'fr')).toMatch(/1,5/)
  })

  it('legendLabel maps a contract id to the nanny name, else the id', () => {
    const contracts = [contract()]
    expect(legendLabel(contracts, 'c1')).toBe('Marie Dupont')
    expect(legendLabel(contracts, 'unknown')).toBe('unknown')
  })
})

describe('ForecastTooltip', () => {
  const payload = [
    { dataKey: 'c1', value: 1000, color: '#f00' },
    { dataKey: 'c2', value: 500, color: '#00f' },
  ]
  const contracts = [
    contract(),
    contract({
      id: 'c2',
      nanny: { id: 'n2', first_name: 'Jean', last_name: 'Petit' },
    }),
  ]

  it('lists each series and the total when active', () => {
    renderWithProviders(
      <ForecastTooltip
        active
        label="2026-07"
        payload={payload}
        contracts={contracts}
        lang="en"
      />,
    )
    expect(screen.getByText('July 2026')).toBeInTheDocument()
    expect(screen.getByText('Marie Dupont')).toBeInTheDocument()
    expect(screen.getByText('Jean Petit')).toBeInTheDocument()
    // 1000 + 500 = 1500 total.
    expect(screen.getByText('€1,500.00')).toBeInTheDocument()
  })

  it('renders nothing when inactive', () => {
    renderWithProviders(
      <ForecastTooltip
        active={false}
        payload={payload}
        contracts={contracts}
        lang="en"
      />,
    )
    expect(screen.queryByText('Marie Dupont')).not.toBeInTheDocument()
  })

  it('renders nothing when the payload is empty', () => {
    renderWithProviders(
      <ForecastTooltip active payload={[]} contracts={contracts} lang="en" />,
    )
    expect(screen.queryByText('Marie Dupont')).not.toBeInTheDocument()
  })
})

describe('PaymentForecastChart', () => {
  it('renders the forecast card once data loads', async () => {
    server.use(
      http.get(SIMULATION, () =>
        HttpResponse.json({
          period_start: '2026-07-01',
          period_end: '2027-06-01',
          contracts: [contract()],
        }),
      ),
    )
    renderWithProviders(<PaymentForecastChart familyId="fam-1" />)
    expect(
      await screen.findByText('What you will pay (next 12 months)'),
    ).toBeInTheDocument()
    // The success branch: neither the empty nor the error message.
    expect(
      screen.queryByText('Nothing to forecast yet.'),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByText('Could not load the forecast.'),
    ).not.toBeInTheDocument()
  })

  it('shows an empty message when no contract has months', async () => {
    server.use(
      http.get(SIMULATION, () =>
        HttpResponse.json({
          period_start: '2026-07-01',
          period_end: '2027-06-01',
          contracts: [],
        }),
      ),
    )
    renderWithProviders(<PaymentForecastChart familyId="fam-1" />)
    expect(
      await screen.findByText('Nothing to forecast yet.'),
    ).toBeInTheDocument()
  })

  it('shows an error message when the request fails', async () => {
    server.use(
      http.get(SIMULATION, () => new HttpResponse(null, { status: 500 })),
    )
    renderWithProviders(<PaymentForecastChart familyId="fam-1" />)
    expect(
      await screen.findByText('Could not load the forecast.'),
    ).toBeInTheDocument()
  })
})
