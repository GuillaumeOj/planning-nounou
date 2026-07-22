import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { HttpResponse, http } from 'msw'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type {
  ChildRead,
  FamilyMembershipRead,
  FamilyRead,
  InvitationRead,
  MyInvitationRead,
} from '@/src/api'
import { useAuth } from '@/src/auth/AuthContext'
import FamilyPage from '@/src/pages/Family'
import { server } from '@/tests/msw/server'
import { makeAuth, renderWithProviders, selectOption } from '@/tests/utils'

vi.mock('@/src/auth/AuthContext', () => ({ useAuth: vi.fn() }))
const mockUseAuth = vi.mocked(useAuth)

const OWNER_FAMILY: FamilyRead = {
  id: '1',
  name: 'Dupont',
  role: 'owner',
  is_claimed: true,
  created_at: '2026-01-01T00:00:00Z',
}
const MEMBER_FAMILY: FamilyRead = {
  id: '2',
  name: 'Martin',
  role: 'member',
  is_claimed: true,
  created_at: '2026-01-01T00:00:00Z',
}
const UNCLAIMED_FAMILY: FamilyRead = {
  id: '3',
  name: 'Gift',
  role: null,
  is_claimed: false,
  created_at: '2026-01-01T00:00:00Z',
}
const SELF_MEMBER: FamilyMembershipRead = {
  id: '10',
  user: '1',
  email: 'me@example.com',
  first_name: 'Ada',
  last_name: 'Lovelace',
  role: 'owner',
  joined_at: '2026-01-01T00:00:00Z',
}
const OTHER_MEMBER: FamilyMembershipRead = {
  id: '11',
  user: '2',
  email: 'friend@example.com',
  first_name: 'Bob',
  last_name: 'Martin',
  role: 'member',
  joined_at: '2026-01-01T00:00:00Z',
}
const INVITE: InvitationRead = {
  id: '20',
  email: 'invitee@example.com',
  role: 'member',
  status: 'pending',
  token: 'tok-123',
  created_at: '2026-01-01T00:00:00Z',
  expires_at: '2026-01-08T00:00:00Z',
}
const MY_INVITE: MyInvitationRead = {
  id: '30',
  family_name: 'Bernard',
  role: 'owner',
  token: 'inbox-tok',
  expires_at: '2026-01-08T00:00:00Z',
}

// Endpoint paths — `*` matches any origin, the path (with trailing slash) is what
// each generated endpoint calls. Path params (`:familyPk`, `:id`, `:token`) let a
// single handler serve any family/child/invitation the page touches.
const FAMILIES = '*/api/families/'
const INBOX = '*/api/invitations/'
const CHILDREN = '*/api/families/:familyPk/children/'
const CHILD = '*/api/families/:familyPk/children/:id/'
const MEMBERS = '*/api/families/:familyPk/members/'
const MEMBER = '*/api/families/:familyPk/members/:id/'
const FAM_INVITES = '*/api/families/:familyPk/invitations/'
const FAM_INVITE = '*/api/families/:familyPk/invitations/:id/'
const FAMILY = '*/api/families/:id/'
const LEAVE = '*/api/families/:id/leave/'
const ACCEPT = '*/api/invitations/:token/accept/'
const DECLINE = '*/api/invitations/:token/decline/'

interface Calls {
  createFamily?: unknown
  updateFamily?: { id: string; body: unknown }
  deletedFamily?: string
  leftFamily?: string
  removedMember?: { familyPk: string; id: string }
  createInvite?: { familyPk: string; body: unknown }
  revokedInvite?: { familyPk: string; id: string }
  createChild?: { familyPk: string; body: unknown }
  updateChild?: { familyPk: string; id: string; body: unknown }
  deleteChild?: { familyPk: string; id: string }
  acceptedToken?: string
  declinedToken?: string
}

// Register every endpoint the page can fire, returning the given data and
// recording mutation bodies/params so tests can assert them — the MSW stand-in
// for the old `expect(mockFn).toHaveBeenCalledWith(...)`.
function setup(
  opts: {
    families?: FamilyRead[]
    members?: FamilyMembershipRead[]
    familyInvites?: InvitationRead[]
    children?: ChildRead[]
    myInvites?: MyInvitationRead[]
  } = {},
): Calls {
  const {
    families = [OWNER_FAMILY],
    members = [SELF_MEMBER],
    familyInvites = [],
    children = [],
    myInvites = [],
  } = opts
  const calls: Calls = {}
  server.use(
    // Queries
    http.get(FAMILIES, () => HttpResponse.json(families)),
    http.get(INBOX, () => HttpResponse.json(myInvites)),
    http.get(CHILDREN, () => HttpResponse.json(children)),
    http.get(MEMBERS, () => HttpResponse.json(members)),
    http.get(FAM_INVITES, () => HttpResponse.json(familyInvites)),
    // Family create/rename/delete/leave
    http.post(FAMILIES, async ({ request }) => {
      calls.createFamily = await request.json()
      return HttpResponse.json(
        { ...OWNER_FAMILY, id: '9', name: 'New' },
        { status: 201 },
      )
    }),
    http.patch(FAMILY, async ({ request, params }) => {
      calls.updateFamily = {
        id: params.id as string,
        body: await request.json(),
      }
      return HttpResponse.json({ ...OWNER_FAMILY, id: params.id as string })
    }),
    http.delete(FAMILY, ({ params }) => {
      calls.deletedFamily = params.id as string
      return new HttpResponse(null, { status: 204 })
    }),
    http.post(LEAVE, ({ params }) => {
      calls.leftFamily = params.id as string
      return new HttpResponse(null, { status: 204 })
    }),
    // Members
    http.delete(MEMBER, ({ params }) => {
      calls.removedMember = {
        familyPk: params.familyPk as string,
        id: params.id as string,
      }
      return new HttpResponse(null, { status: 204 })
    }),
    // Family invitations
    http.post(FAM_INVITES, async ({ request, params }) => {
      calls.createInvite = {
        familyPk: params.familyPk as string,
        body: await request.json(),
      }
      return HttpResponse.json(INVITE, { status: 201 })
    }),
    http.delete(FAM_INVITE, ({ params }) => {
      calls.revokedInvite = {
        familyPk: params.familyPk as string,
        id: params.id as string,
      }
      return new HttpResponse(null, { status: 204 })
    }),
    // Children
    http.post(CHILDREN, async ({ request, params }) => {
      const body = (await request.json()) as { first_name: string }
      calls.createChild = { familyPk: params.familyPk as string, body }
      return HttpResponse.json(
        { id: '6', first_name: body.first_name },
        { status: 201 },
      )
    }),
    http.patch(CHILD, async ({ request, params }) => {
      const body = (await request.json()) as { first_name?: string }
      calls.updateChild = {
        familyPk: params.familyPk as string,
        id: params.id as string,
        body,
      }
      return HttpResponse.json({
        id: params.id as string,
        first_name: body.first_name ?? '',
      })
    }),
    http.delete(CHILD, ({ params }) => {
      calls.deleteChild = {
        familyPk: params.familyPk as string,
        id: params.id as string,
      }
      return new HttpResponse(null, { status: 204 })
    }),
    // Invitation inbox accept/decline
    http.post(ACCEPT, ({ params }) => {
      calls.acceptedToken = params.token as string
      return HttpResponse.json(OWNER_FAMILY)
    }),
    http.post(DECLINE, ({ params }) => {
      calls.declinedToken = params.token as string
      return new HttpResponse(null, { status: 204 })
    }),
  )
  return calls
}

function renderPage() {
  return renderWithProviders(<FamilyPage />)
}

// Render the page and open the first family's detail panel.
async function openDetail() {
  renderPage()
  await userEvent.click(await screen.findByRole('button', { name: 'Manage' }))
  await screen.findByRole('heading', { name: 'Members' })
}

beforeEach(() => {
  mockUseAuth.mockReturnValue(
    makeAuth({
      user: {
        id: '1',
        email: 'me@example.com',
        first_name: 'Ada',
        last_name: 'Lovelace',
      },
      isAuthenticated: true,
    }),
  )
})

describe('FamilyPage — invitation inbox', () => {
  it('shows no inbox section when there are no invitations for me', async () => {
    setup()
    renderPage()
    await screen.findByText('Dupont')
    expect(
      screen.queryByRole('heading', { name: 'Invitations for you' }),
    ).not.toBeInTheDocument()
  })

  it('lists invitations addressed to me and accepts one', async () => {
    const calls = setup({ myInvites: [MY_INVITE] })
    renderPage()

    await screen.findByRole('heading', { name: 'Invitations for you' })
    expect(screen.getByText('Bernard')).toBeInTheDocument()

    await userEvent.click(
      screen.getByRole('button', { name: 'Accept invitation' }),
    )
    await waitFor(() => expect(calls.acceptedToken).toBe('inbox-tok'))
  })

  it('declines an invitation addressed to me', async () => {
    const calls = setup({ myInvites: [MY_INVITE] })
    renderPage()

    await screen.findByRole('heading', { name: 'Invitations for you' })
    await userEvent.click(screen.getByRole('button', { name: 'Decline' }))
    await waitFor(() => expect(calls.declinedToken).toBe('inbox-tok'))
  })
})

describe('FamilyPage — list', () => {
  it('shows a loading state', () => {
    setup()
    server.use(http.get(FAMILIES, () => new Promise(() => {})))
    renderPage()
    expect(screen.getByText('Loading…')).toBeInTheDocument()
  })

  it('shows a load error', async () => {
    setup()
    server.use(
      http.get(FAMILIES, () => new HttpResponse(null, { status: 500 })),
    )
    renderPage()
    expect(
      await screen.findByText('Could not load your families.'),
    ).toBeInTheDocument()
  })

  it('shows the empty state', async () => {
    setup({ families: [] })
    renderPage()
    expect(
      await screen.findByText('No families yet. Create one to get started.'),
    ).toBeInTheDocument()
  })

  it('lists families with role and claim badges', async () => {
    setup({ families: [OWNER_FAMILY, UNCLAIMED_FAMILY] })
    renderPage()
    expect(await screen.findByText('Dupont')).toBeInTheDocument()
    expect(screen.getByText('Gift')).toBeInTheDocument()
    expect(screen.getByText('Unclaimed')).toBeInTheDocument()
  })
})

describe('FamilyPage — children', () => {
  it('lists, adds, renames and deletes children', async () => {
    const calls = setup({ children: [{ id: '5', first_name: 'Leo' }] })
    await openDetail()

    const row = await screen.findByDisplayValue('Leo')
    // rename
    await userEvent.type(row, 'n')
    await userEvent.click(
      within(row.closest('li') as HTMLElement).getByRole('button', {
        name: 'Save',
      }),
    )
    await waitFor(() =>
      expect(calls.updateChild).toMatchObject({
        familyPk: '1',
        id: '5',
        body: { first_name: 'Leon' },
      }),
    )

    // delete
    await userEvent.click(
      within(row.closest('li') as HTMLElement).getByRole('button', {
        name: 'Delete',
      }),
    )
    await waitFor(() =>
      expect(calls.deleteChild).toEqual({ familyPk: '1', id: '5' }),
    )

    // add (disambiguate the add-form input from the row input by its name)
    await userEvent.type(
      screen.getByLabelText('First name', {
        selector: 'input[name="first_name"]',
      }),
      'Mia',
    )
    await userEvent.click(screen.getByRole('button', { name: 'Add child' }))
    await waitFor(() =>
      expect(calls.createChild).toMatchObject({
        familyPk: '1',
        body: { first_name: 'Mia' },
      }),
    )
  })

  it('shows an error when adding a child fails', async () => {
    setup()
    server.use(
      http.post(CHILDREN, () => new HttpResponse(null, { status: 500 })),
    )
    await openDetail()

    await userEvent.type(screen.getByLabelText('First name'), 'Mia')
    await userEvent.click(screen.getByRole('button', { name: 'Add child' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Could not save children',
    )
  })
})

describe('FamilyPage — members', () => {
  it('lists members and removes another member', async () => {
    const calls = setup({ members: [SELF_MEMBER, OTHER_MEMBER] })
    await openDetail()

    expect(await screen.findByText('friend@example.com')).toBeInTheDocument()
    // Open the confirm dialog then confirm removal.
    await userEvent.click(screen.getByRole('button', { name: 'Remove' }))
    const dialog = await screen.findByRole('alertdialog')
    await userEvent.click(
      within(dialog).getByRole('button', { name: 'Remove' }),
    )
    await waitFor(() =>
      expect(calls.removedMember).toEqual({ familyPk: '1', id: '11' }),
    )
  })

  it('prompts to invite an owner when unclaimed', async () => {
    setup({ families: [UNCLAIMED_FAMILY], members: [] })
    await openDetail()
    expect(
      await screen.findByText(/Nobody owns this family yet/),
    ).toBeInTheDocument()
  })
})

describe('FamilyPage — invitations', () => {
  it('lists a pending invitation with a shareable link and revokes it', async () => {
    const calls = setup({ familyInvites: [INVITE] })
    await openDetail()

    expect(await screen.findByText('invitee@example.com')).toBeInTheDocument()
    expect(screen.getByDisplayValue(/\/invite\/tok-123$/)).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Revoke' }))
    await waitFor(() =>
      expect(calls.revokedInvite).toEqual({ familyPk: '1', id: '20' }),
    )
  })

  it('creates an invitation with the chosen role', async () => {
    const calls = setup()
    await openDetail()

    await userEvent.type(
      await screen.findByLabelText('Email'),
      'new@example.com',
    )
    await selectOption('Role', 'Owner')
    await userEvent.click(
      screen.getByRole('button', { name: 'Send invitation' }),
    )

    await waitFor(() =>
      expect(calls.createInvite).toMatchObject({
        familyPk: '1',
        body: { email: 'new@example.com', role: 'owner' },
      }),
    )
  })

  it('copies the invite link', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.assign(navigator, { clipboard: { writeText } })
    setup({ familyInvites: [INVITE] })
    await openDetail()

    await screen.findByText('invitee@example.com')
    await userEvent.click(screen.getByRole('button', { name: 'Copy link' }))
    expect(writeText).toHaveBeenCalledWith(
      expect.stringContaining('/invite/tok-123'),
    )
    expect(await screen.findByText('Copied')).toBeInTheDocument()
  })
})

describe('FamilyPage — family actions', () => {
  it('creates a family for yourself', async () => {
    const calls = setup()
    renderPage()
    await screen.findByText('Dupont')

    await userEvent.click(
      screen.getByRole('button', { name: 'Create a family' }),
    )
    await userEvent.type(screen.getByLabelText('Family name'), 'Nest')
    // Submit button inside the dialog.
    const dialog = screen.getByRole('dialog')
    await userEvent.click(
      within(dialog).getByRole('button', { name: 'Create a family' }),
    )

    await waitFor(() =>
      expect(calls.createFamily).toEqual({ name: 'Nest', claim: true }),
    )
  })

  it('creates an unclaimed family for someone else', async () => {
    const calls = setup()
    renderPage()
    await screen.findByText('Dupont')

    await userEvent.click(
      screen.getByRole('button', { name: 'Create a family' }),
    )
    await userEvent.type(screen.getByLabelText('Family name'), 'Gift')
    await userEvent.click(
      screen.getByRole('checkbox', {
        name: /setting this up for someone else/,
      }),
    )
    const dialog = screen.getByRole('dialog')
    await userEvent.click(
      within(dialog).getByRole('button', { name: 'Create a family' }),
    )

    await waitFor(() =>
      expect(calls.createFamily).toEqual({ name: 'Gift', claim: false }),
    )
  })

  it('renames a family', async () => {
    const calls = setup()
    await openDetail()

    await userEvent.click(screen.getByRole('button', { name: 'Rename' }))
    const nameField = screen.getByLabelText('Family name')
    await userEvent.clear(nameField)
    await userEvent.type(nameField, 'Renamed')
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() =>
      expect(calls.updateFamily).toEqual({
        id: '1',
        body: { name: 'Renamed' },
      }),
    )
  })

  it('deletes a family after confirming', async () => {
    const calls = setup()
    await openDetail()

    await userEvent.click(screen.getByRole('button', { name: 'Delete family' }))
    const dialog = await screen.findByRole('alertdialog')
    await userEvent.click(
      within(dialog).getByRole('button', { name: 'Delete family' }),
    )
    await waitFor(() => expect(calls.deletedFamily).toBe('1'))
  })

  it('leaves a family after confirming', async () => {
    const calls = setup()
    await openDetail()

    await userEvent.click(screen.getByRole('button', { name: 'Leave family' }))
    const dialog = await screen.findByRole('alertdialog')
    await userEvent.click(
      within(dialog).getByRole('button', { name: 'Leave family' }),
    )
    await waitFor(() => expect(calls.leftFamily).toBe('1'))
  })

  it('hides manage actions for a plain member', async () => {
    setup({ families: [MEMBER_FAMILY] })
    await openDetail()

    expect(
      screen.queryByRole('button', { name: 'Rename' }),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'Delete family' }),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole('heading', { name: 'Invitations' }),
    ).not.toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Leave family' }),
    ).toBeInTheDocument()
  })
})
