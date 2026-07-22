import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { HttpResponse, http } from 'msw'
import { describe, expect, it } from 'vitest'
import type { ContractRead, ExceptionalHoursRead } from '@/src/api'
import { ExceptionalHoursSection } from '@/src/components/ExceptionalHoursSection'
import { server } from '@/tests/msw/server'
import { renderWithProviders, selectOption } from '@/tests/utils'

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
} as ContractRead

function makeHours(
  o: Partial<ExceptionalHoursRead> = {},
): ExceptionalHoursRead {
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

// The endpoints the section drives. `*` matches any origin so the relative
// baseUrl ('/api') resolves regardless of the jsdom host.
const HOURS = '*/api/families/1/contracts/10/exceptional-hours/'
const HOUR = '*/api/families/1/contracts/10/exceptional-hours/H1/'

// Register the list GET plus create/update/delete handlers that record what was
// sent, so tests can assert the request body — the MSW equivalent of the old
// `expect(mockFn).toHaveBeenCalledWith(...)`.
function setup(entries: ExceptionalHoursRead[] = []) {
  const calls: {
    create?: unknown
    update?: unknown
    deleted: boolean
  } = { deleted: false }
  server.use(
    http.get(HOURS, () => HttpResponse.json(entries)),
    http.post(HOURS, async ({ request }) => {
      calls.create = await request.json()
      return HttpResponse.json(makeHours(), { status: 201 })
    }),
    http.patch(HOUR, async ({ request }) => {
      calls.update = await request.json()
      return HttpResponse.json(makeHours())
    }),
    http.delete(HOUR, () => {
      calls.deleted = true
      return new HttpResponse(null, { status: 204 })
    }),
  )
  return calls
}

const render = () =>
  renderWithProviders(
    <ExceptionalHoursSection
      familyId="1"
      contract={contract}
      month="2026-07"
    />,
  )

describe('ExceptionalHoursSection', () => {
  it('shows the nanny name and an empty state', async () => {
    setup([])
    render()
    expect(await screen.findByText('Marie Dupont')).toBeInTheDocument()
    expect(
      screen.getByText('No exceptional hours this month.'),
    ).toBeInTheDocument()
  })

  it('lists an evening of extra hours and a night that runs past midnight', async () => {
    setup([
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
    const calls = setup()
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
    expect(calls.create).toBeUndefined()
  })

  it('requires start and end times before saving', async () => {
    const calls = setup()
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
    expect(calls.create).toBeUndefined()
  })

  it('creates an evening of extra hours', async () => {
    const calls = setup()
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
      expect(calls.create).toMatchObject({
        kind: 'effective',
        start_date: '2026-07-06',
        start_time: '18:00',
        end_date: '2026-07-06',
        end_time: '20:00',
        interventions: 0,
      }),
    )
  })

  it('asks for interventions only on a night, and files the count', async () => {
    const calls = setup()
    const user = userEvent.setup()
    render()
    await user.click(
      await screen.findByRole('button', { name: 'Add exceptional hours' }),
    )
    // Extra hours are not a night: nobody is woken.
    expect(screen.queryByLabelText('Times woken')).toBeNull()

    await selectOption('Kind', 'Night presence', user)
    await user.type(screen.getByLabelText('Times woken'), '2')
    await user.type(screen.getByLabelText('From'), '07/06/2026')
    await user.type(screen.getByLabelText('Start time'), '9:00 PM')
    await user.type(screen.getByLabelText('To'), '07/07/2026')
    await user.type(screen.getByLabelText('End time'), '7:00 AM')
    await user.click(
      screen.getByRole('button', { name: 'Save exceptional hours' }),
    )

    await waitFor(() =>
      expect(calls.create).toMatchObject({
        kind: 'night_presence',
        start_date: '2026-07-06',
        end_date: '2026-07-07',
        interventions: 2,
      }),
    )
  })

  it('edits an existing entry', async () => {
    const calls = setup([makeHours()])
    const user = userEvent.setup()
    render()
    await user.click(await screen.findByRole('button', { name: 'Edit' }))
    await user.type(screen.getByLabelText('Notes'), 'late pickup')
    await user.click(
      screen.getByRole('button', { name: 'Save exceptional hours' }),
    )
    await waitFor(() =>
      expect(calls.update).toMatchObject({
        notes: 'late pickup',
        start_time: '18:00',
        end_time: '20:00',
      }),
    )
  })

  it('deletes an entry after confirmation', async () => {
    const calls = setup([makeHours()])
    const user = userEvent.setup()
    render()
    await user.click(await screen.findByRole('button', { name: 'Delete' }))
    const dialog = await screen.findByRole('alertdialog')
    await user.click(within(dialog).getByRole('button', { name: 'Delete' }))
    await waitFor(() => expect(calls.deleted).toBe(true))
  })

  // The endpoint returns the acting family's entries and nobody else's — an
  // evening the other family kept the nanny late is their business with her —
  // so every row here is yours to edit. What the API hands back is a backend
  // test now; what this one owes is that the row offers its controls.
  it('offers Edit and Delete on the entries it is given', async () => {
    setup([makeHours()])
    render()

    expect(
      await screen.findByText(/07\/06\/2026 6:00 PM → 8:00 PM/),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Edit' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Delete' })).toBeInTheDocument()
  })

  it('surfaces the reason the server refused the combination', async () => {
    setup()
    // The convention forbids a présence responsable on a shared contract; the
    // rule lives on the server, and its message (a DRF 400) is what shows.
    server.use(
      http.post(HOURS, () =>
        HttpResponse.json(
          {
            kind: ['Responsible presence is not allowed on a shared contract.'],
          },
          { status: 400 },
        ),
      ),
    )
    const user = userEvent.setup()
    render()
    await user.click(
      await screen.findByRole('button', { name: 'Add exceptional hours' }),
    )
    await selectOption('Kind', 'Responsible presence', user)
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
    setup()
    // A 500 with no body carries no field messages, so the UI shows the fallback.
    server.use(http.post(HOURS, () => new HttpResponse(null, { status: 500 })))
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
    setup()
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
