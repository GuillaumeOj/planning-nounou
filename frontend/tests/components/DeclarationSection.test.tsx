import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Contract } from '@/src/api/contracts'
import {
  fileDeclaration,
  getDeclarations,
  type MonthlyDeclaration,
  updateDeclaration,
} from '@/src/api/declarations'
import { DeclarationSection } from '@/src/components/DeclarationSection'
import { renderWithProviders } from '@/tests/utils'

vi.mock('@/src/api/declarations', () => ({
  getDeclarations: vi.fn(),
  updateDeclaration: vi.fn(),
  fileDeclaration: vi.fn(),
}))

const m = {
  declarations: vi.mocked(getDeclarations),
  update: vi.mocked(updateDeclaration),
  file: vi.mocked(fileDeclaration),
}

const OWN_FAMILY = 'fam-1'

const contract = {
  id: 'contract-1',
  nanny: { id: 'n1', first_name: 'Marie', last_name: 'Dupont' },
} as Contract

function makeDeclaration(
  o: Partial<MonthlyDeclaration> = {},
): MonthlyDeclaration {
  return {
    id: 'dec-1',
    family: OWN_FAMILY,
    family_name: 'Ada',
    month: '2026-06-01',
    status: 'draft',
    normal_hours: '120.00',
    hours_25: '4.00',
    hours_50: '0.00',
    net_salary: '1234.56',
    total_amount: '1244.56',
    transport_amount: '0.00',
    benefits_in_kind_amount: '0.00',
    kilometers: '0.00',
    mileage_amount: '0.00',
    night_count: 0,
    night_indemnity: '0.00',
    holiday_majoration: '0.00',
    net_hourly_rate: '5.50',
    night_presence_rate: '0.00',
    mileage_rate: '0.45',
    rate_periods: [],
    warnings: [],
    computed_at: '2026-07-01T10:00:00Z',
    filed_at: null,
    // A draft is always editable; filed tests that want a locked row say so.
    is_editable: true,
    editable_until: '2026-08-31',
    ...o,
  }
}

const render = (month = '2026-06') =>
  renderWithProviders(
    <DeclarationSection
      familyId={OWN_FAMILY}
      contract={contract}
      month={month}
    />,
  )

beforeEach(() => {
  vi.clearAllMocks()
  m.declarations.mockResolvedValue([makeDeclaration()])
})

describe('DeclarationSection', () => {
  it('asks for the month it was given', async () => {
    render('2026-06')
    await screen.findByText('Ada')
    expect(m.declarations).toHaveBeenCalledWith(
      OWN_FAMILY,
      'contract-1',
      '2026-06',
    )
  })

  it('shows the figures a parent types into pajemploi', async () => {
    render()

    expect(await screen.findByText('Normal hours')).toBeInTheDocument()
    expect(screen.getByText('120.00')).toBeInTheDocument()
    expect(screen.getByText('Hours at +25%')).toBeInTheDocument()
    expect(screen.getByText('4.00')).toBeInTheDocument()
    // Net salary and total are separate pajemploi fields; both are formatted as
    // money, not the raw decimal string the API sends.
    expect(screen.getByText('Net salary')).toBeInTheDocument()
    expect(screen.getByText('€1,234.56')).toBeInTheDocument()
    expect(screen.getByText('Total')).toBeInTheDocument()
    expect(screen.getByText('€1,244.56')).toBeInTheDocument()
  })

  it('names the nanny the declaration is for', async () => {
    render()
    expect(await screen.findByText('Marie Dupont')).toBeInTheDocument()
  })

  // The endpoint returns the acting family's row and nobody else's — B's hours
  // and B's salary are B's — so there is exactly one card and it is always
  // yours. The gating that used to live here is a backend test now.
  it('shows the acting family’s declaration, and only it', async () => {
    render()

    expect(await screen.findByText('Ada')).toBeInTheDocument()
    expect(screen.getAllByLabelText('Kilometres driven')).toHaveLength(1)
    expect(
      screen.getAllByRole('button', { name: 'File this month' }),
    ).toHaveLength(1)
  })

  it('says so when there is nothing to declare', async () => {
    m.declarations.mockResolvedValue([])
    render()
    expect(
      await screen.findByText('Nothing to declare for this month.'),
    ).toBeInTheDocument()
  })

  it('reports a load failure rather than an empty month', async () => {
    m.declarations.mockRejectedValue(new Error('boom'))
    render()
    expect(
      await screen.findByText('Could not load the declarations.'),
    ).toBeInTheDocument()
  })

  // Zeroed optional lines are noise between a parent and the figure they came
  // for, so they are dropped rather than shown as 0.
  it('hides the night and holiday lines when there are none', async () => {
    render()
    await screen.findByText('Normal hours')

    expect(screen.queryByText('Nights')).not.toBeInTheDocument()
    expect(
      screen.queryByText('Night presence indemnity'),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByText('Public holiday majoration'),
    ).not.toBeInTheDocument()
  })

  it('shows the night lines once there are nights', async () => {
    m.declarations.mockResolvedValue([
      makeDeclaration({
        night_count: 2,
        night_indemnity: '48.00',
        night_presence_rate: '2.75',
      }),
    ])
    render()

    expect(await screen.findByText('Nights')).toBeInTheDocument()
    expect(screen.getByText('2')).toBeInTheDocument()
    expect(screen.getByText('€48.00')).toBeInTheDocument()
    expect(screen.getByText('Night presence rate')).toBeInTheDocument()
    expect(screen.getByText('€2.75/hour')).toBeInTheDocument()
  })

  it('shows the expenses and benefits the contract carries', async () => {
    m.declarations.mockResolvedValue([
      makeDeclaration({
        transport_amount: '30.00',
        benefits_in_kind_amount: '12.50',
      }),
    ])
    render()

    expect(await screen.findByText('Transport')).toBeInTheDocument()
    expect(screen.getByText('€30.00')).toBeInTheDocument()
    expect(screen.getByText('Benefits in kind')).toBeInTheDocument()
    expect(screen.getByText('€12.50')).toBeInTheDocument()
  })

  it('hides the expense lines the contract does not carry', async () => {
    render()
    await screen.findByText('Normal hours')

    expect(screen.queryByText('Transport')).not.toBeInTheDocument()
    expect(screen.queryByText('Benefits in kind')).not.toBeInTheDocument()
  })

  // The rates a figure was priced at, so a parent can reproduce the total.
  it('shows the rates applied', async () => {
    render()

    expect(await screen.findByText('Net hourly rate')).toBeInTheDocument()
    expect(screen.getByText('€5.50/hour')).toBeInTheDocument()
    expect(screen.getByText('Mileage rate')).toBeInTheDocument()
    expect(screen.getByText('€0.45/km')).toBeInTheDocument()
  })
})

describe('DeclarationSection kilometres', () => {
  it('saves the kilometres and takes the backend’s normalisation', async () => {
    m.update.mockResolvedValue(
      makeDeclaration({ kilometers: '42.00', mileage_amount: '18.90' }),
    )
    render()

    const field = await screen.findByLabelText('Kilometres driven')
    await userEvent.clear(field)
    await userEvent.type(field, '42')
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() =>
      expect(m.update).toHaveBeenCalledWith(OWN_FAMILY, 'contract-1', 'dec-1', {
        kilometers: '42',
      }),
    )
    await waitFor(() => expect(field).toHaveValue(42))
  })

  // Saving a value the server already holds would be a write for nothing.
  it('cannot save until the field actually changes', async () => {
    render()
    await screen.findByLabelText('Kilometres driven')

    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled()

    await userEvent.type(screen.getByLabelText('Kilometres driven'), '5')
    expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled()
  })

  it('surfaces a failed save rather than pretending it worked', async () => {
    m.update.mockRejectedValue(new Error('nope'))
    render()

    await userEvent.type(await screen.findByLabelText('Kilometres driven'), '5')
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))

    expect(
      await screen.findByText('Could not save the kilometres.'),
    ).toBeInTheDocument()
  })
})

describe('DeclarationSection filing', () => {
  it('files only after the confirmation is accepted', async () => {
    m.file.mockResolvedValue(makeDeclaration({ status: 'filed' }))
    render()

    await userEvent.click(
      await screen.findByRole('button', { name: 'File this month' }),
    )
    // The dialog restates what filing costs: it cannot be undone.
    expect(
      screen.getByText(/Filing records these figures as sent to pajemploi/),
    ).toBeInTheDocument()
    expect(m.file).not.toHaveBeenCalled()

    const dialog = screen.getByRole('alertdialog')
    await userEvent.click(
      within(dialog).getByRole('button', { name: 'File this month' }),
    )

    await waitFor(() =>
      expect(m.file).toHaveBeenCalledWith(OWN_FAMILY, 'contract-1', 'dec-1'),
    )
  })

  it('does not file when the confirmation is dismissed', async () => {
    render()

    await userEvent.click(
      await screen.findByRole('button', { name: 'File this month' }),
    )
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(m.file).not.toHaveBeenCalled()
  })

  it('surfaces a failed filing', async () => {
    m.file.mockRejectedValue(new Error('nope'))
    render()

    await userEvent.click(
      await screen.findByRole('button', { name: 'File this month' }),
    )
    const dialog = screen.getByRole('alertdialog')
    await userEvent.click(
      within(dialog).getByRole('button', { name: 'File this month' }),
    )

    expect(
      await screen.findByText('Could not file the declaration.'),
    ).toBeInTheDocument()
  })

  // Past its grace window a filed declaration is locked, so nothing on it writes.
  it('a locked filed declaration offers neither kilometres nor filing', async () => {
    m.declarations.mockResolvedValue([
      makeDeclaration({
        status: 'filed',
        is_editable: false,
        filed_at: '2026-07-03T09:30:00Z',
        kilometers: '42.00',
        mileage_amount: '18.90',
      }),
    ])
    render()

    expect(await screen.findByText('Filed')).toBeInTheDocument()
    expect(screen.queryByLabelText('Kilometres driven')).not.toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'File this month' }),
    ).not.toBeInTheDocument()
    // The mileage still has to be visible; it just cannot be edited.
    expect(screen.getByText('Mileage')).toBeInTheDocument()
    expect(screen.getByText('€18.90')).toBeInTheDocument()
    expect(screen.getByText(/Filed on/)).toBeInTheDocument()
  })

  // Within the grace window a filed month stays correctable in place: the
  // kilometres control is still there, though the file button is gone (it is
  // already filed), and a note says until when it can still change.
  it('a filed declaration in its grace window stays editable', async () => {
    m.declarations.mockResolvedValue([
      makeDeclaration({
        status: 'filed',
        is_editable: true,
        filed_at: '2026-07-03T09:30:00Z',
        editable_until: '2026-09-30',
      }),
    ])
    render()

    expect(await screen.findByText('Filed')).toBeInTheDocument()
    expect(screen.getByLabelText('Kilometres driven')).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'File this month' }),
    ).not.toBeInTheDocument()
    expect(screen.getByText(/Editable until/)).toBeInTheDocument()
  })

  it('marks a draft as a draft', async () => {
    render()
    expect(await screen.findByText('Draft')).toBeInTheDocument()
  })
})

describe('DeclarationSection warnings', () => {
  const warned = () =>
    makeDeclaration({
      warnings: [
        {
          code: 'presence_responsable_in_shared_care',
          source: {
            ref: 'CCN 3239 art. 137.1',
            url: 'https://example.test/137-1',
            quote: 'La présence responsable ne peut pas être partagée.',
          },
        },
      ],
    })

  // The quote and the link are the point: a parent can check the figure against
  // the convention rather than take our word for it.
  it('spells out the warning and cites the article behind it', async () => {
    m.declarations.mockResolvedValue([warned()])
    render()

    expect(
      await screen.findByText(
        'Responsible presence is not allowed on a shared contract, so it was not priced.',
      ),
    ).toBeInTheDocument()
    expect(
      screen.getByText(/La présence responsable ne peut pas être partagée./),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('link', { name: 'CCN 3239 art. 137.1' }),
    ).toHaveAttribute('href', 'https://example.test/137-1')
  })

  it('shows a warning with no source at all', async () => {
    m.declarations.mockResolvedValue([
      makeDeclaration({
        warnings: [{ code: 'split_without_children', source: null }],
      }),
    ])
    render()

    expect(
      await screen.findByText(
        'This contract splits the pay between families but lists no children, so there is nothing to split by.',
      ),
    ).toBeInTheDocument()
  })

  // A code we have no wording for is still worth showing: silence would hide a
  // figure the parent should question.
  it('falls back to the raw code for a warning it cannot spell out', async () => {
    m.declarations.mockResolvedValue([
      makeDeclaration({
        warnings: [{ code: 'some_new_backend_warning', source: null }],
      }),
    ])
    render()

    expect(
      await screen.findByText('some_new_backend_warning'),
    ).toBeInTheDocument()
  })

  it('shows no warning banner on a clean declaration', async () => {
    render()
    await screen.findByText('Normal hours')
    expect(
      screen.queryByText('Check these before filing'),
    ).not.toBeInTheDocument()
  })
})

describe('DeclarationSection rate periods', () => {
  const periods = [
    {
      from: '2026-06-01',
      to: '2026-06-14',
      days: 14,
      net_hourly_rate: '5.50',
      night_presence_rate: '0.00',
      transport_fee: '0.00',
      mileage_rate: '0.45',
      benefits_in_kind: '0.00',
    },
    {
      from: '2026-06-15',
      to: '2026-06-30',
      days: 16,
      net_hourly_rate: '6.00',
      night_presence_rate: '0.00',
      transport_fee: '0.00',
      mileage_rate: '0.45',
      benefits_in_kind: '0.00',
    },
  ]

  // The one case where total != hours × rate, so it is the one case worth the space.
  it('lists the periods once the rates moved mid-month', async () => {
    m.declarations.mockResolvedValue([
      makeDeclaration({ rate_periods: periods }),
    ])
    render()

    expect(
      await screen.findByText('Rates changed mid-month'),
    ).toBeInTheDocument()
    expect(screen.getByText(/14 days/)).toBeInTheDocument()
    expect(screen.getByText(/16 days/)).toBeInTheDocument()
    expect(screen.getByText(/€6.00/)).toBeInTheDocument()
  })

  it('stays quiet when a single rate ran all month', async () => {
    m.declarations.mockResolvedValue([
      makeDeclaration({ rate_periods: [periods[0]] }),
    ])
    render()
    await screen.findByText('Normal hours')

    expect(
      screen.queryByText('Rates changed mid-month'),
    ).not.toBeInTheDocument()
  })
})
