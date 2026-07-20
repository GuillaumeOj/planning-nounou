import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { listChildren } from '@/src/api/children'
import type { Contract } from '@/src/api/contracts'
import {
  type ContractChild,
  createContractChild,
  deleteContractChild,
  getContractChildren,
  updateContractChild,
} from '@/src/api/declarations'
import type { Family } from '@/src/api/family'
import { ContractChildrenSection } from '@/src/components/ContractChildrenSection'
import { renderWithProviders, selectOption } from '@/tests/utils'

vi.mock('@/src/api/declarations', () => ({
  getContractChildren: vi.fn(),
  createContractChild: vi.fn(),
  updateContractChild: vi.fn(),
  deleteContractChild: vi.fn(),
}))
vi.mock('@/src/api/children', () => ({ listChildren: vi.fn() }))

const m = {
  entries: vi.mocked(getContractChildren),
  create: vi.mocked(createContractChild),
  update: vi.mocked(updateContractChild),
  remove: vi.mocked(deleteContractChild),
  children: vi.mocked(listChildren),
}

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
} as Contract

const fam = (o: Partial<Family> & Pick<Family, 'id'>): Family => ({
  name: o.id,
  role: 'owner',
  is_claimed: true,
  created_at: '2026-01-01',
  ...o,
})

// The acting user owns their own family; that is all they manage unless a test
// says otherwise.
const OWNS_ONE = [fam({ id: OWN_FAMILY })]

const child = (o: Partial<ContractChild> = {}): ContractChild => ({
  id: 'cc-1',
  child: 'kid-1',
  first_name: 'Léa',
  family_id: OWN_FAMILY,
  windows: [],
  ...o,
})

const render = (families: Family[] = OWNS_ONE, c: Contract = contract) =>
  renderWithProviders(
    <ContractChildrenSection
      familyId={OWN_FAMILY}
      contract={c}
      families={families}
    />,
  )

beforeEach(() => {
  vi.clearAllMocks()
  m.entries.mockResolvedValue([])
  // Each family's own children. OWN_FAMILY has two; the unclaimed one has Hugo.
  m.children.mockImplementation((id: string) =>
    Promise.resolve(
      id === UNCLAIMED_FAMILY
        ? [{ id: 'kid-9', first_name: 'Hugo' }]
        : [
            { id: 'kid-1', first_name: 'Léa' },
            { id: 'kid-2', first_name: 'Noé' },
          ],
    ),
  )
})

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
    m.entries.mockResolvedValue([child()])
    render()

    expect(await screen.findByText('Léa')).toBeInTheDocument()
    expect(screen.getByText('Whenever the nanny works')).toBeInTheDocument()
  })

  it('summarises the days a windowed child is there', async () => {
    m.entries.mockResolvedValue([
      child({
        windows: [
          { weekday: 0, start_time: '09:00:00', end_time: '17:00:00' },
          { weekday: 3, start_time: '09:00:00', end_time: '12:00:00' },
        ],
      }),
    ])
    render()

    // English renders 12-hour times; the summary joins the days with a dot.
    expect(
      await screen.findByText(
        'Monday 9:00 AM–5:00 PM · Thursday 9:00 AM–12:00 PM',
      ),
    ).toBeInTheDocument()
  })

  it('adds a child present whenever the nanny works', async () => {
    m.create.mockResolvedValue(child())
    render()

    await userEvent.click(
      await screen.findByRole('button', { name: 'Add a child' }),
    )
    await selectOption('Child', 'Léa')
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() =>
      expect(m.create).toHaveBeenCalledWith(OWN_FAMILY, 'contract-1', {
        child: 'kid-1',
        windows: [],
      }),
    )
  })

  it('will not save without a child', async () => {
    render()
    await userEvent.click(
      await screen.findByRole('button', { name: 'Add a child' }),
    )
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))

    expect(await screen.findByText('Choose a child.')).toBeInTheDocument()
    expect(m.create).not.toHaveBeenCalled()
  })

  it('surfaces a failed save', async () => {
    m.create.mockRejectedValue(new Error('nope'))
    render()

    await userEvent.click(
      await screen.findByRole('button', { name: 'Add a child' }),
    )
    await selectOption('Child', 'Léa')
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))

    expect(
      await screen.findByText('Something went wrong. Please try again.'),
    ).toBeInTheDocument()
  })

  it('edits a child already on the contract', async () => {
    m.entries.mockResolvedValue([child()])
    m.update.mockResolvedValue(child())
    render()

    await userEvent.click(await screen.findByRole('button', { name: 'Edit' }))
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() =>
      expect(m.update).toHaveBeenCalledWith(OWN_FAMILY, 'contract-1', 'cc-1', {
        child: 'kid-1',
        windows: [],
      }),
    )
  })

  it('takes a child off the contract once confirmed', async () => {
    m.entries.mockResolvedValue([child()])
    render()

    await userEvent.click(await screen.findByRole('button', { name: 'Delete' }))
    const dialog = screen.getByRole('alertdialog')
    await userEvent.click(
      within(dialog).getByRole('button', { name: 'Delete' }),
    )

    await waitFor(() =>
      expect(m.remove).toHaveBeenCalledWith(OWN_FAMILY, 'contract-1', 'cc-1'),
    )
  })

  it('asks for a child in the family before offering the form', async () => {
    m.children.mockResolvedValue([])
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
    m.entries.mockResolvedValue([child()])
    render()

    await userEvent.click(
      await screen.findByRole('button', { name: 'Add a child' }),
    )
    await userEvent.click(screen.getByRole('combobox', { name: 'Child' }))
    const options = screen.getByRole('listbox')
    expect(within(options).queryByText('Léa')).not.toBeInTheDocument()
    expect(within(options).getByText('Noé')).toBeInTheDocument()
  })

  // The other family's children are half of what the split divides, so they are
  // shown — but the backend refuses writes to them, and so does the UI.
  it('shows the other family’s children read-only', async () => {
    m.entries.mockResolvedValue([
      child(),
      child({
        id: 'cc-2',
        child: 'kid-9',
        first_name: 'Hugo',
        family_id: OTHER_FAMILY,
      }),
    ])
    render()

    expect(await screen.findByText('Hugo')).toBeInTheDocument()
    // One Edit and one Delete: the own row's, never the other's.
    expect(screen.getAllByRole('button', { name: 'Edit' })).toHaveLength(1)
    expect(screen.getAllByRole('button', { name: 'Delete' })).toHaveLength(1)
  })

  // A plain member of the family they are viewing manages no family here, so
  // the section offers no way to add — and must not claim the family is empty.
  it('offers no add affordance when the user manages no family here', async () => {
    m.entries.mockResolvedValue([child()])
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
  } as Contract

  it('edits an unclaimed family’s child, routed through that family', async () => {
    m.entries.mockResolvedValue([
      child({
        id: 'cc-9',
        child: 'kid-9',
        first_name: 'Hugo',
        family_id: UNCLAIMED_FAMILY,
      }),
    ])
    m.update.mockResolvedValue(child())
    render(withUnclaimed, contractWithUnclaimed)

    await userEvent.click(await screen.findByRole('button', { name: 'Edit' }))
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() =>
      expect(m.update).toHaveBeenCalledWith(
        UNCLAIMED_FAMILY,
        'contract-1',
        'cc-9',
        { child: 'kid-9', windows: [] },
      ),
    )
  })

  it('adds an unclaimed family’s child, routed through that family', async () => {
    m.create.mockResolvedValue(child())
    render(withUnclaimed, contractWithUnclaimed)

    await userEvent.click(
      await screen.findByRole('button', { name: 'Add a child' }),
    )
    await selectOption('Child', 'Hugo')
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() =>
      expect(m.create).toHaveBeenCalledWith(UNCLAIMED_FAMILY, 'contract-1', {
        child: 'kid-9',
        windows: [],
      }),
    )
  })

  // Once the co-employer claims the family, the user no longer manages it: the
  // row goes read-only, matching the backend, which would now refuse the write.
  it('stops offering to edit a family once it is claimed', async () => {
    m.entries.mockResolvedValue([
      child({
        id: 'cc-9',
        child: 'kid-9',
        first_name: 'Hugo',
        family_id: UNCLAIMED_FAMILY,
      }),
    ])
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
    await userEvent.click(
      await screen.findByRole('button', { name: 'Add a child' }),
    )
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

    m.create.mockResolvedValue(child())
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() =>
      expect(m.create).toHaveBeenCalledWith(OWN_FAMILY, 'contract-1', {
        child: 'kid-1',
        windows: [],
      }),
    )
  })

  it('saves the day windows that were filled in', async () => {
    m.create.mockResolvedValue(child())
    await openWindows()
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() =>
      expect(m.create).toHaveBeenCalledWith(OWN_FAMILY, 'contract-1', {
        child: 'kid-1',
        windows: [{ weekday: 0, start_time: '09:00', end_time: '17:00' }],
      }),
    )
  })

  it('edits a window’s day and times', async () => {
    m.create.mockResolvedValue(child())
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
      expect(m.create).toHaveBeenCalledWith(OWN_FAMILY, 'contract-1', {
        child: 'kid-1',
        windows: [{ weekday: 2, start_time: '08:30', end_time: '12:00' }],
      }),
    )
  })

  it('backing out of a copy changes nothing', async () => {
    m.create.mockResolvedValue(child())
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
      expect(m.create).toHaveBeenCalledWith(OWN_FAMILY, 'contract-1', {
        child: 'kid-1',
        windows: [{ weekday: 0, start_time: '09:00', end_time: '17:00' }],
      }),
    )
  })

  // The Wednesday case: a child away midweek is four windows, and copying is
  // what stops a parent typing the same times four times and fumbling one.
  it('copies a day onto the other days, skipping the one left out', async () => {
    m.create.mockResolvedValue(child())
    await openWindows()

    await userEvent.click(screen.getByRole('button', { name: 'Copy day' }))
    for (const day of ['Tuesday', 'Thursday', 'Friday']) {
      await userEvent.click(screen.getByRole('checkbox', { name: day }))
    }
    await userEvent.click(screen.getByRole('button', { name: 'Apply' }))
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => expect(m.create).toHaveBeenCalled())
    const windows = m.create.mock.calls[0][2].windows
    // Mon/Tue/Thu/Fri present, Wednesday absent — that is the day off.
    expect(windows?.map((w) => w.weekday)).toEqual([0, 1, 3, 4])
  })

  it('removes a day from the windows', async () => {
    m.create.mockResolvedValue(child())
    await openWindows()

    await userEvent.click(screen.getByRole('button', { name: 'Add a day' }))
    expect(screen.getAllByLabelText('Day')).toHaveLength(2)

    await userEvent.click(screen.getAllByRole('button', { name: 'Remove' })[0])
    expect(screen.getAllByLabelText('Day')).toHaveLength(1)
  })
})
