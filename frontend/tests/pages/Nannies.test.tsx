import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { HttpResponse, http } from 'msw'
import { beforeEach, describe, expect, it } from 'vitest'
import type {
  ChildRead,
  ContractChildRead,
  ContractInvitationRead,
  ContractRead,
  ContractScheduleRead,
  ContractTermsRead,
  FamilyRead,
  MyContractInvitationRead,
} from '@/src/api'
import Nannies from '@/src/pages/Nannies'
import { server } from '@/tests/msw/server'
import { renderWithProviders, selectOption } from '@/tests/utils'

const family: FamilyRead = {
  id: '1',
  name: 'Home',
  role: 'owner',
  is_claimed: true,
  created_at: '',
}

function makeTerms(o: Partial<ContractTermsRead> = {}): ContractTermsRead {
  return {
    id: '1',
    effective_from: '2026-01-05',
    effective_to: null,
    net_hourly_rate: '12.00',
    night_presence_rate: '0.00',
    transport_fee: '0.00',
    mileage_rate: '0.000',
    benefits_in_kind: '0.00',
    minimum_net_hourly_rate: '10.07',
    below_minimum: false,
    warnings: [],
    edited: false,
    created_by_name: null,
    ...o,
  }
}
function makeSchedule(
  o: Partial<ContractScheduleRead> = {},
): ContractScheduleRead {
  return {
    id: '1',
    effective_from: '2026-01-05',
    effective_to: null,
    weekly_hours: 8,
    edited: false,
    created_by_name: null,
    blocks: [],
    ...o,
  } as ContractScheduleRead
}
function makeContract(o: Partial<ContractRead> = {}): ContractRead {
  return {
    id: '10',
    nanny: { id: '5', first_name: 'Marie', last_name: 'Dupont' },
    starting_date: '2026-01-05',
    ending_date: null,
    split_method: 'equal',
    paid_leave_days: 25,
    notes: '',
    families: [{ id: '1', name: 'Home', is_originator: true }],
    current_terms: null,
    current_schedule: null,
    ...o,
  }
}

// Endpoint paths. `*` matches any origin; path params serve any family/contract.
const FAMILIES = '*/api/families/'
const FAM_CHILDREN = '*/api/families/:familyPk/children/'
const CONTRACTS = '*/api/families/:familyPk/contracts/'
const CONTRACT = '*/api/families/:familyPk/contracts/:id/'
const ATTACH = '*/api/families/:familyPk/contracts/:id/attach-family/'
const TERMS = '*/api/families/:familyPk/contracts/:contractPk/terms/'
const TERM = '*/api/families/:familyPk/contracts/:contractPk/terms/:id/'
const SCHEDULES = '*/api/families/:familyPk/contracts/:contractPk/schedule/'
const SCHEDULE = '*/api/families/:familyPk/contracts/:contractPk/schedule/:id/'
const CCHILDREN = '*/api/families/:familyPk/contracts/:contractPk/children/'
const CCHILD = '*/api/families/:familyPk/contracts/:contractPk/children/:id/'
const CINVITES = '*/api/families/:familyPk/contracts/:contractPk/invitations/'
const CINVITE =
  '*/api/families/:familyPk/contracts/:contractPk/invitations/:id/'
const MY_CINVITES = '*/api/contract-invitations/'
const ACCEPT = '*/api/contract-invitations/:token/accept/'
const DECLINE = '*/api/contract-invitations/:token/decline/'
const MINWAGE = '*/api/minimum-wage/'
const PAIDLEAVE = '*/api/paid-leave-default/'

type Body = Record<string, unknown>

interface Calls {
  contractsFamilies: string[]
  minWageOns: (string | null)[]
  createContract?: { familyPk: string; body: Body }
  deletedContract?: { familyPk: string; id: string }
  createdTerms?: { familyPk: string; contractPk: string; body: Body }
  updatedTerms?: {
    familyPk: string
    contractPk: string
    id: string
    body: Body
  }
  deletedTerms?: { familyPk: string; contractPk: string; id: string }
  createdSchedule?: { familyPk: string; contractPk: string; body: Body }
  updatedSchedule?: {
    familyPk: string
    contractPk: string
    id: string
    body: Body
  }
  deletedSchedule?: { familyPk: string; contractPk: string; id: string }
  createdContractChildren: {
    familyPk: string
    contractPk: string
    body: Body
  }[]
  createdInvitation?: { familyPk: string; contractPk: string; body: Body }
  revokedInvitation?: { familyPk: string; contractPk: string; id: string }
  attached?: { familyPk: string; id: string; body: Body }
  acceptedContract?: { token: string; body: Body }
  declinedContract?: { token: string }
}

// Register every endpoint the page can fire, returning the given data and
// recording mutation bodies/params for assertions. The MSW stand-in for the old
// `expect(mockFn).toHaveBeenCalledWith(...)` checks.
function setup(
  opts: {
    families?: FamilyRead[]
    contracts?: ContractRead[]
    createdContract?: ContractRead
    terms?: ContractTermsRead[]
    schedules?: ContractScheduleRead[]
    contractChildren?: ContractChildRead[]
    invitations?: ContractInvitationRead[]
    myInvitations?: MyContractInvitationRead[]
    children?: ChildRead[]
    childrenByFamily?: Record<string, ChildRead[]>
    minimumWage?: (on: string | null) => string | null
    paidLeaveDefault?: number | null
  } = {},
): Calls {
  const {
    families = [family],
    contracts = [],
    createdContract = makeContract(),
    terms = [],
    schedules = [],
    contractChildren = [],
    invitations = [],
    myInvitations = [],
    children = [],
    childrenByFamily,
    minimumWage = () => '10.07',
    paidLeaveDefault = 30,
  } = opts
  const calls: Calls = {
    contractsFamilies: [],
    minWageOns: [],
    createdContractChildren: [],
  }
  server.use(
    // Queries
    http.get(FAMILIES, () => HttpResponse.json(families)),
    http.get(FAM_CHILDREN, ({ params }) =>
      HttpResponse.json(
        childrenByFamily?.[params.familyPk as string] ?? children,
      ),
    ),
    http.get(CONTRACTS, ({ params }) => {
      calls.contractsFamilies.push(params.familyPk as string)
      return HttpResponse.json(contracts)
    }),
    http.get(TERMS, () => HttpResponse.json(terms)),
    http.get(SCHEDULES, () => HttpResponse.json(schedules)),
    http.get(CCHILDREN, () => HttpResponse.json(contractChildren)),
    http.get(CINVITES, () => HttpResponse.json(invitations)),
    http.get(MY_CINVITES, () => HttpResponse.json(myInvitations)),
    http.get(MINWAGE, ({ request }) => {
      const on = new URL(request.url).searchParams.get('on')
      calls.minWageOns.push(on)
      return HttpResponse.json({ net_hourly_rate: minimumWage(on) })
    }),
    http.get(PAIDLEAVE, () =>
      HttpResponse.json({ annual_days: paidLeaveDefault }),
    ),
    // Contract create/delete
    http.post(CONTRACTS, async ({ request, params }) => {
      calls.createContract = {
        familyPk: params.familyPk as string,
        body: (await request.json()) as Body,
      }
      return HttpResponse.json(createdContract, { status: 201 })
    }),
    http.delete(CONTRACT, ({ params }) => {
      calls.deletedContract = {
        familyPk: params.familyPk as string,
        id: params.id as string,
      }
      return new HttpResponse(null, { status: 204 })
    }),
    http.patch(CONTRACT, async ({ request, params }) =>
      HttpResponse.json({
        ...createdContract,
        id: params.id as string,
        ...((await request.json()) as Body),
      }),
    ),
    http.post(ATTACH, async ({ request, params }) => {
      calls.attached = {
        familyPk: params.familyPk as string,
        id: params.id as string,
        body: (await request.json()) as Body,
      }
      return HttpResponse.json(createdContract)
    }),
    // Terms
    http.post(TERMS, async ({ request, params }) => {
      calls.createdTerms = {
        familyPk: params.familyPk as string,
        contractPk: params.contractPk as string,
        body: (await request.json()) as Body,
      }
      return HttpResponse.json(makeTerms(), { status: 201 })
    }),
    http.patch(TERM, async ({ request, params }) => {
      calls.updatedTerms = {
        familyPk: params.familyPk as string,
        contractPk: params.contractPk as string,
        id: params.id as string,
        body: (await request.json()) as Body,
      }
      return HttpResponse.json(makeTerms({ id: params.id as string }))
    }),
    http.delete(TERM, ({ params }) => {
      calls.deletedTerms = {
        familyPk: params.familyPk as string,
        contractPk: params.contractPk as string,
        id: params.id as string,
      }
      return new HttpResponse(null, { status: 204 })
    }),
    // Schedule
    http.post(SCHEDULES, async ({ request, params }) => {
      calls.createdSchedule = {
        familyPk: params.familyPk as string,
        contractPk: params.contractPk as string,
        body: (await request.json()) as Body,
      }
      return HttpResponse.json(makeSchedule(), { status: 201 })
    }),
    http.patch(SCHEDULE, async ({ request, params }) => {
      calls.updatedSchedule = {
        familyPk: params.familyPk as string,
        contractPk: params.contractPk as string,
        id: params.id as string,
        body: (await request.json()) as Body,
      }
      return HttpResponse.json(makeSchedule({ id: params.id as string }))
    }),
    http.delete(SCHEDULE, ({ params }) => {
      calls.deletedSchedule = {
        familyPk: params.familyPk as string,
        contractPk: params.contractPk as string,
        id: params.id as string,
      }
      return new HttpResponse(null, { status: 204 })
    }),
    // Contract children
    http.post(CCHILDREN, async ({ request, params }) => {
      calls.createdContractChildren.push({
        familyPk: params.familyPk as string,
        contractPk: params.contractPk as string,
        body: (await request.json()) as Body,
      })
      return HttpResponse.json(
        {
          id: 'x',
          child: 'c1',
          first_name: 'Zoe',
          family_id: params.familyPk as string,
          windows: [],
        },
        { status: 201 },
      )
    }),
    http.patch(CCHILD, async ({ request, params }) =>
      HttpResponse.json({
        id: params.id as string,
        child: 'c1',
        first_name: 'Zoe',
        family_id: params.familyPk as string,
        windows: [],
        ...((await request.json()) as Body),
      }),
    ),
    http.delete(CCHILD, () => new HttpResponse(null, { status: 204 })),
    // Contract invitations
    http.post(CINVITES, async ({ request, params }) => {
      calls.createdInvitation = {
        familyPk: params.familyPk as string,
        contractPk: params.contractPk as string,
        body: (await request.json()) as Body,
      }
      return HttpResponse.json(
        {
          id: '8',
          email: 'new@example.com',
          status: 'pending',
          token: 't',
          created_at: '',
          expires_at: '',
        },
        { status: 201 },
      )
    }),
    http.delete(CINVITE, ({ params }) => {
      calls.revokedInvitation = {
        familyPk: params.familyPk as string,
        contractPk: params.contractPk as string,
        id: params.id as string,
      }
      return new HttpResponse(null, { status: 204 })
    }),
    // My contract invitations accept/decline
    http.post(ACCEPT, async ({ request, params }) => {
      calls.acceptedContract = {
        token: params.token as string,
        body: (await request.json()) as Body,
      }
      return HttpResponse.json(createdContract)
    }),
    http.post(DECLINE, ({ params }) => {
      calls.declinedContract = { token: params.token as string }
      return new HttpResponse(null, { status: 204 })
    }),
  )
  return calls
}

beforeEach(() => {
  // A baseline set of handlers so every render has what it fires answered; most
  // tests then call setup(...) again with the data they need (the later
  // server.use wins).
  setup()
})

describe('Nannies page', () => {
  it('prompts to create a family when there are none', async () => {
    setup({ families: [] })
    renderWithProviders(<Nannies />)
    expect(
      await screen.findByText('Create a family first, then add a nanny.'),
    ).toBeInTheDocument()
  })

  it('shows the empty state, selector, and add button', async () => {
    setup()
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
    setup()
    server.use(
      http.get(CONTRACTS, () => new HttpResponse(null, { status: 500 })),
    )
    renderWithProviders(<Nannies />)
    expect(
      await screen.findByText('Could not load contracts.'),
    ).toBeInTheDocument()
  })

  it('lists a contract with its paid-leave days', async () => {
    setup({ contracts: [makeContract()] })
    renderWithProviders(<Nannies />)
    expect(await screen.findByText('Marie Dupont')).toBeInTheDocument()
    expect(screen.getByText(/25 days off\/year/)).toBeInTheDocument()
  })

  it('changes the acting family', async () => {
    const user = userEvent.setup()
    const calls = setup({
      families: [
        family,
        {
          id: '2',
          name: 'Grandma',
          role: 'owner',
          is_claimed: true,
          created_at: '',
        },
      ],
    })
    renderWithProviders(<Nannies />)
    await screen.findByText('No nannies yet. Add your first one below.')
    await selectOption('Acting as family', 'Grandma', user)
    await waitFor(() => expect(calls.contractsFamilies).toContain('2'))
  })

  it('deletes a contract only after typing the confirm phrase', async () => {
    const user = userEvent.setup()
    const calls = setup({ contracts: [makeContract()] })
    renderWithProviders(<Nannies />)
    await screen.findByText('Marie Dupont')
    await user.click(screen.getByRole('button', { name: 'Delete' }))
    const dialog = await screen.findByRole('alertdialog')
    // The confirm button stays disabled until the exact phrase is typed.
    const confirm = within(dialog).getByRole('button', { name: 'Delete' })
    await user.click(confirm)
    expect(calls.deletedContract).toBeUndefined()
    await user.type(
      within(dialog).getByLabelText(/To confirm, type/),
      'delete Marie Dupont',
    )
    await user.click(confirm)
    await waitFor(() =>
      expect(calls.deletedContract).toEqual({ familyPk: '1', id: '10' }),
    )
  })

  it('accepts a shared-contract invitation with the acting family', async () => {
    const user = userEvent.setup()
    const calls = setup({
      myInvitations: [
        {
          id: '7',
          nanny_first_name: 'Alice',
          nanny_last_name: 'Martin',
          token: 'inv-tok',
          expires_at: '2026-01-08T00:00:00Z',
        },
      ],
    })
    renderWithProviders(<Nannies />)

    expect(
      await screen.findByText('Contracts shared with you'),
    ).toBeInTheDocument()
    expect(screen.getByText('Alice Martin')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Accept invitation' }))
    await waitFor(() =>
      expect(calls.acceptedContract).toEqual({
        token: 'inv-tok',
        body: { family_id: '1' },
      }),
    )
  })

  it('declines a shared-contract invitation', async () => {
    const user = userEvent.setup()
    const calls = setup({
      myInvitations: [
        {
          id: '7',
          nanny_first_name: 'Alice',
          nanny_last_name: 'Martin',
          token: 'inv-tok',
          expires_at: '2026-01-08T00:00:00Z',
        },
      ],
    })
    renderWithProviders(<Nannies />)
    await screen.findByText('Contracts shared with you')
    await user.click(screen.getByRole('button', { name: 'Decline' }))
    await waitFor(() =>
      expect(calls.declinedContract).toEqual({ token: 'inv-tok' }),
    )
  })
})

describe('onboarding wizard', () => {
  async function openWizard(user: ReturnType<typeof userEvent.setup>) {
    renderWithProviders(<Nannies />)
    await screen.findByText('No nannies yet. Add your first one below.')
    await user.click(screen.getByRole('button', { name: 'Add a nanny' }))
    await screen.findByText('Step 1 of 6')
  }

  it('creates a contract end-to-end with a new nanny', async () => {
    const user = userEvent.setup()
    const calls = setup()
    await openWizard(user)

    await user.type(screen.getByLabelText('First name'), 'Paul')
    await user.type(screen.getByLabelText('Last name'), 'Martin')
    await user.type(screen.getByLabelText('Starting date'), '02/03/2026')
    await user.click(screen.getByRole('button', { name: 'Next' })) // → compensation
    await user.type(screen.getByLabelText('Net hourly rate (€)'), '12.00')
    await user.click(screen.getByRole('button', { name: 'Next' })) // → hours
    await user.click(screen.getByRole('button', { name: 'Add a time block' }))
    await user.click(screen.getByRole('button', { name: 'Next' })) // → children
    await user.click(screen.getByRole('button', { name: 'Next' })) // → days off
    // The field is pre-filled with the branch default; overwrite it.
    const leaveField = screen.getByLabelText('Paid-leave days per year')
    await waitFor(() => expect(leaveField).toHaveValue('30'))
    await user.clear(leaveField)
    await user.type(leaveField, '25')
    await user.click(screen.getByRole('button', { name: 'Next' })) // → share
    await user.type(
      screen.getByLabelText(/Invite another family/),
      'friend@example.com',
    )
    await user.click(screen.getByRole('button', { name: 'Create contract' }))

    await waitFor(() =>
      expect(calls.createContract).toMatchObject({
        familyPk: '1',
        body: {
          starting_date: '2026-02-03',
          paid_leave_days: 25,
          split_method: 'equal',
          first_name: 'Paul',
          last_name: 'Martin',
        },
      }),
    )
    expect(calls.createdTerms).toBeDefined()
    expect(calls.createdSchedule).toBeDefined()
    expect(calls.createdInvitation).toMatchObject({
      familyPk: '1',
      contractPk: '10',
      body: { email: 'friend@example.com' },
    })
  })

  it('validates the first step', async () => {
    const user = userEvent.setup()
    const calls = setup()
    await openWizard(user)
    await user.click(screen.getByRole('button', { name: 'Next' }))
    expect(
      await screen.findByText('Enter the nanny and a starting date.'),
    ).toBeInTheDocument()
    expect(calls.createContract).toBeUndefined()
  })

  it('navigates back a step', async () => {
    const user = userEvent.setup()
    setup()
    await openWizard(user)
    await user.type(screen.getByLabelText('First name'), 'Paul')
    await user.type(screen.getByLabelText('Last name'), 'Martin')
    await user.type(screen.getByLabelText('Starting date'), '02/03/2026')
    await user.click(screen.getByRole('button', { name: 'Next' }))
    expect(await screen.findByText('Step 2 of 6')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Back' }))
    expect(await screen.findByText('Step 1 of 6')).toBeInTheDocument()
  })

  // A contract with no children has nothing for the pay split to divide by, so
  // the wizard asks while it has the parent's attention.
  it('puts the chosen children on the contract, present whole-time', async () => {
    const user = userEvent.setup()
    const calls = setup({
      children: [
        { id: 'kid-1', first_name: 'Léa' },
        { id: 'kid-2', first_name: 'Noé' },
      ],
    })
    await openWizard(user)

    await user.type(screen.getByLabelText('First name'), 'Paul')
    await user.type(screen.getByLabelText('Last name'), 'Martin')
    await user.type(screen.getByLabelText('Starting date'), '02/03/2026')
    await user.click(screen.getByRole('button', { name: 'Next' })) // → compensation
    await user.click(screen.getByRole('button', { name: 'Next' })) // → hours
    await user.click(screen.getByRole('button', { name: 'Next' })) // → children

    await user.click(screen.getByRole('checkbox', { name: 'Léa' }))
    for (let i = 0; i < 2; i++)
      await user.click(screen.getByRole('button', { name: 'Next' }))
    await user.click(screen.getByRole('button', { name: 'Create contract' }))

    await waitFor(() =>
      expect(calls.createdContractChildren).toContainEqual({
        familyPk: '1',
        contractPk: '10',
        body: { child: 'kid-1', windows: [] },
      }),
    )
    // Only the one that was ticked.
    expect(calls.createdContractChildren).toHaveLength(1)
  })

  it('creates no children when none are ticked', async () => {
    const user = userEvent.setup()
    const calls = setup({ children: [{ id: 'kid-1', first_name: 'Léa' }] })
    await openWizard(user)

    await user.type(screen.getByLabelText('First name'), 'Paul')
    await user.type(screen.getByLabelText('Last name'), 'Martin')
    await user.type(screen.getByLabelText('Starting date'), '02/03/2026')
    for (let i = 0; i < 5; i++)
      await user.click(screen.getByRole('button', { name: 'Next' }))
    await user.click(screen.getByRole('button', { name: 'Create contract' }))

    await waitFor(() => expect(calls.createContract).toBeDefined())
    expect(calls.createdContractChildren).toHaveLength(0)
  })

  it('reuses an existing nanny', async () => {
    const user = userEvent.setup()
    const calls = setup({
      contracts: [makeContract()],
      createdContract: makeContract({ id: '11' }),
    })
    renderWithProviders(<Nannies />)
    await screen.findByText('Marie Dupont')
    await user.click(screen.getByRole('button', { name: 'Add a nanny' }))
    await screen.findByText('Step 1 of 6')

    await user.click(screen.getByRole('checkbox', { name: /Use a nanny/ }))
    await selectOption('Choose a nanny', 'Marie Dupont', user)
    await user.type(screen.getByLabelText('Starting date'), '02/03/2026')
    for (let i = 0; i < 5; i++)
      await user.click(screen.getByRole('button', { name: 'Next' }))
    await user.click(screen.getByRole('button', { name: 'Create contract' }))

    // Untouched, the paid-leave field keeps the branch default it pre-filled with.
    await waitFor(() =>
      expect(calls.createContract).toMatchObject({
        familyPk: '1',
        body: {
          starting_date: '2026-02-03',
          paid_leave_days: 30,
          split_method: 'equal',
          nanny_id: '5',
        },
      }),
    )
    expect(calls.createContract?.body).not.toHaveProperty('first_name')
  })
})

describe('manage panels', () => {
  async function openManage(
    user: ReturnType<typeof userEvent.setup>,
    contract: ContractRead,
    opts: Parameters<typeof setup>[0] = {},
  ) {
    const calls = setup({ contracts: [contract], ...opts })
    renderWithProviders(<Nannies />)
    await screen.findByText('Marie Dupont')
    await user.click(screen.getByRole('button', { name: 'Manage' }))
    await screen.findByText('Compensation')
    return calls
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

  it('shows every current compensation figure, not just the rate', async () => {
    const user = userEvent.setup()
    await openManage(
      user,
      makeContract({
        current_terms: makeTerms({
          net_hourly_rate: '12.50',
          night_presence_rate: '3.50',
          transport_fee: '40.00',
          mileage_rate: '0.300',
          benefits_in_kind: '15.00',
        }),
      }),
    )
    expect(screen.getByText('Night-presence rate (€/h)')).toBeInTheDocument()
    expect(screen.getByText('12.50 €/h')).toBeInTheDocument()
    expect(screen.getByText('3.50 €/h')).toBeInTheDocument()
    expect(screen.getByText('40.00 €')).toBeInTheDocument()
    expect(screen.getByText('0.300 €/km')).toBeInTheDocument()
    expect(screen.getByText('15.00 €')).toBeInTheDocument()
  })

  it('shows the current schedule as day-by-day time blocks', async () => {
    const user = userEvent.setup()
    await openManage(
      user,
      makeContract({
        current_schedule: makeSchedule({
          weekly_hours: 4.5,
          blocks: [
            {
              id: 'b1',
              weekday: 0,
              start_time: '08:00:00',
              end_time: '12:30:00',
            },
          ],
        }),
      }),
    )
    expect(screen.getByText('Monday')).toBeInTheDocument()
    expect(screen.getByText(/8:00 AM.+12:30 PM/)).toBeInTheDocument()
  })

  it('shows who changed compensation and a diff of what changed', async () => {
    const user = userEvent.setup()
    await openManage(user, makeContract(), {
      terms: [
        makeTerms({
          id: 'a',
          effective_from: '2026-05-01',
          net_hourly_rate: '12.50',
          created_by_name: 'Alice Dupont',
        }),
        makeTerms({
          id: 'b',
          effective_from: '2026-01-01',
          net_hourly_rate: '12.00',
          created_by_name: 'Bob Martin',
        }),
      ],
    })

    const row = (await screen.findByText(/Alice Dupont/)).closest(
      'li',
    ) as HTMLElement
    await user.click(within(row).getByRole('button', { name: 'View changes' }))

    const dialog = await screen.findByRole('dialog')
    // The net hourly rate went from 12.00 to 12.50, shown old → new.
    expect(within(dialog).getByText('12.00 €/h')).toBeInTheDocument()
    expect(within(dialog).getByText(/12.50 €\/h/)).toBeInTheDocument()
    expect(within(dialog).getByText(/Alice Dupont/)).toBeInTheDocument()
  })

  it('marks the first recorded version as having nothing to compare', async () => {
    const user = userEvent.setup()
    await openManage(user, makeContract(), {
      terms: [makeTerms({ id: 'only', net_hourly_rate: '11.00' })],
    })

    const row = (await screen.findByText(/11.00 €\/h/)).closest(
      'li',
    ) as HTMLElement
    await user.click(within(row).getByRole('button', { name: 'View changes' }))

    const dialog = await screen.findByRole('dialog')
    expect(
      within(dialog).getByText(/First recorded version/),
    ).toBeInTheDocument()
    // With nothing to compare, the value shows on its own (no →).
    expect(within(dialog).getByText('11.00 €/h')).toBeInTheDocument()
  })

  it('says so when the current schedule has no time blocks', async () => {
    const user = userEvent.setup()
    await openManage(
      user,
      makeContract({ current_schedule: makeSchedule({ blocks: [] }) }),
    )
    expect(
      screen.getByText('This schedule has no time blocks.'),
    ).toBeInTheDocument()
  })

  it('shows who changed the schedule and a day-by-day diff', async () => {
    const user = userEvent.setup()
    await openManage(user, makeContract(), {
      schedules: [
        makeSchedule({
          id: 's1',
          effective_from: '2026-06-01',
          created_by_name: 'Alice Dupont',
          blocks: [
            {
              id: 'x1',
              weekday: 0,
              start_time: '08:00:00',
              end_time: '12:00:00',
            },
          ],
        }),
        makeSchedule({
          id: 's2',
          effective_from: '2026-01-01',
          created_by_name: 'Bob Martin',
          blocks: [
            {
              id: 'x2',
              weekday: 0,
              start_time: '08:00:00',
              end_time: '17:00:00',
            },
          ],
        }),
      ],
    })

    const row = (await screen.findByText(/Alice Dupont/)).closest(
      'li',
    ) as HTMLElement
    await user.click(within(row).getByRole('button', { name: 'View changes' }))

    const dialog = await screen.findByRole('dialog')
    // Monday's end moved from 5:00 PM to 12:00 PM, shown old → new.
    expect(within(dialog).getByText('Monday')).toBeInTheDocument()
    expect(within(dialog).getByText(/8:00 AM.+5:00 PM/)).toBeInTheDocument()
    expect(within(dialog).getByText(/8:00 AM.+12:00 PM/)).toBeInTheDocument()
  })

  it('attaches a family the user manages, with its children', async () => {
    const user = userEvent.setup()
    const calls = await openManage(user, makeContract(), {
      families: [
        family,
        {
          id: '2',
          name: 'Grandma',
          role: null,
          is_claimed: false,
          created_at: '',
        },
      ],
      childrenByFamily: {
        '1': [],
        '2': [{ id: 'c1', first_name: 'Zoe' }],
      },
    })

    await user.click(screen.getByLabelText('Grandma'))
    await user.click(await screen.findByLabelText('Zoe'))
    await user.click(
      screen.getByRole('button', { name: 'Attach the selected families' }),
    )

    await waitFor(() =>
      expect(calls.attached).toEqual({
        familyPk: '1',
        id: '10',
        body: { family_id: '2' },
      }),
    )
    expect(calls.createdContractChildren).toContainEqual({
      familyPk: '2',
      contractPk: '10',
      body: { child: 'c1', windows: [] },
    })
  })

  it('adds compensation through the consequence dialog', async () => {
    const user = userEvent.setup()
    const calls = await openManage(user, makeContract())

    await user.click(
      screen.getByRole('button', { name: 'Add / change compensation' }),
    )
    await user.type(screen.getByLabelText('Net hourly rate (€)'), '12.50')
    await user.click(screen.getByRole('button', { name: 'Review & save' }))
    // Consequence dialog
    expect(await screen.findByText('Confirm the change')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Confirm' }))

    await waitFor(() =>
      expect(calls.createdTerms).toMatchObject({
        familyPk: '1',
        contractPk: '10',
        body: { net_hourly_rate: '12.50' },
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
    const calls = await openManage(user, makeContract(), {
      terms: [makeTerms({ id: '3', net_hourly_rate: '11.00' })],
    })

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
      expect(calls.updatedTerms).toMatchObject({
        familyPk: '1',
        contractPk: '10',
        id: '3',
        body: { net_hourly_rate: '13.00' },
      }),
    )
  })

  it('deletes a compensation history entry', async () => {
    const user = userEvent.setup()
    const calls = await openManage(user, makeContract(), {
      terms: [makeTerms({ id: '3' })],
    })

    const row = (await screen.findByText(/12.00 €\/h/)).closest(
      'li',
    ) as HTMLElement
    await user.click(within(row).getByRole('button', { name: 'Delete' }))
    const dialog = await screen.findByRole('alertdialog')
    await user.click(within(dialog).getByRole('button', { name: 'Delete' }))
    await waitFor(() =>
      expect(calls.deletedTerms).toEqual({
        familyPk: '1',
        contractPk: '10',
        id: '3',
      }),
    )
  })

  it('adds a schedule with a time block and copy-day control', async () => {
    const user = userEvent.setup()
    const calls = await openManage(user, makeContract())

    await user.click(
      screen.getByRole('button', { name: 'Add / change schedule' }),
    )
    await user.click(screen.getByRole('button', { name: 'Add a time block' }))
    // Each block row exposes a per-day copy action.
    expect(screen.getByRole('button', { name: 'Copy day' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Review & save' }))
    await user.click(await screen.findByRole('button', { name: 'Confirm' }))
    await waitFor(() => expect(calls.createdSchedule).toBeDefined())
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
    await openManage(user, makeContract({ current_terms: makeTerms() }))
    server.use(http.post(TERMS, () => new HttpResponse(null, { status: 500 })))

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
    const calls = await openManage(user, makeContract(), {
      minimumWage: (on) => (on === '2025-12-01' ? '9.75' : '10.07'),
    })
    await user.click(
      screen.getByRole('button', { name: 'Add / change compensation' }),
    )
    await user.type(
      screen.getByLabelText('Effective from (optional, defaults to today)'),
      '12/01/2025',
    )
    await user.type(screen.getByLabelText('Net hourly rate (€)'), '10.00')
    await user.tab()
    await waitFor(() => expect(calls.minWageOns).toContain('2025-12-01'))
    expect(
      screen.queryByText(/Below the recommended minimum for this date/),
    ).toBeNull()
  })

  it('shows the current schedule and edits a history entry in place', async () => {
    const user = userEvent.setup()
    const calls = await openManage(
      user,
      makeContract({
        current_schedule: makeSchedule({
          id: '3',
          weekly_hours: 3,
          edited: true,
        }),
      }),
      {
        schedules: [
          makeSchedule({
            id: '3',
            weekly_hours: 3,
            edited: true,
            blocks: [
              {
                id: '1',
                weekday: 0,
                start_time: '09:00:00',
                end_time: '12:00:00',
              },
            ],
          }),
        ],
      },
    )

    await user.click(await screen.findByRole('button', { name: 'Edit' }))
    await user.click(screen.getByRole('button', { name: 'Review & save' }))
    await user.click(await screen.findByRole('button', { name: 'Confirm' }))
    await waitFor(() =>
      expect(calls.updatedSchedule).toMatchObject({
        familyPk: '1',
        contractPk: '10',
        id: '3',
      }),
    )
  })

  it('deletes a schedule entry', async () => {
    const user = userEvent.setup()
    const calls = await openManage(user, makeContract(), {
      schedules: [makeSchedule({ id: '3', weekly_hours: 5 })],
    })

    const row = (await screen.findByText(/5 h\/week/)).closest(
      'li',
    ) as HTMLElement
    await user.click(within(row).getByRole('button', { name: 'Delete' }))
    const dialog = await screen.findByRole('alertdialog')
    await user.click(within(dialog).getByRole('button', { name: 'Delete' }))
    await waitFor(() =>
      expect(calls.deletedSchedule).toEqual({
        familyPk: '1',
        contractPk: '10',
        id: '3',
      }),
    )
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
    const calls = await openManage(user, makeContract(), {
      invitations: [
        {
          id: '7',
          email: 'friend@example.com',
          status: 'pending',
          token: 't',
          created_at: '',
          expires_at: '',
        },
      ],
    })

    expect(await screen.findByText('friend@example.com')).toBeInTheDocument()
    await user.type(screen.getByLabelText('Email to invite'), 'new@example.com')
    await user.click(screen.getByRole('button', { name: 'Send invitation' }))
    await waitFor(() =>
      expect(calls.createdInvitation).toMatchObject({
        familyPk: '1',
        contractPk: '10',
        body: { email: 'new@example.com' },
      }),
    )
  })
})
