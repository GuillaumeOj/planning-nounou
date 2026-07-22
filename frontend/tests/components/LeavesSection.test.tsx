import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { HttpResponse, http } from 'msw'
import { describe, expect, it } from 'vitest'
import type { ContractRead, LeaveRead } from '@/src/api'
import { LeavesSection } from '@/src/components/LeavesSection'
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

function makeLeave(o: Partial<LeaveRead> = {}): LeaveRead {
  return {
    id: 'L1',
    leave_type: 'paid',
    start_date: '2026-07-06',
    end_date: '2026-07-10',
    portion: 'full_day',
    hours: null,
    notes: '',
    ...o,
  }
}

// The endpoints LeavesSection drives. `*` matches any origin so the relative baseUrl
// ('/api') resolves regardless of the jsdom host.
const LEAVES = '*/api/families/1/contracts/10/leaves/'
const LEAVE = '*/api/families/1/contracts/10/leaves/L1/'

// Register the list GET (returning `leaves`) plus create/update/delete handlers that
// record what was sent, so tests can assert the request body — the MSW equivalent of
// the old `expect(mockFn).toHaveBeenCalledWith(...)`.
function setup(leaves: LeaveRead[] = []) {
  const calls: {
    create?: unknown
    update?: unknown
    deleted: boolean
  } = { deleted: false }
  server.use(
    http.get(LEAVES, () => HttpResponse.json(leaves)),
    http.post(LEAVES, async ({ request }) => {
      calls.create = await request.json()
      return HttpResponse.json(makeLeave(), { status: 201 })
    }),
    http.patch(LEAVE, async ({ request }) => {
      calls.update = await request.json()
      return HttpResponse.json(makeLeave())
    }),
    http.delete(LEAVE, () => {
      calls.deleted = true
      return new HttpResponse(null, { status: 204 })
    }),
  )
  return calls
}

const render = () =>
  renderWithProviders(
    <LeavesSection familyId="1" contract={contract} month="2026-07" />,
  )

describe('LeavesSection', () => {
  it('shows the nanny name and an empty state', async () => {
    setup([])
    render()
    expect(await screen.findByText('Marie Dupont')).toBeInTheDocument()
    expect(screen.getByText('No days off this month.')).toBeInTheDocument()
  })

  it('lists a multi-day paid leave and an hourly unpaid leave', async () => {
    setup([
      makeLeave({ id: 'L2' }),
      makeLeave({
        id: 'L3',
        leave_type: 'unpaid',
        portion: 'hourly',
        hours: '3.50',
        start_date: '2026-07-06',
        end_date: '2026-07-06',
      }),
    ])
    render()
    // Multi-day range + full-day portion label.
    expect(
      await screen.findByText(/Paid leave · Whole day/),
    ).toBeInTheDocument()
    // Single-day range + hourly portion rendered as an hours count.
    expect(screen.getByText(/Unpaid leave · 3.50 h/)).toBeInTheDocument()
  })

  it('requires start and end dates before saving', async () => {
    const calls = setup()
    const user = userEvent.setup()
    render()
    await user.click(
      await screen.findByRole('button', { name: 'Add days off' }),
    )
    await user.click(screen.getByRole('button', { name: 'Save days off' }))
    expect(
      await screen.findByText('Give a start and end date.'),
    ).toBeInTheDocument()
    expect(calls.create).toBeUndefined()
  })

  it('creates a full-day paid leave', async () => {
    const calls = setup()
    const user = userEvent.setup()
    render()
    await user.click(
      await screen.findByRole('button', { name: 'Add days off' }),
    )
    await user.type(screen.getByLabelText('From'), '07/06/2026')
    await user.type(screen.getByLabelText('To'), '07/10/2026')
    await user.click(screen.getByRole('button', { name: 'Save days off' }))
    await waitFor(() =>
      expect(calls.create).toMatchObject({
        leave_type: 'paid',
        start_date: '2026-07-06',
        end_date: '2026-07-10',
        portion: 'full_day',
        hours: null,
      }),
    )
  })

  it('offers hourly only for unpaid leave and creates it with hours', async () => {
    const calls = setup()
    const user = userEvent.setup()
    render()
    await user.click(
      await screen.findByRole('button', { name: 'Add days off' }),
    )

    // Paid leave: no hourly option. Open the dropdown to inspect its options,
    // then close it before moving on.
    await user.click(screen.getByRole('combobox', { name: 'Duration' }))
    expect(
      screen.queryByRole('option', { name: 'By the hour' }),
    ).not.toBeInTheDocument()
    await user.keyboard('{Escape}')

    await selectOption('Type', 'Unpaid leave', user)
    // Now hourly is offered.
    await selectOption('Duration', 'By the hour', user)
    await user.type(screen.getByLabelText('From'), '07/06/2026')
    await user.type(screen.getByLabelText('To'), '07/06/2026')
    await user.type(screen.getByLabelText('Number of hours'), '3.5')
    await user.click(screen.getByRole('button', { name: 'Save days off' }))

    await waitFor(() =>
      expect(calls.create).toMatchObject({
        leave_type: 'unpaid',
        portion: 'hourly',
        hours: '3.5',
      }),
    )
  })

  it('requires hours for an hourly leave', async () => {
    const calls = setup()
    const user = userEvent.setup()
    render()
    await user.click(
      await screen.findByRole('button', { name: 'Add days off' }),
    )
    await selectOption('Type', 'Unpaid leave', user)
    await selectOption('Duration', 'By the hour', user)
    await user.type(screen.getByLabelText('From'), '07/06/2026')
    await user.type(screen.getByLabelText('To'), '07/06/2026')
    await user.click(screen.getByRole('button', { name: 'Save days off' }))
    expect(
      await screen.findByText('Give the number of hours for an hourly leave.'),
    ).toBeInTheDocument()
    expect(calls.create).toBeUndefined()
  })

  it('resets hourly to whole day when switching away from unpaid', async () => {
    setup()
    const user = userEvent.setup()
    render()
    await user.click(
      await screen.findByRole('button', { name: 'Add days off' }),
    )
    await selectOption('Type', 'Unpaid leave', user)
    await selectOption('Duration', 'By the hour', user)
    expect(screen.getByLabelText('Number of hours')).toBeInTheDocument()

    await selectOption('Type', 'Paid leave', user)
    // The hours field is gone and hourly is no longer selectable.
    expect(screen.queryByLabelText('Number of hours')).toBeNull()
    await user.click(screen.getByRole('combobox', { name: 'Duration' }))
    expect(
      screen.queryByRole('option', { name: 'By the hour' }),
    ).not.toBeInTheDocument()
    await user.keyboard('{Escape}')
  })

  it('edits an existing leave', async () => {
    const calls = setup([makeLeave()])
    const user = userEvent.setup()
    render()
    await user.click(await screen.findByRole('button', { name: 'Edit' }))
    await user.type(screen.getByLabelText('Notes'), 'sick child')
    await user.click(screen.getByRole('button', { name: 'Save days off' }))
    await waitFor(() =>
      expect(calls.update).toMatchObject({ notes: 'sick child' }),
    )
  })

  it('deletes a leave after confirmation', async () => {
    const calls = setup([makeLeave()])
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
    server.use(http.post(LEAVES, () => new HttpResponse(null, { status: 500 })))
    const user = userEvent.setup()
    render()
    await user.click(
      await screen.findByRole('button', { name: 'Add days off' }),
    )
    await user.type(screen.getByLabelText('From'), '07/06/2026')
    await user.type(screen.getByLabelText('To'), '07/10/2026')
    await user.click(screen.getByRole('button', { name: 'Save days off' }))
    expect(
      await screen.findByText('Something went wrong. Please try again.'),
    ).toBeInTheDocument()
  })

  it('cancels the form', async () => {
    setup()
    const user = userEvent.setup()
    render()
    await user.click(
      await screen.findByRole('button', { name: 'Add days off' }),
    )
    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(
      screen.getByRole('button', { name: 'Add days off' }),
    ).toBeInTheDocument()
  })
})
