import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Contract } from '@/src/api/contracts'
import {
  createLeave,
  deleteLeave,
  getLeaves,
  type Leave,
  updateLeave,
} from '@/src/api/leaves'
import { LeavesSection } from '@/src/components/LeavesSection'
import { renderWithProviders } from '@/tests/utils'

vi.mock('@/src/api/leaves', () => {
  const getLeaves = vi.fn()
  return {
    getLeaves,
    createLeave: vi.fn(),
    updateLeave: vi.fn(),
    deleteLeave: vi.fn(),
    leavesQueryOptions: (familyId: string, contractId: string) => ({
      queryKey: ['contract-leaves', contractId],
      queryFn: () => getLeaves(familyId, contractId),
    }),
  }
})

const m = {
  get: vi.mocked(getLeaves),
  create: vi.mocked(createLeave),
  update: vi.mocked(updateLeave),
  del: vi.mocked(deleteLeave),
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

function makeLeave(o: Partial<Leave> = {}): Leave {
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

const render = () =>
  renderWithProviders(
    <LeavesSection familyId="1" contract={contract} month="2026-07" />,
  )

beforeEach(() => {
  m.get.mockResolvedValue([])
  m.create.mockResolvedValue(makeLeave())
  m.update.mockResolvedValue(makeLeave())
  m.del.mockResolvedValue()
})
afterEach(() => vi.clearAllMocks())

describe('LeavesSection', () => {
  it('shows the nanny name and an empty state', async () => {
    render()
    expect(await screen.findByText('Marie Dupont')).toBeInTheDocument()
    expect(screen.getByText('No days off this month.')).toBeInTheDocument()
  })

  it('lists a multi-day paid leave and an hourly unpaid leave', async () => {
    m.get.mockResolvedValue([
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
    const user = userEvent.setup()
    render()
    await user.click(
      await screen.findByRole('button', { name: 'Add days off' }),
    )
    await user.click(screen.getByRole('button', { name: 'Save days off' }))
    expect(
      await screen.findByText('Give a start and end date.'),
    ).toBeInTheDocument()
    expect(m.create).not.toHaveBeenCalled()
  })

  it('creates a full-day paid leave', async () => {
    const user = userEvent.setup()
    render()
    await user.click(
      await screen.findByRole('button', { name: 'Add days off' }),
    )
    await user.type(screen.getByLabelText('From'), '07/06/2026')
    await user.type(screen.getByLabelText('To'), '07/10/2026')
    await user.click(screen.getByRole('button', { name: 'Save days off' }))
    await waitFor(() =>
      expect(m.create).toHaveBeenCalledWith(
        '1',
        '10',
        expect.objectContaining({
          leave_type: 'paid',
          start_date: '2026-07-06',
          end_date: '2026-07-10',
          portion: 'full_day',
          hours: null,
        }),
      ),
    )
  })

  it('offers hourly only for unpaid leave and creates it with hours', async () => {
    const user = userEvent.setup()
    render()
    await user.click(
      await screen.findByRole('button', { name: 'Add days off' }),
    )

    const portion = screen.getByLabelText('Duration')
    // Paid leave: no hourly option.
    expect(
      within(portion).queryByRole('option', { name: 'By the hour' }),
    ).toBeNull()

    await user.selectOptions(screen.getByLabelText('Type'), 'Unpaid leave')
    // Now hourly is offered.
    await user.selectOptions(portion, 'By the hour')
    await user.type(screen.getByLabelText('From'), '07/06/2026')
    await user.type(screen.getByLabelText('To'), '07/06/2026')
    await user.type(screen.getByLabelText('Number of hours'), '3.5')
    await user.click(screen.getByRole('button', { name: 'Save days off' }))

    await waitFor(() =>
      expect(m.create).toHaveBeenCalledWith(
        '1',
        '10',
        expect.objectContaining({
          leave_type: 'unpaid',
          portion: 'hourly',
          hours: '3.5',
        }),
      ),
    )
  })

  it('requires hours for an hourly leave', async () => {
    const user = userEvent.setup()
    render()
    await user.click(
      await screen.findByRole('button', { name: 'Add days off' }),
    )
    await user.selectOptions(screen.getByLabelText('Type'), 'Unpaid leave')
    await user.selectOptions(screen.getByLabelText('Duration'), 'By the hour')
    await user.type(screen.getByLabelText('From'), '07/06/2026')
    await user.type(screen.getByLabelText('To'), '07/06/2026')
    await user.click(screen.getByRole('button', { name: 'Save days off' }))
    expect(
      await screen.findByText('Give the number of hours for an hourly leave.'),
    ).toBeInTheDocument()
    expect(m.create).not.toHaveBeenCalled()
  })

  it('resets hourly to whole day when switching away from unpaid', async () => {
    const user = userEvent.setup()
    render()
    await user.click(
      await screen.findByRole('button', { name: 'Add days off' }),
    )
    await user.selectOptions(screen.getByLabelText('Type'), 'Unpaid leave')
    await user.selectOptions(screen.getByLabelText('Duration'), 'By the hour')
    expect(screen.getByLabelText('Number of hours')).toBeInTheDocument()

    await user.selectOptions(screen.getByLabelText('Type'), 'Paid leave')
    // The hours field is gone and hourly is no longer selectable.
    expect(screen.queryByLabelText('Number of hours')).toBeNull()
    expect(
      within(screen.getByLabelText('Duration')).queryByRole('option', {
        name: 'By the hour',
      }),
    ).toBeNull()
  })

  it('edits an existing leave', async () => {
    m.get.mockResolvedValue([makeLeave()])
    const user = userEvent.setup()
    render()
    await user.click(await screen.findByRole('button', { name: 'Edit' }))
    await user.type(screen.getByLabelText('Notes'), 'sick child')
    await user.click(screen.getByRole('button', { name: 'Save days off' }))
    await waitFor(() =>
      expect(m.update).toHaveBeenCalledWith(
        '1',
        '10',
        'L1',
        expect.objectContaining({ notes: 'sick child' }),
      ),
    )
  })

  it('deletes a leave after confirmation', async () => {
    m.get.mockResolvedValue([makeLeave()])
    const user = userEvent.setup()
    render()
    await user.click(await screen.findByRole('button', { name: 'Delete' }))
    const dialog = await screen.findByRole('alertdialog')
    await user.click(within(dialog).getByRole('button', { name: 'Delete' }))
    await waitFor(() => expect(m.del).toHaveBeenCalledWith('1', '10', 'L1'))
  })

  it('surfaces a server error on save', async () => {
    m.create.mockRejectedValue(new Error('boom'))
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
