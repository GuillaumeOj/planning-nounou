import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { HttpResponse, http } from 'msw'
import { beforeEach, describe, expect, it } from 'vitest'
import type {
  ChildRead,
  ContractChildRead,
  ContractChildRequest,
  ContractRead,
  FamilyRead,
} from '@/src/api'
import { ContractChildrenSection } from '@/src/components/ContractChildrenSection'
import { server } from '@/tests/msw/server'
import { renderWithProviders, selectOption } from '@/tests/utils'

const OWN_FAMILY = 'fam-1'
const OTHER_FAMILY = 'fam-2'
// A family the acting user set up on a co-employer's behalf: unclaimed, so they
// manage it until it is claimed.
const UNCLAIMED_FAMILY = 'fam-3'

const contractFamily = (id: string) => ({
  id,
  name: id,
  is_originator: id === OWN_FAMILY,
})

// Everything shares this one contract by default; cross-family tests pass their
// own `families` list to widen who the user manages.
const contract = {
  id: 'contract-1',
  families: [contractFamily(OWN_FAMILY), contractFamily(OTHER_FAMILY)],
} as ContractRead

const fam = (o: Partial<FamilyRead> & Pick<FamilyRead, 'id'>): FamilyRead => ({
  name: o.id,
  role: 'owner',
  is_claimed: true,
  created_at: '2026-01-01',
  ...o,
})

// The acting user owns their own family; that is all they manage unless a test
// says otherwise.
const OWNS_ONE = [fam({ id: OWN_FAMILY })]

const child = (o: Partial<ContractChildRead> = {}): ContractChildRead => ({
  id: 'cc-1',
  child: 'kid-1',
  first_name: 'Léa',
  family_id: OWN_FAMILY,
  windows: [],
  ...o,
})

// Each family's own children. OWN_FAMILY has two; the unclaimed one has Hugo.
const DEFAULT_CHILDREN: Record<string, ChildRead[]> = {
  [OWN_FAMILY]: [
    { id: 'kid-1', first_name: 'Léa' },
    { id: 'kid-2', first_name: 'Noé' },
  ],
  [UNCLAIMED_FAMILY]: [{ id: 'kid-9', first_name: 'Hugo' }],
}

// What each mutation was sent, captured off the wire — the MSW equivalent of the
// old `expect(mockFn).toHaveBeenCalledWith(...)`. The family segment of the URL
// is the family the write was routed through, which several tests assert.
type Call = {
  familyPk: string
  contractPk: string
  id?: string
  body?: ContractChildRequest
}

// The list endpoints read from this mutable state, so a test just assigns to it
// before rendering (the old beforeEach-default + per-test-override shape). Error
// cases override a handler with a fresh `server.use(...)`, which takes priority.
let state: {
  entries: ContractChildRead[]
  children: Record<string, ChildRead[]>
  calls: { create?: Call; update?: Call; remove?: Call }
}

const CHILD = '*/api/families/:familyPk/children/'
const CONTRACT_CHILDREN =
  '*/api/families/:familyPk/contracts/:contractPk/children/'
const CONTRACT_CHILD =
  '*/api/families/:familyPk/contracts/:contractPk/children/:id/'

beforeEach(() => {
  state = { entries: [], children: DEFAULT_CHILDREN, calls: {} }
  server.use(
    // Each manageable family's children (one loader per family).
    http.get(CHILD, ({ params }) =>
      HttpResponse.json(state.children[params.familyPk as string] ?? []),
    ),
    // The children already on the contract.
    http.get(CONTRACT_CHILDREN, () => HttpResponse.json(state.entries)),
    http.post(CONTRACT_CHILDREN, async ({ params, request }) => {
      state.calls.create = {
        familyPk: params.familyPk as string,
        contractPk: params.contractPk as string,
        body: (await request.json()) as ContractChildRequest,
      }
      return HttpResponse.json(child(), { status: 201 })
    }),
    http.patch(CONTRACT_CHILD, async ({ params, request }) => {
      state.calls.update = {
        familyPk: params.familyPk as string,
        contractPk: params.contractPk as string,
        id: params.id as string,
        body: (await request.json()) as ContractChildRequest,
      }
      return HttpResponse.json(child())
    }),
    http.delete(CONTRACT_CHILD, ({ params }) => {
      state.calls.remove = {
        familyPk: params.familyPk as string,
        contractPk: params.contractPk as string,
        id: params.id as string,
      }
      return new HttpResponse(null, { status: 204 })
    }),
  )
})

const render = (
  families: FamilyRead[] = OWNS_ONE,
  c: ContractRead = contract,
) =>
  renderWithProviders(
    <ContractChildrenSection
      familyId={OWN_FAMILY}
      contract={c}
      families={families}
    />,
  )

// The add button is disabled until each manageable family's children have
// loaded over the wire (one query per family), so wait for it to be enabled
// before opening the form — the fetch is async now that it is real HTTP.
const clickAddChild = async () => {
  const button = await screen.findByRole('button', { name: 'Add a child' })
  await waitFor(() => expect(button).toBeEnabled())
  await userEvent.click(button)
}

describe('ContractChildrenSection', () => {
  it('says so when no child is on the contract yet', async () => {
    render()
    expect(
      await screen.findByText('No children on this contract yet.'),
    ).toBeInTheDocument()
  })

  // An empty windows list does NOT mean "never" — it means the child is there
  // whenever the nanny works, so the summary has to say that out loud.
  it('reads an empty windows list as whole-time presence', async () => {
    state.entries = [child()]
    render()

    expect(await screen.findByText('Léa')).toBeInTheDocument()
    expect(screen.getByText('Whenever the nanny works')).toBeInTheDocument()
  })

  it('summarises the days a windowed child is there', async () => {
    state.entries = [
      child({
        windows: [
          {
            id: 'w1',
            weekday: 0,
            start_time: '09:00:00',
            end_time: '17:00:00',
          },
          {
            id: 'w2',
            weekday: 3,
            start_time: '09:00:00',
            end_time: '12:00:00',
          },
        ],
      }),
    ]
    render()

    // English renders 12-hour times; the summary joins the days with a dot.
    expect(
      await screen.findByText(
        'Monday 9:00 AM–5:00 PM · Thursday 9:00 AM–12:00 PM',
      ),
    ).toBeInTheDocument()
  })

  it('adds a child present whenever the nanny works', async () => {
    render()

    await clickAddChild()
    await selectOption('Child', 'Léa')
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() =>
      expect(state.calls.create).toMatchObject({
        familyPk: OWN_FAMILY,
        contractPk: 'contract-1',
        body: { child: 'kid-1', windows: [] },
      }),
    )
  })

  it('will not save without a child', async () => {
    render()
    await clickAddChild()
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))

    expect(await screen.findByText('Choose a child.')).toBeInTheDocument()
    expect(state.calls.create).toBeUndefined()
  })

  it('surfaces a failed save', async () => {
    // A 500 with no body carries no field messages, so the UI shows the fallback.
    server.use(
      http.post(
        CONTRACT_CHILDREN,
        () => new HttpResponse(null, { status: 500 }),
      ),
    )
    render()

    await clickAddChild()
    await selectOption('Child', 'Léa')
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))

    expect(
      await screen.findByText('Something went wrong. Please try again.'),
    ).toBeInTheDocument()
  })

  it('edits a child already on the contract', async () => {
    state.entries = [child()]
    render()

    await userEvent.click(await screen.findByRole('button', { name: 'Edit' }))
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() =>
      expect(state.calls.update).toMatchObject({
        familyPk: OWN_FAMILY,
        contractPk: 'contract-1',
        id: 'cc-1',
        body: { child: 'kid-1', windows: [] },
      }),
    )
  })

  it('takes a child off the contract once confirmed', async () => {
    state.entries = [child()]
    render()

    await userEvent.click(await screen.findByRole('button', { name: 'Delete' }))
    const dialog = screen.getByRole('alertdialog')
    await userEvent.click(
      within(dialog).getByRole('button', { name: 'Delete' }),
    )

    await waitFor(() =>
      expect(state.calls.remove).toMatchObject({
        familyPk: OWN_FAMILY,
        contractPk: 'contract-1',
        id: 'cc-1',
      }),
    )
  })

  it('asks for a child in the family before offering the form', async () => {
    state.children = { [OWN_FAMILY]: [] }
    render()

    expect(
      await screen.findByText('Add a child to your family first.'),
    ).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'Add a child' }),
    ).not.toBeInTheDocument()
  })

  // Adding the same child twice would be a duplicate the backend rejects.
  it('does not offer a child already on the contract', async () => {
    state.entries = [child()]
    render()

    await clickAddChild()
    await userEvent.click(screen.getByRole('combobox', { name: 'Child' }))
    const options = screen.getByRole('listbox')
    expect(within(options).queryByText('Léa')).not.toBeInTheDocument()
    expect(within(options).getByText('Noé')).toBeInTheDocument()
  })

  // The other family's children are half of what the split divides, so they are
  // shown — but the backend refuses writes to them, and so does the UI.
  it('shows the other family’s children read-only', async () => {
    state.entries = [
      child(),
      child({
        id: 'cc-2',
        child: 'kid-9',
        first_name: 'Hugo',
        family_id: OTHER_FAMILY,
      }),
    ]
    render()

    expect(await screen.findByText('Hugo')).toBeInTheDocument()
    // One Edit and one Delete: the own row's, never the other's.
    expect(screen.getAllByRole('button', { name: 'Edit' })).toHaveLength(1)
    expect(screen.getAllByRole('button', { name: 'Delete' })).toHaveLength(1)
  })

  // A plain member of the family they are viewing manages no family here, so
  // the section offers no way to add — and must not claim the family is empty.
  it('offers no add affordance when the user manages no family here', async () => {
    state.entries = [child()]
    render([fam({ id: OWN_FAMILY, role: 'member' })])

    // The read-only row still shows; the add area does not.
    expect(await screen.findByText('Léa')).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'Add a child' }),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByText('Add a child to your family first.'),
    ).not.toBeInTheDocument()
  })

  // Until a co-employer claims the family the user set up for them, the user
  // manages it — so they can edit its children's presence, and the write is
  // routed through that family, not the family whose page they are on.
  const withUnclaimed = [
    fam({ id: OWN_FAMILY }),
    fam({ id: UNCLAIMED_FAMILY, role: null, is_claimed: false }),
  ]
  const contractWithUnclaimed = {
    id: 'contract-1',
    families: [contractFamily(OWN_FAMILY), contractFamily(UNCLAIMED_FAMILY)],
  } as ContractRead

  it('edits an unclaimed family’s child, routed through that family', async () => {
    state.entries = [
      child({
        id: 'cc-9',
        child: 'kid-9',
        first_name: 'Hugo',
        family_id: UNCLAIMED_FAMILY,
      }),
    ]
    render(withUnclaimed, contractWithUnclaimed)

    await userEvent.click(await screen.findByRole('button', { name: 'Edit' }))
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() =>
      expect(state.calls.update).toMatchObject({
        familyPk: UNCLAIMED_FAMILY,
        contractPk: 'contract-1',
        id: 'cc-9',
        body: { child: 'kid-9', windows: [] },
      }),
    )
  })

  it('adds an unclaimed family’s child, routed through that family', async () => {
    render(withUnclaimed, contractWithUnclaimed)

    await clickAddChild()
    await selectOption('Child', 'Hugo')
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() =>
      expect(state.calls.create).toMatchObject({
        familyPk: UNCLAIMED_FAMILY,
        contractPk: 'contract-1',
        body: { child: 'kid-9', windows: [] },
      }),
    )
  })

  // Once the co-employer claims the family, the user no longer manages it: the
  // row goes read-only, matching the backend, which would now refuse the write.
  it('stops offering to edit a family once it is claimed', async () => {
    state.entries = [
      child({
        id: 'cc-9',
        child: 'kid-9',
        first_name: 'Hugo',
        family_id: UNCLAIMED_FAMILY,
      }),
    ]
    render(
      [
        fam({ id: OWN_FAMILY }),
        fam({ id: UNCLAIMED_FAMILY, role: null, is_claimed: true }),
      ],
      contractWithUnclaimed,
    )

    expect(await screen.findByText('Hugo')).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'Edit' }),
    ).not.toBeInTheDocument()
  })
})

describe('ContractChildrenSection windows', () => {
  const openWindows = async () => {
    render()
    await clickAddChild()
    await selectOption('Child', 'Léa')
    await userEvent.click(
      screen.getByRole('radio', { name: 'Only on certain days' }),
    )
  }

  it('switching to certain days opens one day to fill in', async () => {
    await openWindows()
    expect(screen.getByLabelText('Day')).toBeInTheDocument()
  })

  it('switching back to whole-time drops the windows', async () => {
    await openWindows()
    await userEvent.click(
      screen.getByRole('radio', { name: 'Whenever the nanny works' }),
    )
    expect(screen.queryByLabelText('Day')).not.toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() =>
      expect(state.calls.create).toMatchObject({
        familyPk: OWN_FAMILY,
        contractPk: 'contract-1',
        body: { child: 'kid-1', windows: [] },
      }),
    )
  })

  it('saves the day windows that were filled in', async () => {
    await openWindows()
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() =>
      expect(state.calls.create).toMatchObject({
        familyPk: OWN_FAMILY,
        contractPk: 'contract-1',
        body: {
          child: 'kid-1',
          windows: [{ weekday: 0, start_time: '09:00', end_time: '17:00' }],
        },
      }),
    )
  })

  it('edits a window’s day and times', async () => {
    await openWindows()

    await selectOption('Day', 'Wednesday')
    const from = screen.getByLabelText('From')
    await userEvent.clear(from)
    await userEvent.type(from, '8:30 AM')
    const to = screen.getByLabelText('To')
    await userEvent.clear(to)
    await userEvent.type(to, '12:00 PM')
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() =>
      expect(state.calls.create).toMatchObject({
        familyPk: OWN_FAMILY,
        contractPk: 'contract-1',
        body: {
          child: 'kid-1',
          windows: [{ weekday: 2, start_time: '08:30', end_time: '12:00' }],
        },
      }),
    )
  })

  it('backing out of a copy changes nothing', async () => {
    await openWindows()

    await userEvent.click(screen.getByRole('button', { name: 'Copy day' }))
    await userEvent.click(screen.getByRole('checkbox', { name: 'Tuesday' }))
    // The form has a Cancel of its own; this is the copy dialog's.
    const dialog = screen.getByRole('dialog')
    await userEvent.click(
      within(dialog).getByRole('button', { name: 'Cancel' }),
    )
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() =>
      expect(state.calls.create).toMatchObject({
        familyPk: OWN_FAMILY,
        contractPk: 'contract-1',
        body: {
          child: 'kid-1',
          windows: [{ weekday: 0, start_time: '09:00', end_time: '17:00' }],
        },
      }),
    )
  })

  // The Wednesday case: a child away midweek is four windows, and copying is
  // what stops a parent typing the same times four times and fumbling one.
  it('copies a day onto the other days, skipping the one left out', async () => {
    await openWindows()

    await userEvent.click(screen.getByRole('button', { name: 'Copy day' }))
    for (const day of ['Tuesday', 'Thursday', 'Friday']) {
      await userEvent.click(screen.getByRole('checkbox', { name: day }))
    }
    await userEvent.click(screen.getByRole('button', { name: 'Apply' }))
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => expect(state.calls.create).toBeDefined())
    const windows = state.calls.create?.body?.windows
    // Mon/Tue/Thu/Fri present, Wednesday absent — that is the day off.
    expect(windows?.map((w) => w.weekday)).toEqual([0, 1, 3, 4])
  })

  it('removes a day from the windows', async () => {
    await openWindows()

    await userEvent.click(screen.getByRole('button', { name: 'Add a day' }))
    expect(screen.getAllByLabelText('Day')).toHaveLength(2)

    await userEvent.click(screen.getAllByRole('button', { name: 'Remove' })[0])
    expect(screen.getAllByLabelText('Day')).toHaveLength(1)
  })
})
