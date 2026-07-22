import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { HttpResponse, http } from 'msw'
import { describe, expect, it } from 'vitest'
import type {
  ContractChildRead,
  ContractRead,
  ExceptionalPresenceRead,
} from '@/src/api'
import { ExceptionalPresenceSection } from '@/src/components/ExceptionalPresenceSection'
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

// The picker submits the Child, not the ContractChild that carries it: `id` and
// `child` differ here so a mix-up cannot pass unnoticed.
function makeChild(o: Partial<ContractChildRead> = {}): ContractChildRead {
  return {
    id: 'CC1',
    child: 'C1',
    first_name: 'Léa',
    family_id: '1',
    windows: [],
    ...o,
  }
}

function makePresence(
  o: Partial<ExceptionalPresenceRead> = {},
): ExceptionalPresenceRead {
  return {
    id: 'P1',
    child: 'C1',
    first_name: 'Léa',
    date: '2026-07-08',
    start_time: '09:00:00',
    end_time: '12:00:00',
    notes: '',
    ...o,
  }
}

// The endpoints the section drives. `*` matches any origin so the relative
// baseUrl ('/api') resolves regardless of the jsdom host.
const PRESENCES = '*/api/families/1/contracts/10/exceptional-presences/'
const PRESENCE = '*/api/families/1/contracts/10/exceptional-presences/P1/'
const CHILDREN = '*/api/families/1/contracts/10/children/'

// Register the presences list GET, the contract-children list GET (the picker's
// options), plus create/update/delete handlers that record what was sent so
// tests can assert the request body.
function setup(
  entries: ExceptionalPresenceRead[] = [],
  children: ContractChildRead[] = [makeChild()],
) {
  const calls: {
    create?: unknown
    update?: unknown
    deleted: boolean
  } = { deleted: false }
  server.use(
    http.get(PRESENCES, () => HttpResponse.json(entries)),
    http.get(CHILDREN, () => HttpResponse.json(children)),
    http.post(PRESENCES, async ({ request }) => {
      calls.create = await request.json()
      return HttpResponse.json(makePresence(), { status: 201 })
    }),
    http.patch(PRESENCE, async ({ request }) => {
      calls.update = await request.json()
      return HttpResponse.json(makePresence())
    }),
    http.delete(PRESENCE, () => {
      calls.deleted = true
      return new HttpResponse(null, { status: 204 })
    }),
  )
  return calls
}

const render = () =>
  renderWithProviders(
    <ExceptionalPresenceSection
      familyId="1"
      contract={contract}
      month="2026-07"
    />,
  )

describe('ExceptionalPresenceSection', () => {
  it('shows the nanny name and an empty state', async () => {
    setup()
    render()
    expect(await screen.findByText('Marie Dupont')).toBeInTheDocument()
    expect(
      screen.getByText('No exceptional presence this month.'),
    ).toBeInTheDocument()
  })

  it('lists a presence with the child and the hours', async () => {
    setup([makePresence()])
    render()
    expect(
      await screen.findByText('07/08/2026 · Léa · 9:00 AM → 12:00 PM'),
    ).toBeInTheDocument()
  })

  it('offers the contract’s children in the picker', async () => {
    setup(
      [],
      [makeChild(), makeChild({ id: 'CC2', child: 'C2', first_name: 'Tom' })],
    )
    const user = userEvent.setup()
    render()
    await user.click(
      await screen.findByRole('button', {
        name: 'Add an exceptional presence',
      }),
    )
    await user.click(screen.getByRole('combobox', { name: 'Child' }))
    const options = screen.getByRole('listbox')
    expect(
      within(options).getByRole('option', { name: 'Léa' }),
    ).toBeInTheDocument()
    expect(
      within(options).getByRole('option', { name: 'Tom' }),
    ).toBeInTheDocument()
  })

  it('says so rather than offer a form when the contract covers no children', async () => {
    setup([], [])
    render()
    expect(
      await screen.findByText('Add the children this contract covers first.'),
    ).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'Add an exceptional presence' }),
    ).toBeNull()
  })

  it('requires a child before saving', async () => {
    const calls = setup()
    const user = userEvent.setup()
    render()
    await user.click(
      await screen.findByRole('button', {
        name: 'Add an exceptional presence',
      }),
    )
    await user.click(
      screen.getByRole('button', { name: 'Save the exceptional presence' }),
    )
    expect(await screen.findByText('Choose a child.')).toBeInTheDocument()
    expect(calls.create).toBeUndefined()
  })

  it('requires a date before saving', async () => {
    const calls = setup()
    const user = userEvent.setup()
    render()
    await user.click(
      await screen.findByRole('button', {
        name: 'Add an exceptional presence',
      }),
    )
    await selectOption('Child', 'Léa', user)
    await user.click(
      screen.getByRole('button', { name: 'Save the exceptional presence' }),
    )
    expect(await screen.findByText('Give a date.')).toBeInTheDocument()
    expect(calls.create).toBeUndefined()
  })

  it('requires start and end times before saving', async () => {
    const calls = setup()
    const user = userEvent.setup()
    render()
    await user.click(
      await screen.findByRole('button', {
        name: 'Add an exceptional presence',
      }),
    )
    await selectOption('Child', 'Léa', user)
    await user.type(screen.getByLabelText('Date'), '07/08/2026')
    await user.click(
      screen.getByRole('button', { name: 'Save the exceptional presence' }),
    )
    expect(
      await screen.findByText('Give a start and end time.'),
    ).toBeInTheDocument()
    expect(calls.create).toBeUndefined()
  })

  it('creates a presence for the child, not the contract child', async () => {
    const calls = setup()
    const user = userEvent.setup()
    render()
    await user.click(
      await screen.findByRole('button', {
        name: 'Add an exceptional presence',
      }),
    )
    await selectOption('Child', 'Léa', user)
    await user.type(screen.getByLabelText('Date'), '07/08/2026')
    await user.type(screen.getByLabelText('Start time'), '9:00 AM')
    await user.type(screen.getByLabelText('End time'), '12:00 PM')
    await user.click(
      screen.getByRole('button', { name: 'Save the exceptional presence' }),
    )
    await waitFor(() =>
      expect(calls.create).toMatchObject({
        child: 'C1',
        date: '2026-07-08',
        start_time: '09:00',
        end_time: '12:00',
      }),
    )
  })

  it('edits an existing presence', async () => {
    const calls = setup([makePresence()])
    const user = userEvent.setup()
    render()
    await user.click(await screen.findByRole('button', { name: 'Edit' }))
    await user.type(screen.getByLabelText('Notes'), 'no school')
    await user.click(
      screen.getByRole('button', { name: 'Save the exceptional presence' }),
    )
    await waitFor(() =>
      expect(calls.update).toMatchObject({
        child: 'C1',
        notes: 'no school',
        start_time: '09:00',
      }),
    )
  })

  it('deletes a presence after confirmation', async () => {
    const calls = setup([makePresence()])
    const user = userEvent.setup()
    render()
    await user.click(await screen.findByRole('button', { name: 'Delete' }))
    const dialog = await screen.findByRole('alertdialog')
    await user.click(within(dialog).getByRole('button', { name: 'Delete' }))
    await waitFor(() => expect(calls.deleted).toBe(true))
  })

  it('surfaces a server error on save', async () => {
    setup()
    // A 500 with no body carries no field messages, so the UI shows the fallback.
    server.use(
      http.post(PRESENCES, () => new HttpResponse(null, { status: 500 })),
    )
    const user = userEvent.setup()
    render()
    await user.click(
      await screen.findByRole('button', {
        name: 'Add an exceptional presence',
      }),
    )
    await selectOption('Child', 'Léa', user)
    await user.type(screen.getByLabelText('Date'), '07/08/2026')
    await user.type(screen.getByLabelText('Start time'), '9:00 AM')
    await user.type(screen.getByLabelText('End time'), '12:00 PM')
    await user.click(
      screen.getByRole('button', { name: 'Save the exceptional presence' }),
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
      await screen.findByRole('button', {
        name: 'Add an exceptional presence',
      }),
    )
    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(
      screen.getByRole('button', { name: 'Add an exceptional presence' }),
    ).toBeInTheDocument()
  })
})
