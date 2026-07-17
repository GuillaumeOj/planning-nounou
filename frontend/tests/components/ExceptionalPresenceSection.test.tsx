import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Contract } from '@/src/api/contracts'
import {
  type ContractChild,
  createExceptionalPresence,
  deleteExceptionalPresence,
  type ExceptionalPresence,
  getContractChildren,
  getExceptionalPresences,
  updateExceptionalPresence,
} from '@/src/api/declarations'
import { ExceptionalPresenceSection } from '@/src/components/ExceptionalPresenceSection'
import { renderWithProviders } from '@/tests/utils'

vi.mock('@/src/api/declarations', () => {
  const getExceptionalPresences = vi.fn()
  return {
    getExceptionalPresences,
    createExceptionalPresence: vi.fn(),
    updateExceptionalPresence: vi.fn(),
    deleteExceptionalPresence: vi.fn(),
    getContractChildren: vi.fn(),
    exceptionalPresencesQueryOptions: (
      familyId: string,
      contractId: string,
    ) => ({
      queryKey: ['exceptional-presences', contractId],
      queryFn: () => getExceptionalPresences(familyId, contractId),
    }),
  }
})

const m = {
  get: vi.mocked(getExceptionalPresences),
  create: vi.mocked(createExceptionalPresence),
  update: vi.mocked(updateExceptionalPresence),
  del: vi.mocked(deleteExceptionalPresence),
  children: vi.mocked(getContractChildren),
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

// The picker submits the Child, not the ContractChild that carries it: `id` and
// `child` differ here so a mix-up cannot pass unnoticed.
function makeChild(o: Partial<ContractChild> = {}): ContractChild {
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
  o: Partial<ExceptionalPresence> = {},
): ExceptionalPresence {
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

const render = () =>
  renderWithProviders(
    <ExceptionalPresenceSection
      familyId="1"
      contract={contract}
      month="2026-07"
    />,
  )

beforeEach(() => {
  m.get.mockResolvedValue([])
  m.children.mockResolvedValue([makeChild()])
  m.create.mockResolvedValue(makePresence())
  m.update.mockResolvedValue(makePresence())
  m.del.mockResolvedValue()
})
afterEach(() => vi.clearAllMocks())

describe('ExceptionalPresenceSection', () => {
  it('shows the nanny name and an empty state', async () => {
    render()
    expect(await screen.findByText('Marie Dupont')).toBeInTheDocument()
    expect(
      screen.getByText('No exceptional presence this month.'),
    ).toBeInTheDocument()
  })

  it('lists a presence with the child and the hours', async () => {
    m.get.mockResolvedValue([makePresence()])
    render()
    expect(
      await screen.findByText('07/08/2026 · Léa · 9:00 AM → 12:00 PM'),
    ).toBeInTheDocument()
  })

  it('offers the contract’s children in the picker', async () => {
    m.children.mockResolvedValue([
      makeChild(),
      makeChild({ id: 'CC2', child: 'C2', first_name: 'Tom' }),
    ])
    const user = userEvent.setup()
    render()
    await user.click(
      await screen.findByRole('button', {
        name: 'Add an exceptional presence',
      }),
    )
    const picker = screen.getByLabelText('Child')
    expect(within(picker).getByRole('option', { name: 'Léa' })).toHaveValue(
      'C1',
    )
    expect(within(picker).getByRole('option', { name: 'Tom' })).toHaveValue(
      'C2',
    )
  })

  it('says so rather than offer a form when the contract covers no children', async () => {
    m.children.mockResolvedValue([])
    render()
    expect(
      await screen.findByText('Add the children this contract covers first.'),
    ).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'Add an exceptional presence' }),
    ).toBeNull()
  })

  it('requires a child before saving', async () => {
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
    expect(m.create).not.toHaveBeenCalled()
  })

  it('requires a date before saving', async () => {
    const user = userEvent.setup()
    render()
    await user.click(
      await screen.findByRole('button', {
        name: 'Add an exceptional presence',
      }),
    )
    await user.selectOptions(screen.getByLabelText('Child'), 'C1')
    await user.click(
      screen.getByRole('button', { name: 'Save the exceptional presence' }),
    )
    expect(await screen.findByText('Give a date.')).toBeInTheDocument()
    expect(m.create).not.toHaveBeenCalled()
  })

  it('requires start and end times before saving', async () => {
    const user = userEvent.setup()
    render()
    await user.click(
      await screen.findByRole('button', {
        name: 'Add an exceptional presence',
      }),
    )
    await user.selectOptions(screen.getByLabelText('Child'), 'C1')
    await user.type(screen.getByLabelText('Date'), '07/08/2026')
    await user.click(
      screen.getByRole('button', { name: 'Save the exceptional presence' }),
    )
    expect(
      await screen.findByText('Give a start and end time.'),
    ).toBeInTheDocument()
    expect(m.create).not.toHaveBeenCalled()
  })

  it('creates a presence for the child, not the contract child', async () => {
    const user = userEvent.setup()
    render()
    await user.click(
      await screen.findByRole('button', {
        name: 'Add an exceptional presence',
      }),
    )
    await user.selectOptions(screen.getByLabelText('Child'), 'C1')
    await user.type(screen.getByLabelText('Date'), '07/08/2026')
    await user.type(screen.getByLabelText('Start time'), '9:00 AM')
    await user.type(screen.getByLabelText('End time'), '12:00 PM')
    await user.click(
      screen.getByRole('button', { name: 'Save the exceptional presence' }),
    )
    await waitFor(() =>
      expect(m.create).toHaveBeenCalledWith(
        '1',
        '10',
        expect.objectContaining({
          child: 'C1',
          date: '2026-07-08',
          start_time: '09:00',
          end_time: '12:00',
        }),
      ),
    )
  })

  it('edits an existing presence', async () => {
    m.get.mockResolvedValue([makePresence()])
    const user = userEvent.setup()
    render()
    await user.click(await screen.findByRole('button', { name: 'Edit' }))
    await user.type(screen.getByLabelText('Notes'), 'no school')
    await user.click(
      screen.getByRole('button', { name: 'Save the exceptional presence' }),
    )
    await waitFor(() =>
      expect(m.update).toHaveBeenCalledWith(
        '1',
        '10',
        'P1',
        expect.objectContaining({
          child: 'C1',
          notes: 'no school',
          start_time: '09:00',
        }),
      ),
    )
  })

  it('deletes a presence after confirmation', async () => {
    m.get.mockResolvedValue([makePresence()])
    const user = userEvent.setup()
    render()
    await user.click(await screen.findByRole('button', { name: 'Delete' }))
    const dialog = await screen.findByRole('alertdialog')
    await user.click(within(dialog).getByRole('button', { name: 'Delete' }))
    await waitFor(() => expect(m.del).toHaveBeenCalledWith('1', '10', 'P1'))
  })

  it('surfaces a server error on save', async () => {
    m.create.mockRejectedValue(new Error('boom'))
    const user = userEvent.setup()
    render()
    await user.click(
      await screen.findByRole('button', {
        name: 'Add an exceptional presence',
      }),
    )
    await user.selectOptions(screen.getByLabelText('Child'), 'C1')
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
