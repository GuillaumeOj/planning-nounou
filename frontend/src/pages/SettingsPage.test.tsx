import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { changeEmail, changePassword, updateProfile } from '../api/auth'
import {
  createChild,
  deleteChild,
  listChildren,
  updateChild,
} from '../api/children'
import { useAuth } from '../auth/AuthContext'
import { I18nProvider } from '../i18n/I18nContext'
import { makeAuth } from '../test/utils'
import SettingsPage from './SettingsPage'

vi.mock('../api/auth', () => ({
  updateProfile: vi.fn(),
  changeEmail: vi.fn(),
  changePassword: vi.fn(),
}))
vi.mock('../api/children', () => ({
  listChildren: vi.fn(),
  createChild: vi.fn(),
  updateChild: vi.fn(),
  deleteChild: vi.fn(),
}))
vi.mock('../auth/AuthContext', () => ({ useAuth: vi.fn() }))

const mockUseAuth = vi.mocked(useAuth)
const mockUpdateProfile = vi.mocked(updateProfile)
const mockChangeEmail = vi.mocked(changeEmail)
const mockChangePassword = vi.mocked(changePassword)
const mockListChildren = vi.mocked(listChildren)
const mockCreateChild = vi.mocked(createChild)
const mockUpdateChild = vi.mocked(updateChild)
const mockDeleteChild = vi.mocked(deleteChild)
const refreshUser = vi.fn()

function renderPage() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  function wrapper({ children }: { children: ReactNode }) {
    return (
      <I18nProvider>
        <QueryClientProvider client={client}>{children}</QueryClientProvider>
      </I18nProvider>
    )
  }
  return render(<SettingsPage />, { wrapper })
}

// Switch to the Children tab and wait for the list to settle.
async function openChildrenTab() {
  await userEvent.click(screen.getByRole('tab', { name: 'Children' }))
}

beforeEach(() => {
  vi.clearAllMocks()
  mockUseAuth.mockReturnValue(
    makeAuth({
      user: {
        id: 1,
        email: 'me@example.com',
        first_name: 'Ada',
        last_name: 'Lovelace',
      },
      isAuthenticated: true,
      refreshUser,
    }),
  )
  mockListChildren.mockResolvedValue([{ id: 5, first_name: 'Leo' }])
})

describe('SettingsPage — tabs', () => {
  it('shows the Information tab by default and switches to Children', async () => {
    renderPage()

    expect(screen.getByRole('heading', { name: 'Profile' })).toBeInTheDocument()
    expect(
      screen.queryByRole('heading', { name: 'Children' }),
    ).not.toBeInTheDocument()

    await openChildrenTab()

    expect(
      screen.getByRole('heading', { name: 'Children' }),
    ).toBeInTheDocument()
    expect(
      screen.queryByRole('heading', { name: 'Profile' }),
    ).not.toBeInTheDocument()
  })
})

describe('SettingsPage — profile', () => {
  it('updates the names and refreshes the user', async () => {
    mockUpdateProfile.mockResolvedValue({
      id: 1,
      email: 'me@example.com',
      first_name: 'Grace',
      last_name: 'Hopper',
    })
    renderPage()

    const firstName = screen.getByLabelText('First name')
    await userEvent.clear(firstName)
    await userEvent.type(firstName, 'Grace')
    await userEvent.click(screen.getByRole('button', { name: 'Save profile' }))

    await waitFor(() =>
      expect(mockUpdateProfile).toHaveBeenCalledWith({
        first_name: 'Grace',
        last_name: 'Lovelace',
      }),
    )
    expect(refreshUser).toHaveBeenCalled()
    expect(await screen.findByText('Profile updated.')).toBeInTheDocument()
  })

  it('shows an error when the profile update fails', async () => {
    mockUpdateProfile.mockRejectedValue(new Error('nope'))
    renderPage()

    await userEvent.click(screen.getByRole('button', { name: 'Save profile' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Could not update profile',
    )
  })
})

describe('SettingsPage — email', () => {
  it('confirms with the password in a dialog and changes the email', async () => {
    mockChangeEmail.mockResolvedValue({
      id: 1,
      email: 'new@example.com',
      first_name: 'Ada',
      last_name: 'Lovelace',
    })
    renderPage()

    await userEvent.type(screen.getByLabelText('New email'), 'new@example.com')
    await userEvent.click(screen.getByRole('button', { name: 'Change email' }))

    const dialog = screen.getByRole('dialog', {
      name: 'Confirm your password',
    })
    await userEvent.type(
      within(dialog).getByLabelText('Current password'),
      'my-current-pass',
    )
    await userEvent.click(
      within(dialog).getByRole('button', { name: 'Confirm' }),
    )

    await waitFor(() =>
      expect(mockChangeEmail).toHaveBeenCalledWith({
        current_password: 'my-current-pass',
        email: 'new@example.com',
      }),
    )
    expect(refreshUser).toHaveBeenCalled()
    expect(await screen.findByText('Email updated.')).toBeInTheDocument()
    expect(
      screen.queryByRole('dialog', { name: 'Confirm your password' }),
    ).not.toBeInTheDocument()
  })

  it('cancels the dialog without changing the email', async () => {
    renderPage()

    await userEvent.type(screen.getByLabelText('New email'), 'new@example.com')
    await userEvent.click(screen.getByRole('button', { name: 'Change email' }))

    const dialog = screen.getByRole('dialog', {
      name: 'Confirm your password',
    })
    await userEvent.click(
      within(dialog).getByRole('button', { name: 'Cancel' }),
    )

    expect(
      screen.queryByRole('dialog', { name: 'Confirm your password' }),
    ).not.toBeInTheDocument()
    expect(mockChangeEmail).not.toHaveBeenCalled()
  })

  it('shows an error in the dialog when the password is wrong', async () => {
    mockChangeEmail.mockRejectedValue(new Error('bad password'))
    renderPage()

    await userEvent.type(screen.getByLabelText('New email'), 'new@example.com')
    await userEvent.click(screen.getByRole('button', { name: 'Change email' }))

    const dialog = screen.getByRole('dialog', {
      name: 'Confirm your password',
    })
    await userEvent.type(
      within(dialog).getByLabelText('Current password'),
      'wrong-pass',
    )
    await userEvent.click(
      within(dialog).getByRole('button', { name: 'Confirm' }),
    )

    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      'Could not change email',
    )
  })
})

describe('SettingsPage — password', () => {
  it('changes the password', async () => {
    mockChangePassword.mockResolvedValue(undefined)
    renderPage()

    await userEvent.type(
      screen.getByLabelText('Current password'),
      'my-current-pass',
    )
    await userEvent.type(
      screen.getByLabelText('New password'),
      'a-brand-new-pass',
    )
    await userEvent.click(
      screen.getByRole('button', { name: 'Change password' }),
    )

    await waitFor(() =>
      expect(mockChangePassword).toHaveBeenCalledWith({
        current_password: 'my-current-pass',
        new_password: 'a-brand-new-pass',
      }),
    )
    expect(await screen.findByText('Password updated.')).toBeInTheDocument()
  })
})

describe('SettingsPage — children', () => {
  it('lists existing children', async () => {
    renderPage()
    await openChildrenTab()

    const row = await screen.findByRole('listitem')
    expect(within(row).getByRole('textbox')).toHaveValue('Leo')
  })

  it('adds a child', async () => {
    mockCreateChild.mockResolvedValue({ id: 6, first_name: 'Mia' })
    renderPage()
    await openChildrenTab()
    await screen.findByRole('listitem')

    await userEvent.type(
      screen.getByLabelText('First name', {
        selector: 'input[name="first_name"]',
      }),
      'Mia',
    )
    await userEvent.click(screen.getByRole('button', { name: 'Add child' }))

    await waitFor(() => expect(mockCreateChild).toHaveBeenCalledWith('Mia'))
  })

  it('renames a child', async () => {
    mockUpdateChild.mockResolvedValue({ id: 5, first_name: 'Leon' })
    renderPage()
    await openChildrenTab()
    const row = await screen.findByRole('listitem')

    await userEvent.type(within(row).getByRole('textbox'), 'n')
    await userEvent.click(within(row).getByRole('button', { name: 'Save' }))

    await waitFor(() => expect(mockUpdateChild).toHaveBeenCalledWith(5, 'Leon'))
  })

  it('deletes a child', async () => {
    mockDeleteChild.mockResolvedValue(undefined)
    renderPage()
    await openChildrenTab()
    const row = await screen.findByRole('listitem')

    await userEvent.click(within(row).getByRole('button', { name: 'Delete' }))

    await waitFor(() => expect(mockDeleteChild).toHaveBeenCalledWith(5))
  })

  it('shows the empty state when there are no children', async () => {
    mockListChildren.mockResolvedValue([])
    renderPage()
    await openChildrenTab()

    expect(await screen.findByText('No children yet.')).toBeInTheDocument()
  })

  it('shows an error when adding a child fails', async () => {
    mockCreateChild.mockRejectedValue(new Error('boom'))
    renderPage()
    await openChildrenTab()
    await screen.findByRole('listitem')

    await userEvent.type(
      screen.getByLabelText('First name', {
        selector: 'input[name="first_name"]',
      }),
      'Mia',
    )
    await userEvent.click(screen.getByRole('button', { name: 'Add child' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Could not save children',
    )
  })

  it('reports a loading error from the list query', async () => {
    mockListChildren.mockRejectedValue(new Error('down'))
    renderPage()
    await openChildrenTab()

    await waitFor(() =>
      expect(screen.getByText('Could not save children')).toBeInTheDocument(),
    )
  })
})
