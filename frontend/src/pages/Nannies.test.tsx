import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  acceptContractInvitation,
  type Contract,
  type ContractSchedule,
  type ContractTerms,
  createContract,
  createContractInvitation,
  createContractSchedule,
  createContractTerms,
  declineContractInvitation,
  deleteContract,
  deleteContractSchedule,
  deleteContractTerms,
  getContractInvitations,
  getContractSchedules,
  getContracts,
  getContractTerms,
  getMinimumWage,
  getMyContractInvitations,
  revokeContractInvitation,
  updateContractSchedule,
  updateContractTerms,
} from '../api/contracts'
import { getFamilies } from '../api/family'
import { renderWithProviders } from '../test/utils'
import Nannies, { duplicateDayBlocks } from './Nannies'

vi.mock('../api/family', () => ({ getFamilies: vi.fn() }))
vi.mock('../api/contracts', () => ({
  getContracts: vi.fn(),
  createContract: vi.fn(),
  updateContract: vi.fn(),
  deleteContract: vi.fn(),
  getContractTerms: vi.fn(),
  createContractTerms: vi.fn(),
  updateContractTerms: vi.fn(),
  deleteContractTerms: vi.fn(),
  getContractSchedules: vi.fn(),
  createContractSchedule: vi.fn(),
  updateContractSchedule: vi.fn(),
  deleteContractSchedule: vi.fn(),
  getContractInvitations: vi.fn(),
  createContractInvitation: vi.fn(),
  revokeContractInvitation: vi.fn(),
  getMyContractInvitations: vi.fn(),
  acceptContractInvitation: vi.fn(),
  declineContractInvitation: vi.fn(),
  getMinimumWage: vi.fn(),
}))

const m = {
  families: vi.mocked(getFamilies),
  contracts: vi.mocked(getContracts),
  createContract: vi.mocked(createContract),
  deleteContract: vi.mocked(deleteContract),
  terms: vi.mocked(getContractTerms),
  createTerms: vi.mocked(createContractTerms),
  updateTerms: vi.mocked(updateContractTerms),
  deleteTerms: vi.mocked(deleteContractTerms),
  schedules: vi.mocked(getContractSchedules),
  createSchedule: vi.mocked(createContractSchedule),
  updateSchedule: vi.mocked(updateContractSchedule),
  deleteSchedule: vi.mocked(deleteContractSchedule),
  invitations: vi.mocked(getContractInvitations),
  createInvitation: vi.mocked(createContractInvitation),
  revoke: vi.mocked(revokeContractInvitation),
  myInvitations: vi.mocked(getMyContractInvitations),
  acceptMyInvitation: vi.mocked(acceptContractInvitation),
  declineMyInvitation: vi.mocked(declineContractInvitation),
  minimum: vi.mocked(getMinimumWage),
}

const family = {
  id: 1,
  name: 'Home',
  role: 'owner' as const,
  is_claimed: true,
  created_at: '',
}

function makeTerms(o: Partial<ContractTerms> = {}): ContractTerms {
  return {
    id: 1,
    effective_from: '2026-01-05',
    effective_to: null,
    net_hourly_rate: '12.00',
    transport_fee: '0.00',
    mileage_rate: '0.000',
    benefits_in_kind: '0.00',
    minimum_net_hourly_rate: '10.07',
    below_minimum: false,
    warnings: [],
    edited: false,
    ...o,
  }
}
function makeSchedule(o: Partial<ContractSchedule> = {}): ContractSchedule {
  return {
    id: 1,
    effective_from: '2026-01-05',
    effective_to: null,
    weekly_hours: 8,
    edited: false,
    blocks: [],
    ...o,
  }
}
function makeContract(o: Partial<Contract> = {}): Contract {
  return {
    id: 10,
    nanny: { id: 5, first_name: 'Marie', last_name: 'Dupont' },
    starting_date: '2026-01-05',
    ending_date: null,
    paid_leave_days: 25,
    notes: '',
    families: [{ id: 1, name: 'Home', is_originator: true }],
    current_terms: null,
    current_schedule: null,
    ...o,
  }
}

beforeEach(() => {
  m.families.mockResolvedValue([family])
  m.contracts.mockResolvedValue([])
  m.terms.mockResolvedValue([])
  m.schedules.mockResolvedValue([])
  m.invitations.mockResolvedValue([])
  m.myInvitations.mockResolvedValue([])
  m.minimum.mockResolvedValue({ net_hourly_rate: '10.07' })
})
afterEach(() => vi.clearAllMocks())

describe('duplicateDayBlocks', () => {
  it('copies a day onto target days, replacing them', () => {
    const blocks = [
      { weekday: 0, start_time: '09:00', end_time: '12:00' },
      { weekday: 2, start_time: '08:00', end_time: '10:00' },
    ]
    const result = duplicateDayBlocks(blocks, 0, [1, 2])
    expect(result).toContainEqual({
      weekday: 1,
      start_time: '09:00',
      end_time: '12:00',
    })
    expect(result).toContainEqual({
      weekday: 2,
      start_time: '09:00',
      end_time: '12:00',
    })
    // The original Wednesday block was replaced.
    expect(result.filter((b) => b.weekday === 2)).toHaveLength(1)
  })
})

describe('Nannies page', () => {
  it('prompts to create a family when there are none', async () => {
    m.families.mockResolvedValue([])
    renderWithProviders(<Nannies />)
    expect(
      await screen.findByText('Create a family first, then add a nanny.'),
    ).toBeInTheDocument()
  })

  it('shows the empty state, selector, and add button', async () => {
    renderWithProviders(<Nannies />)
    expect(
      await screen.findByText('No nannies yet. Add your first one below.'),
    ).toBeInTheDocument()
    expect(screen.getByLabelText('Acting as family')).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Add a nanny' }),
    ).toBeInTheDocument()
  })

  it('surfaces a load error', async () => {
    m.contracts.mockRejectedValue(new Error('nope'))
    renderWithProviders(<Nannies />)
    expect(
      await screen.findByText('Could not load contracts.'),
    ).toBeInTheDocument()
  })

  it('lists a contract with its paid-leave days', async () => {
    m.contracts.mockResolvedValue([makeContract()])
    renderWithProviders(<Nannies />)
    expect(await screen.findByText('Marie Dupont')).toBeInTheDocument()
    expect(screen.getByText(/25 days off\/year/)).toBeInTheDocument()
  })

  it('changes the acting family', async () => {
    const user = userEvent.setup()
    m.families.mockResolvedValue([
      family,
      {
        id: 2,
        name: 'Grandma',
        role: 'owner' as const,
        is_claimed: true,
        created_at: '',
      },
    ])
    renderWithProviders(<Nannies />)
    await screen.findByText('No nannies yet. Add your first one below.')
    await user.selectOptions(screen.getByLabelText('Acting as family'), '2')
    await waitFor(() => expect(m.contracts).toHaveBeenCalledWith(2))
  })

  it('deletes a contract after confirmation', async () => {
    const user = userEvent.setup()
    m.contracts.mockResolvedValue([makeContract()])
    m.deleteContract.mockResolvedValue()
    renderWithProviders(<Nannies />)
    await screen.findByText('Marie Dupont')
    await user.click(screen.getByRole('button', { name: 'Delete' }))
    const dialog = await screen.findByRole('alertdialog')
    await user.click(within(dialog).getByRole('button', { name: 'Delete' }))
    await waitFor(() => expect(m.deleteContract).toHaveBeenCalledWith(1, 10))
  })

  it('accepts a shared-contract invitation with the acting family', async () => {
    const user = userEvent.setup()
    m.myInvitations.mockResolvedValue([
      {
        id: 7,
        nanny_first_name: 'Alice',
        nanny_last_name: 'Martin',
        token: 'inv-tok',
        expires_at: '2026-01-08T00:00:00Z',
      },
    ])
    m.acceptMyInvitation.mockResolvedValue(makeContract())
    renderWithProviders(<Nannies />)

    expect(
      await screen.findByText('Contracts shared with you'),
    ).toBeInTheDocument()
    expect(screen.getByText('Alice Martin')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Accept invitation' }))
    await waitFor(() =>
      expect(m.acceptMyInvitation).toHaveBeenCalledWith('inv-tok', 1),
    )
  })

  it('declines a shared-contract invitation', async () => {
    const user = userEvent.setup()
    m.myInvitations.mockResolvedValue([
      {
        id: 7,
        nanny_first_name: 'Alice',
        nanny_last_name: 'Martin',
        token: 'inv-tok',
        expires_at: '2026-01-08T00:00:00Z',
      },
    ])
    m.declineMyInvitation.mockResolvedValue()
    renderWithProviders(<Nannies />)
    await screen.findByText('Contracts shared with you')
    await user.click(screen.getByRole('button', { name: 'Decline' }))
    await waitFor(() =>
      expect(m.declineMyInvitation).toHaveBeenCalledWith('inv-tok'),
    )
  })
})

describe('onboarding wizard', () => {
  async function openWizard(user: ReturnType<typeof userEvent.setup>) {
    renderWithProviders(<Nannies />)
    await screen.findByText('No nannies yet. Add your first one below.')
    await user.click(screen.getByRole('button', { name: 'Add a nanny' }))
    await screen.findByText('Step 1 of 5')
  }

  it('creates a contract end-to-end with a new nanny', async () => {
    const user = userEvent.setup()
    m.createContract.mockResolvedValue(makeContract())
    m.createTerms.mockResolvedValue(makeTerms())
    m.createSchedule.mockResolvedValue(makeSchedule())
    m.createInvitation.mockResolvedValue({
      id: 1,
      email: 'x@y.z',
      status: 'pending',
      token: 't',
      created_at: '',
      expires_at: '',
    })
    await openWizard(user)

    await user.type(screen.getByLabelText('First name'), 'Paul')
    await user.type(screen.getByLabelText('Last name'), 'Martin')
    await user.type(screen.getByLabelText('Starting date'), '02/03/2026')
    await user.click(screen.getByRole('button', { name: 'Next' })) // → compensation
    await user.type(screen.getByLabelText('Net hourly rate (€)'), '12.00')
    await user.click(screen.getByRole('button', { name: 'Next' })) // → hours
    await user.click(screen.getByRole('button', { name: 'Add a time block' }))
    await user.click(screen.getByRole('button', { name: 'Next' })) // → days off
    await user.type(screen.getByLabelText('Paid-leave days per year'), '25')
    await user.click(screen.getByRole('button', { name: 'Next' })) // → share
    await user.type(
      screen.getByLabelText(/Invite another family/),
      'friend@example.com',
    )
    await user.click(screen.getByRole('button', { name: 'Create contract' }))

    await waitFor(() =>
      expect(m.createContract).toHaveBeenCalledWith(1, {
        starting_date: '2026-02-03',
        paid_leave_days: 25,
        first_name: 'Paul',
        last_name: 'Martin',
      }),
    )
    expect(m.createTerms).toHaveBeenCalled()
    expect(m.createSchedule).toHaveBeenCalled()
    expect(m.createInvitation).toHaveBeenCalledWith(1, 10, 'friend@example.com')
  })

  it('validates the first step', async () => {
    const user = userEvent.setup()
    await openWizard(user)
    await user.click(screen.getByRole('button', { name: 'Next' }))
    expect(
      await screen.findByText('Enter the nanny and a starting date.'),
    ).toBeInTheDocument()
    expect(m.createContract).not.toHaveBeenCalled()
  })

  it('navigates back a step', async () => {
    const user = userEvent.setup()
    await openWizard(user)
    await user.type(screen.getByLabelText('First name'), 'Paul')
    await user.type(screen.getByLabelText('Last name'), 'Martin')
    await user.type(screen.getByLabelText('Starting date'), '02/03/2026')
    await user.click(screen.getByRole('button', { name: 'Next' }))
    expect(await screen.findByText('Step 2 of 5')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Back' }))
    expect(await screen.findByText('Step 1 of 5')).toBeInTheDocument()
  })

  it('reuses an existing nanny', async () => {
    const user = userEvent.setup()
    m.contracts.mockResolvedValue([makeContract()])
    m.createContract.mockResolvedValue(makeContract({ id: 11 }))
    renderWithProviders(<Nannies />)
    await screen.findByText('Marie Dupont')
    await user.click(screen.getByRole('button', { name: 'Add a nanny' }))
    await screen.findByText('Step 1 of 5')

    await user.click(screen.getByRole('checkbox', { name: /Use a nanny/ }))
    await user.selectOptions(screen.getByLabelText('Choose a nanny'), '5')
    await user.type(screen.getByLabelText('Starting date'), '02/03/2026')
    for (let i = 0; i < 4; i++)
      await user.click(screen.getByRole('button', { name: 'Next' }))
    await user.click(screen.getByRole('button', { name: 'Create contract' }))

    await waitFor(() =>
      expect(m.createContract).toHaveBeenCalledWith(1, {
        starting_date: '2026-02-03',
        paid_leave_days: undefined,
        nanny_id: 5,
      }),
    )
  })
})

describe('manage panels', () => {
  async function openManage(
    user: ReturnType<typeof userEvent.setup>,
    contract: Contract,
  ) {
    m.contracts.mockResolvedValue([contract])
    renderWithProviders(<Nannies />)
    await screen.findByText('Marie Dupont')
    await user.click(screen.getByRole('button', { name: 'Manage' }))
    await screen.findByText('Compensation')
  }

  it('shows the current terms with edited badge and below-minimum warning', async () => {
    const user = userEvent.setup()
    await openManage(
      user,
      makeContract({
        current_terms: makeTerms({
          net_hourly_rate: '9.00',
          below_minimum: true,
          warnings: ['Too low.'],
          edited: true,
        }),
      }),
    )
    expect(screen.getByText('Too low.')).toBeInTheDocument()
    expect(screen.getByText(/edited/)).toBeInTheDocument()
  })

  it('adds compensation through the consequence dialog', async () => {
    const user = userEvent.setup()
    m.createTerms.mockResolvedValue(makeTerms())
    await openManage(user, makeContract())

    await user.click(
      screen.getByRole('button', { name: 'Add / change compensation' }),
    )
    await user.type(screen.getByLabelText('Net hourly rate (€)'), '12.50')
    await user.click(screen.getByRole('button', { name: 'Review & save' }))
    // Consequence dialog
    expect(await screen.findByText('Confirm the change')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Confirm' }))

    await waitFor(() =>
      expect(m.createTerms).toHaveBeenCalledWith(1, 10, {
        effective_from: undefined,
        net_hourly_rate: '12.50',
        transport_fee: undefined,
        mileage_rate: undefined,
        benefits_in_kind: undefined,
      }),
    )
  })

  it('requires a rate before compensation review', async () => {
    const user = userEvent.setup()
    await openManage(user, makeContract())
    await user.click(
      screen.getByRole('button', { name: 'Add / change compensation' }),
    )
    await user.click(screen.getByRole('button', { name: 'Review & save' }))
    expect(
      await screen.findByText('Enter a net hourly rate.'),
    ).toBeInTheDocument()
  })

  it('edits a compensation history entry in place', async () => {
    const user = userEvent.setup()
    m.terms.mockResolvedValue([makeTerms({ id: 3, net_hourly_rate: '11.00' })])
    m.updateTerms.mockResolvedValue(makeTerms({ id: 3, edited: true }))
    await openManage(user, makeContract())

    const row = (await screen.findByText(/11.00 €\/h/)).closest(
      'li',
    ) as HTMLElement
    await user.click(within(row).getByRole('button', { name: 'Edit' }))
    const rate = screen.getByLabelText('Net hourly rate (€)')
    await user.clear(rate)
    await user.type(rate, '13.00')
    await user.click(screen.getByRole('button', { name: 'Review & save' }))
    await user.click(await screen.findByRole('button', { name: 'Confirm' }))

    await waitFor(() =>
      expect(m.updateTerms).toHaveBeenCalledWith(
        1,
        10,
        3,
        expect.objectContaining({
          net_hourly_rate: '13.00',
        }),
      ),
    )
  })

  it('deletes a compensation history entry', async () => {
    const user = userEvent.setup()
    m.terms.mockResolvedValue([makeTerms({ id: 3 })])
    m.deleteTerms.mockResolvedValue()
    await openManage(user, makeContract())

    const row = (await screen.findByText(/12.00 €\/h/)).closest(
      'li',
    ) as HTMLElement
    await user.click(within(row).getByRole('button', { name: 'Delete' }))
    const dialog = await screen.findByRole('alertdialog')
    await user.click(within(dialog).getByRole('button', { name: 'Delete' }))
    await waitFor(() => expect(m.deleteTerms).toHaveBeenCalledWith(1, 10, 3))
  })

  it('adds a schedule with a time block and copy-day control', async () => {
    const user = userEvent.setup()
    m.createSchedule.mockResolvedValue(makeSchedule())
    await openManage(user, makeContract())

    await user.click(
      screen.getByRole('button', { name: 'Add / change schedule' }),
    )
    await user.click(screen.getByRole('button', { name: 'Add a time block' }))
    // Each block row exposes a per-day copy action.
    expect(screen.getByRole('button', { name: 'Copy day' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Review & save' }))
    await user.click(await screen.findByRole('button', { name: 'Confirm' }))
    await waitFor(() => expect(m.createSchedule).toHaveBeenCalled())
  })

  it('rejects an empty schedule', async () => {
    const user = userEvent.setup()
    await openManage(user, makeContract())
    await user.click(
      screen.getByRole('button', { name: 'Add / change schedule' }),
    )
    await user.click(screen.getByRole('button', { name: 'Review & save' }))
    expect(
      await screen.findByText('Add at least one time block.'),
    ).toBeInTheDocument()
  })

  it('warns when the new rate is below the minimum, and surfaces save errors', async () => {
    const user = userEvent.setup()
    m.createTerms.mockRejectedValue(new Error('bad'))
    await openManage(user, makeContract({ current_terms: makeTerms() }))

    await user.click(
      screen.getByRole('button', { name: 'Add / change compensation' }),
    )
    await user.type(screen.getByLabelText('Net hourly rate (€)'), '9.00')
    await user.click(screen.getByRole('button', { name: 'Review & save' }))
    expect(
      await screen.findByText(
        'This net hourly rate is below the recommended minimum.',
      ),
    ).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Confirm' }))
    expect(
      await screen.findByText('Something went wrong. Please try again.'),
    ).toBeInTheDocument()
  })

  it('warns on blur when the rate is below the minimum for the date (comma ok)', async () => {
    const user = userEvent.setup()
    await openManage(user, makeContract())
    await user.click(
      screen.getByRole('button', { name: 'Add / change compensation' }),
    )
    // A comma separator is accepted and normalised to a dot.
    await user.type(screen.getByLabelText('Net hourly rate (€)'), '9,00')
    await user.tab()
    expect(
      await screen.findByText(/Below the recommended minimum for this date/),
    ).toBeInTheDocument()
  })

  it('does not warn when the rate meets the minimum for an earlier date', async () => {
    const user = userEvent.setup()
    m.minimum.mockImplementation((on?: string) =>
      Promise.resolve({
        net_hourly_rate: on === '2025-12-01' ? '9.75' : '10.07',
      }),
    )
    await openManage(user, makeContract())
    await user.click(
      screen.getByRole('button', { name: 'Add / change compensation' }),
    )
    await user.type(
      screen.getByLabelText('Effective from (optional, defaults to today)'),
      '12/01/2025',
    )
    await user.type(screen.getByLabelText('Net hourly rate (€)'), '10.00')
    await user.tab()
    await waitFor(() => expect(m.minimum).toHaveBeenCalledWith('2025-12-01'))
    expect(
      screen.queryByText(/Below the recommended minimum for this date/),
    ).toBeNull()
  })

  it('shows the current schedule and edits a history entry in place', async () => {
    const user = userEvent.setup()
    m.schedules.mockResolvedValue([
      makeSchedule({
        id: 3,
        weekly_hours: 3,
        edited: true,
        blocks: [
          { id: 1, weekday: 0, start_time: '09:00:00', end_time: '12:00:00' },
        ],
      }),
    ])
    m.updateSchedule.mockResolvedValue(makeSchedule({ id: 3 }))
    await openManage(
      user,
      makeContract({
        current_schedule: makeSchedule({
          id: 3,
          weekly_hours: 3,
          edited: true,
        }),
      }),
    )

    await user.click(screen.getByRole('button', { name: 'Edit' }))
    await user.click(screen.getByRole('button', { name: 'Review & save' }))
    await user.click(await screen.findByRole('button', { name: 'Confirm' }))
    await waitFor(() =>
      expect(m.updateSchedule).toHaveBeenCalledWith(
        1,
        10,
        3,
        expect.anything(),
      ),
    )
  })

  it('deletes a schedule entry', async () => {
    const user = userEvent.setup()
    m.schedules.mockResolvedValue([makeSchedule({ id: 3, weekly_hours: 5 })])
    m.deleteSchedule.mockResolvedValue()
    await openManage(user, makeContract())

    const row = (await screen.findByText(/5 h\/week/)).closest(
      'li',
    ) as HTMLElement
    await user.click(within(row).getByRole('button', { name: 'Delete' }))
    const dialog = await screen.findByRole('alertdialog')
    await user.click(within(dialog).getByRole('button', { name: 'Delete' }))
    await waitFor(() => expect(m.deleteSchedule).toHaveBeenCalledWith(1, 10, 3))
  })

  it('duplicates a day onto another via the copy dialog', async () => {
    const user = userEvent.setup()
    await openManage(user, makeContract())
    await user.click(
      screen.getByRole('button', { name: 'Add / change schedule' }),
    )
    await user.click(screen.getByRole('button', { name: 'Add a time block' }))
    await user.click(screen.getByRole('button', { name: 'Copy day' }))
    const dialog = await screen.findByRole('dialog')
    await user.click(within(dialog).getByRole('checkbox', { name: 'Tuesday' }))
    await user.click(within(dialog).getByRole('button', { name: 'Apply' }))
    expect(screen.getAllByLabelText('Day')).toHaveLength(2)
  })

  it('invites and revokes a sharing family', async () => {
    const user = userEvent.setup()
    m.invitations.mockResolvedValue([
      {
        id: 7,
        email: 'friend@example.com',
        status: 'pending',
        token: 't',
        created_at: '',
        expires_at: '',
      },
    ])
    m.createInvitation.mockResolvedValue({
      id: 8,
      email: 'new@example.com',
      status: 'pending',
      token: 't',
      created_at: '',
      expires_at: '',
    })
    await openManage(user, makeContract())

    expect(screen.getByText('friend@example.com')).toBeInTheDocument()
    await user.type(screen.getByLabelText('Email to invite'), 'new@example.com')
    await user.click(screen.getByRole('button', { name: 'Send invitation' }))
    await waitFor(() =>
      expect(m.createInvitation).toHaveBeenCalledWith(1, 10, 'new@example.com'),
    )
  })
})
