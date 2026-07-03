import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createChild,
  deleteChild,
  listChildren,
  updateChild,
} from '../api/children'
import {
  acceptInvitation,
  createFamily,
  createInvitation,
  declineInvitation,
  deleteFamily,
  getFamilies,
  getFamilyMembers,
  getInvitations,
  getMyInvitations,
  leaveFamily,
  removeFamilyMember,
  revokeInvitation,
  updateFamily,
} from '../api/family'
import { useAuth } from '../auth/AuthContext'
import { I18nProvider } from '../i18n/I18nContext'
import { makeAuth } from '../test/utils'
import FamilyPage from './Family'

vi.mock('../api/family', () => ({
  getFamilies: vi.fn(),
  createFamily: vi.fn(),
  updateFamily: vi.fn(),
  deleteFamily: vi.fn(),
  leaveFamily: vi.fn(),
  getFamilyMembers: vi.fn(),
  removeFamilyMember: vi.fn(),
  getInvitations: vi.fn(),
  createInvitation: vi.fn(),
  revokeInvitation: vi.fn(),
  getMyInvitations: vi.fn(),
  acceptInvitation: vi.fn(),
  declineInvitation: vi.fn(),
}))
vi.mock('../api/children', () => ({
  listChildren: vi.fn(),
  createChild: vi.fn(),
  updateChild: vi.fn(),
  deleteChild: vi.fn(),
}))
vi.mock('../auth/AuthContext', () => ({ useAuth: vi.fn() }))

const mockGetFamilies = vi.mocked(getFamilies)
const mockCreateFamily = vi.mocked(createFamily)
const mockUpdateFamily = vi.mocked(updateFamily)
const mockDeleteFamily = vi.mocked(deleteFamily)
const mockLeaveFamily = vi.mocked(leaveFamily)
const mockGetMembers = vi.mocked(getFamilyMembers)
const mockRemoveMember = vi.mocked(removeFamilyMember)
const mockGetInvitations = vi.mocked(getInvitations)
const mockCreateInvitation = vi.mocked(createInvitation)
const mockRevokeInvitation = vi.mocked(revokeInvitation)
const mockListChildren = vi.mocked(listChildren)
const mockCreateChild = vi.mocked(createChild)
const mockUpdateChild = vi.mocked(updateChild)
const mockDeleteChild = vi.mocked(deleteChild)
const mockGetMyInvitations = vi.mocked(getMyInvitations)
const mockAcceptInvitation = vi.mocked(acceptInvitation)
const mockDeclineInvitation = vi.mocked(declineInvitation)
const mockUseAuth = vi.mocked(useAuth)

const OWNER_FAMILY = {
  id: '1',
  name: 'Dupont',
  role: 'owner' as const,
  is_claimed: true,
  created_at: '2026-01-01T00:00:00Z',
}
const MEMBER_FAMILY = {
  id: '2',
  name: 'Martin',
  role: 'member' as const,
  is_claimed: true,
  created_at: '2026-01-01T00:00:00Z',
}
const UNCLAIMED_FAMILY = {
  id: '3',
  name: 'Gift',
  role: null,
  is_claimed: false,
  created_at: '2026-01-01T00:00:00Z',
}
const SELF_MEMBER = {
  id: '10',
  user: '1',
  email: 'me@example.com',
  first_name: 'Ada',
  last_name: 'Lovelace',
  role: 'owner' as const,
  joined_at: '2026-01-01T00:00:00Z',
}
const OTHER_MEMBER = {
  id: '11',
  user: '2',
  email: 'friend@example.com',
  first_name: 'Bob',
  last_name: 'Martin',
  role: 'member' as const,
  joined_at: '2026-01-01T00:00:00Z',
}
const INVITE = {
  id: '20',
  email: 'invitee@example.com',
  role: 'member' as const,
  status: 'pending' as const,
  token: 'tok-123',
  created_at: '2026-01-01T00:00:00Z',
  expires_at: '2026-01-08T00:00:00Z',
}

function renderPage() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return render(
    <I18nProvider>
      <QueryClientProvider client={client}>
        <MemoryRouter>
          <FamilyPage />
        </MemoryRouter>
      </QueryClientProvider>
    </I18nProvider>,
  )
}

// Render the page and open the first family's detail panel.
async function openDetail() {
  renderPage()
  await userEvent.click(await screen.findByRole('button', { name: 'Manage' }))
  await screen.findByRole('heading', { name: 'Members' })
}

beforeEach(() => {
  vi.clearAllMocks()
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
  mockGetFamilies.mockResolvedValue([OWNER_FAMILY])
  mockGetMembers.mockResolvedValue([SELF_MEMBER])
  mockGetInvitations.mockResolvedValue([])
  mockListChildren.mockResolvedValue([])
  mockGetMyInvitations.mockResolvedValue([])
})

const MY_INVITE = {
  id: '30',
  family_name: 'Bernard',
  role: 'owner' as const,
  token: 'inbox-tok',
  expires_at: '2026-01-08T00:00:00Z',
}

describe('FamilyPage — invitation inbox', () => {
  it('shows no inbox section when there are no invitations for me', async () => {
    renderPage()
    await screen.findByText('Dupont')
    expect(
      screen.queryByRole('heading', { name: 'Invitations for you' }),
    ).not.toBeInTheDocument()
  })

  it('lists invitations addressed to me and accepts one', async () => {
    mockGetMyInvitations.mockResolvedValue([MY_INVITE])
    mockAcceptInvitation.mockResolvedValue(OWNER_FAMILY)
    renderPage()

    await screen.findByRole('heading', { name: 'Invitations for you' })
    expect(screen.getByText('Bernard')).toBeInTheDocument()

    await userEvent.click(
      screen.getByRole('button', { name: 'Accept invitation' }),
    )
    await waitFor(() =>
      expect(mockAcceptInvitation).toHaveBeenCalledWith('inbox-tok'),
    )
  })

  it('declines an invitation addressed to me', async () => {
    mockGetMyInvitations.mockResolvedValue([MY_INVITE])
    mockDeclineInvitation.mockResolvedValue(undefined)
    renderPage()

    await screen.findByRole('heading', { name: 'Invitations for you' })
    await userEvent.click(screen.getByRole('button', { name: 'Decline' }))
    await waitFor(() =>
      expect(mockDeclineInvitation).toHaveBeenCalledWith('inbox-tok'),
    )
  })
})

describe('FamilyPage — list', () => {
  it('shows a loading state', () => {
    mockGetFamilies.mockReturnValue(new Promise(() => {}))
    renderPage()
    expect(screen.getByText('Loading…')).toBeInTheDocument()
  })

  it('shows a load error', async () => {
    mockGetFamilies.mockRejectedValue(new Error('down'))
    renderPage()
    expect(
      await screen.findByText('Could not load your families.'),
    ).toBeInTheDocument()
  })

  it('shows the empty state', async () => {
    mockGetFamilies.mockResolvedValue([])
    renderPage()
    expect(
      await screen.findByText('No families yet. Create one to get started.'),
    ).toBeInTheDocument()
  })

  it('lists families with role and claim badges', async () => {
    mockGetFamilies.mockResolvedValue([OWNER_FAMILY, UNCLAIMED_FAMILY])
    renderPage()
    expect(await screen.findByText('Dupont')).toBeInTheDocument()
    expect(screen.getByText('Gift')).toBeInTheDocument()
    expect(screen.getByText('Unclaimed')).toBeInTheDocument()
  })
})

describe('FamilyPage — children', () => {
  it('lists, adds, renames and deletes children', async () => {
    mockListChildren.mockResolvedValue([{ id: '5', first_name: 'Leo' }])
    mockCreateChild.mockResolvedValue({ id: '6', first_name: 'Mia' })
    mockUpdateChild.mockResolvedValue({ id: '5', first_name: 'Leon' })
    mockDeleteChild.mockResolvedValue(undefined)
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
      expect(mockUpdateChild).toHaveBeenCalledWith('1', '5', 'Leon'),
    )

    // delete
    await userEvent.click(
      within(row.closest('li') as HTMLElement).getByRole('button', {
        name: 'Delete',
      }),
    )
    await waitFor(() => expect(mockDeleteChild).toHaveBeenCalledWith('1', '5'))

    // add (disambiguate the add-form input from the row input by its name)
    await userEvent.type(
      screen.getByLabelText('First name', {
        selector: 'input[name="first_name"]',
      }),
      'Mia',
    )
    await userEvent.click(screen.getByRole('button', { name: 'Add child' }))
    await waitFor(() =>
      expect(mockCreateChild).toHaveBeenCalledWith('1', 'Mia'),
    )
  })

  it('shows an error when adding a child fails', async () => {
    mockCreateChild.mockRejectedValue(new Error('boom'))
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
    mockGetMembers.mockResolvedValue([SELF_MEMBER, OTHER_MEMBER])
    mockRemoveMember.mockResolvedValue(undefined)
    await openDetail()

    expect(await screen.findByText('friend@example.com')).toBeInTheDocument()
    // Open the confirm dialog then confirm removal.
    await userEvent.click(screen.getByRole('button', { name: 'Remove' }))
    const dialog = await screen.findByRole('alertdialog')
    await userEvent.click(
      within(dialog).getByRole('button', { name: 'Remove' }),
    )
    await waitFor(() =>
      expect(mockRemoveMember).toHaveBeenCalledWith('1', '11'),
    )
  })

  it('prompts to invite an owner when unclaimed', async () => {
    mockGetFamilies.mockResolvedValue([UNCLAIMED_FAMILY])
    mockGetMembers.mockResolvedValue([])
    await openDetail()
    expect(
      await screen.findByText(/Nobody owns this family yet/),
    ).toBeInTheDocument()
  })
})

describe('FamilyPage — invitations', () => {
  it('lists a pending invitation with a shareable link and revokes it', async () => {
    mockGetInvitations.mockResolvedValue([INVITE])
    mockRevokeInvitation.mockResolvedValue(undefined)
    await openDetail()

    expect(await screen.findByText('invitee@example.com')).toBeInTheDocument()
    expect(screen.getByDisplayValue(/\/invite\/tok-123$/)).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Revoke' }))
    await waitFor(() =>
      expect(mockRevokeInvitation).toHaveBeenCalledWith('1', '20'),
    )
  })

  it('creates an invitation with the chosen role', async () => {
    mockCreateInvitation.mockResolvedValue(INVITE)
    await openDetail()

    await userEvent.type(
      await screen.findByLabelText('Email'),
      'new@example.com',
    )
    await userEvent.selectOptions(screen.getByLabelText('Role'), 'owner')
    await userEvent.click(
      screen.getByRole('button', { name: 'Send invitation' }),
    )

    await waitFor(() =>
      expect(mockCreateInvitation).toHaveBeenCalledWith('1', {
        email: 'new@example.com',
        role: 'owner',
      }),
    )
  })

  it('copies the invite link', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.assign(navigator, { clipboard: { writeText } })
    mockGetInvitations.mockResolvedValue([INVITE])
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
    mockCreateFamily.mockResolvedValue({
      ...OWNER_FAMILY,
      id: '9',
      name: 'Nest',
    })
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
      expect(mockCreateFamily).toHaveBeenCalledWith({
        name: 'Nest',
        claim: true,
      }),
    )
  })

  it('creates an unclaimed family for someone else', async () => {
    mockCreateFamily.mockResolvedValue({ ...UNCLAIMED_FAMILY, id: '9' })
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
      expect(mockCreateFamily).toHaveBeenCalledWith({
        name: 'Gift',
        claim: false,
      }),
    )
  })

  it('renames a family', async () => {
    mockUpdateFamily.mockResolvedValue({ ...OWNER_FAMILY, name: 'Renamed' })
    await openDetail()

    await userEvent.click(screen.getByRole('button', { name: 'Rename' }))
    const nameField = screen.getByLabelText('Family name')
    await userEvent.clear(nameField)
    await userEvent.type(nameField, 'Renamed')
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() =>
      expect(mockUpdateFamily).toHaveBeenCalledWith('1', { name: 'Renamed' }),
    )
  })

  it('deletes a family after confirming', async () => {
    mockDeleteFamily.mockResolvedValue(undefined)
    await openDetail()

    await userEvent.click(screen.getByRole('button', { name: 'Delete family' }))
    const dialog = await screen.findByRole('alertdialog')
    await userEvent.click(
      within(dialog).getByRole('button', { name: 'Delete family' }),
    )
    await waitFor(() => expect(mockDeleteFamily).toHaveBeenCalledWith('1'))
  })

  it('leaves a family after confirming', async () => {
    mockLeaveFamily.mockResolvedValue(undefined)
    await openDetail()

    await userEvent.click(screen.getByRole('button', { name: 'Leave family' }))
    const dialog = await screen.findByRole('alertdialog')
    await userEvent.click(
      within(dialog).getByRole('button', { name: 'Leave family' }),
    )
    await waitFor(() => expect(mockLeaveFamily).toHaveBeenCalledWith('1'))
  })

  it('hides manage actions for a plain member', async () => {
    mockGetFamilies.mockResolvedValue([MEMBER_FAMILY])
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
