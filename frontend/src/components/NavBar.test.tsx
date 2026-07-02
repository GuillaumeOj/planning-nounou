import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useAuth } from '../auth/AuthContext'
import { makeAuth, renderWithProviders } from '../test/utils'
import { NavBar } from './NavBar'

vi.mock('../auth/AuthContext', () => ({ useAuth: vi.fn() }))
const mockUseAuth = vi.mocked(useAuth)
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
})

describe('NavBar', () => {
  it('renders the primary navigation links', () => {
    renderWithProviders(<NavBar />)

    expect(screen.getByRole('link', { name: 'Home' })).toHaveAttribute(
      'href',
      '/',
    )
    expect(screen.getByRole('link', { name: 'Settings' })).toHaveAttribute(
      'href',
      '/settings',
    )
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
