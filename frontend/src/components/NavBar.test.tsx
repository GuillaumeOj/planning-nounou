import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getMyContractInvitations } from '../api/contracts'
import { getMyInvitations } from '../api/family'
import { useAuth } from '../auth/AuthContext'
import { makeAuth, renderWithProviders } from '../test/utils'
import { NavBar } from './NavBar'

vi.mock('../auth/AuthContext', () => ({ useAuth: vi.fn() }))
vi.mock('../api/family', () => ({ getMyInvitations: vi.fn() }))
vi.mock('../api/contracts', () => ({ getMyContractInvitations: vi.fn() }))
const mockUseAuth = vi.mocked(useAuth)
const mockGetMyInvitations = vi.mocked(getMyInvitations)
const mockGetMyContractInvitations = vi.mocked(getMyContractInvitations)
const logout = vi.fn()

function setUser(overrides: Partial<Parameters<typeof makeAuth>[0]> = {}) {
  mockUseAuth.mockReturnValue(
    makeAuth({
      user: {
        id: 1,
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

  it('badges the Family link with the pending invitation count', async () => {
    mockGetMyInvitations.mockResolvedValue([
      {
        id: 1,
        family_name: 'Dupont',
        role: 'member',
        token: 't1',
        expires_at: '2026-01-08T00:00:00Z',
      },
      {
        id: 2,
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
        id: 1,
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
        id: 1,
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

    await userEvent.click(screen.getByText('Nounou'))
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
