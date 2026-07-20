import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getMyContractInvitations } from '@/src/api/contracts'
import { getMyInvitations } from '@/src/api/family'
import { useAuth } from '@/src/auth/AuthContext'
import { NavBar } from '@/src/components/NavBar'
import { makeAuth, renderWithProviders } from '@/tests/utils'

vi.mock('@/src/auth/AuthContext', () => ({ useAuth: vi.fn() }))
vi.mock('@/src/api/family', () => ({ getMyInvitations: vi.fn() }))
vi.mock('@/src/api/contracts', () => ({ getMyContractInvitations: vi.fn() }))
const mockUseAuth = vi.mocked(useAuth)
const mockGetMyInvitations = vi.mocked(getMyInvitations)
const mockGetMyContractInvitations = vi.mocked(getMyContractInvitations)
const logout = vi.fn()

function setUser(overrides: Partial<Parameters<typeof makeAuth>[0]> = {}) {
  mockUseAuth.mockReturnValue(
    makeAuth({
      user: {
        id: '1',
        email: 'me@example.com',
        first_name: 'Ada',
        last_name: 'Lovelace',
      },
      isAuthenticated: true,
      logout,
      ...overrides,
    }),
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  setUser()
  mockGetMyInvitations.mockResolvedValue([])
  mockGetMyContractInvitations.mockResolvedValue([])
})

describe('NavBar', () => {
  it('renders the primary navigation links', () => {
    renderWithProviders(<NavBar />)

    expect(screen.getByRole('link', { name: 'Home' })).toHaveAttribute(
      'href',
      '/',
    )
    expect(screen.getByRole('link', { name: 'Declarations' })).toHaveAttribute(
      'href',
      '/declarations',
    )
    expect(screen.getByRole('link', { name: 'Nannies' })).toHaveAttribute(
      'href',
      '/nannies',
    )
    expect(screen.getByRole('link', { name: 'Family' })).toHaveAttribute(
      'href',
      '/family',
    )
    expect(screen.getByRole('link', { name: 'Settings' })).toHaveAttribute(
      'href',
      '/settings',
    )
  })

  it('has no Days off link: days off are a Planning tab now', () => {
    renderWithProviders(<NavBar />)
    expect(
      screen.queryByRole('link', { name: 'Days off' }),
    ).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Planning' })).toHaveAttribute(
      'href',
      '/planning',
    )
  })

  it('badges the Family link with the pending invitation count', async () => {
    mockGetMyInvitations.mockResolvedValue([
      {
        id: '1',
        family_name: 'Dupont',
        role: 'member',
        token: 't1',
        expires_at: '2026-01-08T00:00:00Z',
      },
      {
        id: '2',
        family_name: 'Martin',
        role: 'owner',
        token: 't2',
        expires_at: '2026-01-08T00:00:00Z',
      },
    ])
    renderWithProviders(<NavBar />)

    expect(
      await screen.findByLabelText('Pending invitations'),
    ).toHaveTextContent('2')
  })

  it('badges the Nannies link with pending contract invitations', async () => {
    mockGetMyContractInvitations.mockResolvedValue([
      {
        id: '1',
        nanny_first_name: 'Marie',
        nanny_last_name: 'Dupont',
        token: 'c1',
        expires_at: '2026-01-08T00:00:00Z',
      },
    ])
    renderWithProviders(<NavBar />)

    expect(
      await screen.findByLabelText('Pending contract invitations'),
    ).toHaveTextContent('1')
  })

  it('shows no invitation badge when there are none', () => {
    renderWithProviders(<NavBar />)
    expect(
      screen.queryByLabelText('Pending invitations'),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByLabelText('Pending contract invitations'),
    ).not.toBeInTheDocument()
  })

  it('shows the first name on the account button', () => {
    renderWithProviders(<NavBar />)
    expect(
      screen.getByRole('button', { name: 'Account menu' }),
    ).toHaveTextContent('Ada')
  })

  it('falls back to the email when there is no first name', () => {
    setUser({
      user: {
        id: '1',
        email: 'me@example.com',
        first_name: '',
        last_name: '',
      },
    })
    renderWithProviders(<NavBar />)
    expect(
      screen.getByRole('button', { name: 'Account menu' }),
    ).toHaveTextContent('me@example.com')
  })

  it('opens the account menu and logs out', async () => {
    renderWithProviders(<NavBar />)
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Account menu' }))

    // Appearance controls live in the menu too.
    expect(screen.getByLabelText('Language')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('menuitem', { name: 'Log out' }))
    expect(logout).toHaveBeenCalled()
  })

  it('closes the menu on an outside click', async () => {
    renderWithProviders(<NavBar />)
    await userEvent.click(screen.getByRole('button', { name: 'Account menu' }))
    expect(screen.getByRole('menu')).toBeInTheDocument()

    // The brand also appears in the mobile top bar, so target the nav's copy.
    const nav = screen.getByRole('navigation')
    await userEvent.click(within(nav).getByText('Ma Garde Sereine'))
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  })

  it('closes the menu on Escape', async () => {
    renderWithProviders(<NavBar />)
    await userEvent.click(screen.getByRole('button', { name: 'Account menu' }))
    expect(screen.getByRole('menu')).toBeInTheDocument()

    await userEvent.keyboard('{Escape}')
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  })
})

// The drawer is shown/hidden with CSS, which jsdom does not apply, so these
// assert the state the styling keys off: aria-expanded on the burger.
describe('NavBar mobile drawer', () => {
  const burger = () => screen.getByRole('button', { name: 'Open the menu' })

  it('starts closed and opens from the burger', async () => {
    renderWithProviders(<NavBar />)
    expect(burger()).toHaveAttribute('aria-expanded', 'false')
    expect(burger()).toHaveAttribute('aria-controls', 'primary-nav')

    await userEvent.click(burger())
    expect(burger()).toHaveAttribute('aria-expanded', 'true')
  })

  it('closes from the drawer close button', async () => {
    renderWithProviders(<NavBar />)
    await userEvent.click(burger())

    await userEvent.click(
      screen.getByRole('button', { name: 'Close the menu' }),
    )
    expect(burger()).toHaveAttribute('aria-expanded', 'false')
  })

  it('closes on Escape', async () => {
    renderWithProviders(<NavBar />)
    await userEvent.click(burger())

    await userEvent.keyboard('{Escape}')
    expect(burger()).toHaveAttribute('aria-expanded', 'false')
  })

  it('closes once a link navigates away', async () => {
    renderWithProviders(<NavBar />)
    await userEvent.click(burger())

    await userEvent.click(screen.getByRole('link', { name: 'Planning' }))
    expect(burger()).toHaveAttribute('aria-expanded', 'false')
  })

  it('locks page scroll only while the drawer is open', async () => {
    renderWithProviders(<NavBar />)
    expect(document.body.style.overflow).toBe('')

    await userEvent.click(burger())
    expect(document.body.style.overflow).toBe('hidden')

    await userEvent.keyboard('{Escape}')
    expect(document.body.style.overflow).toBe('')
  })
})
