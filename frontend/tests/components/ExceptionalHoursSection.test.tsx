import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AxiosError } from 'axios'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Contract } from '@/src/api/contracts'
import {
  createExceptionalHours,
  deleteExceptionalHours,
  type ExceptionalHours,
  getExceptionalHours,
  updateExceptionalHours,
} from '@/src/api/declarations'
import { ExceptionalHoursSection } from '@/src/components/ExceptionalHoursSection'
import { renderWithProviders } from '@/tests/utils'

vi.mock('@/src/api/declarations', () => {
  const getExceptionalHours = vi.fn()
  return {
    getExceptionalHours,
    createExceptionalHours: vi.fn(),
    updateExceptionalHours: vi.fn(),
    deleteExceptionalHours: vi.fn(),
    exceptionalHoursQueryOptions: (familyId: string, contractId: string) => ({
      queryKey: ['exceptional-hours', contractId],
      queryFn: () => getExceptionalHours(familyId, contractId),
    }),
  }
})

const m = {
  get: vi.mocked(getExceptionalHours),
  create: vi.mocked(createExceptionalHours),
  update: vi.mocked(updateExceptionalHours),
  del: vi.mocked(deleteExceptionalHours),
}

const contract = {
  id: '10',
  nanny: { id: '5', first_name: 'Marie', last_name: 'Dupont' },
  starting_date: '2026-06-01',
  ending_date: null,
  split_method: 'equal',
  paid_leave_days: 25,
  notes: '',
  families: [{ id: '1', name: 'Home', is_originator: true }],
  current_terms: null,
  current_schedule: null,
} as Contract

function makeHours(o: Partial<ExceptionalHours> = {}): ExceptionalHours {
  return {
    id: 'H1',
    family: '1',
    kind: 'effective',
    is_shared: false,
    start_date: '2026-07-06',
    start_time: '18:00:00',
    end_date: '2026-07-06',
    end_time: '20:00:00',
    interventions: 0,
    notes: '',
    ...o,
  }
}

// A DRF 400 as axios surfaces it: the server's reason, not a generic failure.
function rejection(data: unknown): AxiosError {
  const error = new AxiosError('request failed')
  // biome-ignore lint/suspicious/noExplicitAny: minimal response shape for the test
  error.response = { data } as any
  return error
}

const render = () =>
  renderWithProviders(
    <ExceptionalHoursSection
      familyId="1"
      contract={contract}
      month="2026-07"
    />,
  )

beforeEach(() => {
  m.get.mockResolvedValue([])
  m.create.mockResolvedValue(makeHours())
  m.update.mockResolvedValue(makeHours())
  m.del.mockResolvedValue()
})
afterEach(() => vi.clearAllMocks())

describe('ExceptionalHoursSection', () => {
  it('shows the nanny name and an empty state', async () => {
    render()
    expect(await screen.findByText('Marie Dupont')).toBeInTheDocument()
    expect(
      screen.getByText('No exceptional hours this month.'),
    ).toBeInTheDocument()
  })

  it('lists an evening of extra hours and a night that runs past midnight', async () => {
    m.get.mockResolvedValue([
      makeHours({ id: 'H2' }),
      makeHours({
        id: 'H3',
        kind: 'night_presence',
        start_date: '2026-07-06',
        start_time: '21:00:00',
        end_date: '2026-07-07',
        end_time: '07:00:00',
        interventions: 2,
      }),
    ])
    render()
    // Same day: the end is a bare time.
    expect(
      await screen.findByText(
        '07/06/2026 6:00 PM → 8:00 PM · Extra hours worked',
      ),
    ).toBeInTheDocument()
    // Past midnight: the end carries its own date, and the wake-ups show —
    // from the second one they move the money.
    expect(
      screen.getByText(
        '07/06/2026 9:00 PM → 07/07/2026 7:00 AM · Night presence · 2 wake-ups',
      ),
    ).toBeInTheDocument()
  })

  it('requires start and end dates before saving', async () => {
    const user = userEvent.setup()
    render()
    await user.click(
      await screen.findByRole('button', { name: 'Add exceptional hours' }),
    )
    await user.click(
      screen.getByRole('button', { name: 'Save exceptional hours' }),
    )
    expect(
      await screen.findByText('Give a start and end date.'),
    ).toBeInTheDocument()
    expect(m.create).not.toHaveBeenCalled()
  })

  it('requires start and end times before saving', async () => {
    const user = userEvent.setup()
    render()
    await user.click(
      await screen.findByRole('button', { name: 'Add exceptional hours' }),
    )
    await user.type(screen.getByLabelText('From'), '07/06/2026')
    await user.type(screen.getByLabelText('To'), '07/06/2026')
    await user.click(
      screen.getByRole('button', { name: 'Save exceptional hours' }),
    )
    expect(
      await screen.findByText('Give a start and end time.'),
    ).toBeInTheDocument()
    expect(m.create).not.toHaveBeenCalled()
  })

  it('creates an evening of extra hours', async () => {
    const user = userEvent.setup()
    render()
    await user.click(
      await screen.findByRole('button', { name: 'Add exceptional hours' }),
    )
    await user.type(screen.getByLabelText('From'), '07/06/2026')
    await user.type(screen.getByLabelText('Start time'), '6:00 PM')
    await user.type(screen.getByLabelText('To'), '07/06/2026')
    await user.type(screen.getByLabelText('End time'), '8:00 PM')
    await user.click(
      screen.getByRole('button', { name: 'Save exceptional hours' }),
    )
    await waitFor(() =>
      expect(m.create).toHaveBeenCalledWith(
        '1',
        '10',
        expect.objectContaining({
          kind: 'effective',
          start_date: '2026-07-06',
          start_time: '18:00',
          end_date: '2026-07-06',
          end_time: '20:00',
          interventions: 0,
        }),
      ),
    )
  })

  it('asks for interventions only on a night, and files the count', async () => {
    const user = userEvent.setup()
    render()
    await user.click(
      await screen.findByRole('button', { name: 'Add exceptional hours' }),
    )
    // Extra hours are not a night: nobody is woken.
    expect(screen.queryByLabelText('Times woken')).toBeNull()

    await user.selectOptions(screen.getByLabelText('Kind'), 'Night presence')
    await user.type(screen.getByLabelText('Times woken'), '2')
    await user.type(screen.getByLabelText('From'), '07/06/2026')
    await user.type(screen.getByLabelText('Start time'), '9:00 PM')
    await user.type(screen.getByLabelText('To'), '07/07/2026')
    await user.type(screen.getByLabelText('End time'), '7:00 AM')
    await user.click(
      screen.getByRole('button', { name: 'Save exceptional hours' }),
    )

    await waitFor(() =>
      expect(m.create).toHaveBeenCalledWith(
        '1',
        '10',
        expect.objectContaining({
          kind: 'night_presence',
          start_date: '2026-07-06',
          end_date: '2026-07-07',
          interventions: 2,
        }),
      ),
    )
  })

  it('edits an existing entry', async () => {
    m.get.mockResolvedValue([makeHours()])
    const user = userEvent.setup()
    render()
    await user.click(await screen.findByRole('button', { name: 'Edit' }))
    await user.type(screen.getByLabelText('Notes'), 'late pickup')
    await user.click(
      screen.getByRole('button', { name: 'Save exceptional hours' }),
    )
    await waitFor(() =>
      expect(m.update).toHaveBeenCalledWith(
        '1',
        '10',
        'H1',
        expect.objectContaining({
          notes: 'late pickup',
          start_time: '18:00',
          end_time: '20:00',
        }),
      ),
    )
  })

  it('deletes an entry after confirmation', async () => {
    m.get.mockResolvedValue([makeHours()])
    const user = userEvent.setup()
    render()
    await user.click(await screen.findByRole('button', { name: 'Delete' }))
    const dialog = await screen.findByRole('alertdialog')
    await user.click(within(dialog).getByRole('button', { name: 'Delete' }))
    await waitFor(() => expect(m.del).toHaveBeenCalledWith('1', '10', 'H1'))
  })

  // The endpoint returns the acting family's entries and nobody else's — an
  // evening the other family kept the nanny late is their business with her —
  // so every row here is yours to edit. What the API hands back is a backend
  // test now; what this one owes is that the row offers its controls.
  it('offers Edit and Delete on the entries it is given', async () => {
    m.get.mockResolvedValue([makeHours()])
    render()

    expect(
      await screen.findByText(/07\/06\/2026 6:00 PM → 8:00 PM/),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Edit' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Delete' })).toBeInTheDocument()
  })

  it('surfaces the reason the server refused the combination', async () => {
    // The convention forbids a présence responsable on a shared contract; the
    // rule lives on the server, and its message is what the parent must read.
    m.create.mockRejectedValue(
      rejection({
        kind: ['Responsible presence is not allowed on a shared contract.'],
      }),
    )
    const user = userEvent.setup()
    render()
    await user.click(
      await screen.findByRole('button', { name: 'Add exceptional hours' }),
    )
    await user.selectOptions(
      screen.getByLabelText('Kind'),
      'Responsible presence',
    )
    await user.type(screen.getByLabelText('From'), '07/06/2026')
    await user.type(screen.getByLabelText('Start time'), '6:00 PM')
    await user.type(screen.getByLabelText('To'), '07/06/2026')
    await user.type(screen.getByLabelText('End time'), '8:00 PM')
    await user.click(
      screen.getByRole('button', { name: 'Save exceptional hours' }),
    )
    expect(
      await screen.findByText(
        'Responsible presence is not allowed on a shared contract.',
      ),
    ).toBeInTheDocument()
  })

  it('falls back to a generic message when the failure carries none', async () => {
    m.create.mockRejectedValue(new Error('boom'))
    const user = userEvent.setup()
    render()
    await user.click(
      await screen.findByRole('button', { name: 'Add exceptional hours' }),
    )
    await user.type(screen.getByLabelText('From'), '07/06/2026')
    await user.type(screen.getByLabelText('Start time'), '6:00 PM')
    await user.type(screen.getByLabelText('To'), '07/06/2026')
    await user.type(screen.getByLabelText('End time'), '8:00 PM')
    await user.click(
      screen.getByRole('button', { name: 'Save exceptional hours' }),
    )
    expect(
      await screen.findByText('Something went wrong. Please try again.'),
    ).toBeInTheDocument()
  })

  it('cancels the form', async () => {
    const user = userEvent.setup()
    render()
    await user.click(
      await screen.findByRole('button', { name: 'Add exceptional hours' }),
    )
    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(
      screen.getByRole('button', { name: 'Add exceptional hours' }),
    ).toBeInTheDocument()
  })
})
