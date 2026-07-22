import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { HttpResponse, http } from 'msw'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useAuth } from '@/src/auth/AuthContext'
import SettingsPage from '@/src/pages/SettingsPage'
import { server } from '@/tests/msw/server'
import { makeAuth, renderWithProviders } from '@/tests/utils'

vi.mock('@/src/auth/AuthContext', () => ({ useAuth: vi.fn() }))

const mockUseAuth = vi.mocked(useAuth)
const refreshUser = vi.fn()

// Endpoints the three sections drive: profile via PATCH users/me, email via
// set_email, password via set_password. All go through MSW.
const ME = '*/api/auth/users/me/'
const SET_EMAIL = '*/api/auth/users/set_email/'
const SET_PASSWORD = '*/api/auth/users/set_password/'

function renderPage() {
  return renderWithProviders(<SettingsPage />)
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
      refreshUser,
    }),
  )
})

describe('SettingsPage — sections', () => {
  it('shows the profile, email, and password sections', () => {
    renderPage()

    expect(screen.getByRole('heading', { name: 'Profile' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Email' })).toBeInTheDocument()
    expect(
      screen.getByRole('heading', { name: 'Password' }),
    ).toBeInTheDocument()
  })
})

describe('SettingsPage — profile', () => {
  it('updates the names and refreshes the user', async () => {
    let body: unknown
    server.use(
      http.patch(ME, async ({ request }) => {
        body = await request.json()
        return HttpResponse.json({
          id: '1',
          email: 'me@example.com',
          first_name: 'Grace',
          last_name: 'Hopper',
        })
      }),
    )
    renderPage()

    const firstName = screen.getByLabelText('First name')
    await userEvent.clear(firstName)
    await userEvent.type(firstName, 'Grace')
    await userEvent.click(screen.getByRole('button', { name: 'Save profile' }))

    await waitFor(() =>
      expect(body).toMatchObject({
        first_name: 'Grace',
        last_name: 'Lovelace',
      }),
    )
    expect(refreshUser).toHaveBeenCalled()
    expect(await screen.findByText('Profile updated.')).toBeInTheDocument()
  })

  it('shows an error when the profile update fails', async () => {
    server.use(http.patch(ME, () => new HttpResponse(null, { status: 500 })))
    renderPage()

    await userEvent.click(screen.getByRole('button', { name: 'Save profile' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Could not update profile',
    )
  })
})

describe('SettingsPage — email', () => {
  it('confirms with the password in a dialog and changes the email', async () => {
    let body: unknown
    server.use(
      http.post(SET_EMAIL, async ({ request }) => {
        body = await request.json()
        return new HttpResponse(null, { status: 204 })
      }),
    )
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
      expect(body).toMatchObject({
        current_password: 'my-current-pass',
        new_email: 'new@example.com',
      }),
    )
    // set_email replies 204, so the page updates the cached user locally with
    // the new email — no refetch round-trip.
    expect(refreshUser).toHaveBeenCalledWith({
      id: '1',
      email: 'new@example.com',
      first_name: 'Ada',
      last_name: 'Lovelace',
    })
    expect(await screen.findByText('Email updated.')).toBeInTheDocument()
    expect(
      screen.queryByRole('dialog', { name: 'Confirm your password' }),
    ).not.toBeInTheDocument()
  })

  it('cancels the dialog without changing the email', async () => {
    let called = false
    server.use(
      http.post(SET_EMAIL, () => {
        called = true
        return new HttpResponse(null, { status: 204 })
      }),
    )
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
    expect(called).toBe(false)
  })

  it('shows an error in the dialog when the password is wrong', async () => {
    server.use(
      http.post(SET_EMAIL, () => new HttpResponse(null, { status: 400 })),
    )
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
    let body: unknown
    server.use(
      http.post(SET_PASSWORD, async ({ request }) => {
        body = await request.json()
        return new HttpResponse(null, { status: 204 })
      }),
    )
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
      expect(body).toMatchObject({
        current_password: 'my-current-pass',
        new_password: 'a-brand-new-pass',
      }),
    )
    expect(await screen.findByText('Password updated.')).toBeInTheDocument()
  })
})
