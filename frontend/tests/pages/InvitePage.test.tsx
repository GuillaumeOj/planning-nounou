import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { HttpResponse, http } from 'msw'
import { Provider } from 'react-redux'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { InvitationPreviewRead } from '@/src/api'
import { makeStore } from '@/src/app/store'
import { useAuth } from '@/src/auth/AuthContext'
import { I18nProvider } from '@/src/i18n/I18nContext'
import InvitePage from '@/src/pages/InvitePage'
import { server } from '@/tests/msw/server'
import { makeAuth } from '@/tests/utils'

vi.mock('@/src/auth/AuthContext', () => ({ useAuth: vi.fn() }))

const mockUseAuth = vi.mocked(useAuth)
const register = vi.fn()

const PREVIEW: InvitationPreviewRead = {
  email: 'invitee@example.com',
  role: 'member',
  status: 'pending',
  family_name: 'Dupont',
  expires_at: '2026-01-08T00:00:00Z',
}

// The endpoints the page drives, keyed by the invite token. Registered per test
// so each can shape the preview and the accept/decline outcome.
const PREVIEW_URL = '*/api/invitations/:token/'
const ACCEPT_URL = '*/api/invitations/:token/accept/'
const DECLINE_URL = '*/api/invitations/:token/decline/'

function renderPage() {
  return render(
    <Provider store={makeStore()}>
      <I18nProvider>
        <MemoryRouter initialEntries={['/invite/tok-123']}>
          <Routes>
            <Route path="/invite/:token" element={<InvitePage />} />
            <Route path="/family" element={<p>family page</p>} />
            <Route path="/login" element={<p>login page</p>} />
          </Routes>
        </MemoryRouter>
      </I18nProvider>
    </Provider>,
  )
}

beforeEach(() => {
  mockUseAuth.mockReturnValue(makeAuth({ register }))
})

describe('InvitePage', () => {
  it('shows a loading state', () => {
    // A request that never settles keeps the query in its loading state.
    server.use(http.get(PREVIEW_URL, () => new Promise(() => {})))
    renderPage()
    expect(screen.getByText('Loading invitation…')).toBeInTheDocument()
  })

  it('shows an invalid message on error', async () => {
    server.use(
      http.get(PREVIEW_URL, () => new HttpResponse(null, { status: 500 })),
    )
    renderPage()
    expect(
      await screen.findByText('This invitation is not valid or has expired.'),
    ).toBeInTheDocument()
  })

  it('treats a non-pending invitation as invalid', async () => {
    server.use(
      http.get(PREVIEW_URL, () =>
        HttpResponse.json({ ...PREVIEW, status: 'accepted' }),
      ),
    )
    renderPage()
    expect(
      await screen.findByText('This invitation is not valid or has expired.'),
    ).toBeInTheDocument()
  })

  describe('authenticated', () => {
    beforeEach(() => {
      mockUseAuth.mockReturnValue(makeAuth({ isAuthenticated: true, register }))
      server.use(http.get(PREVIEW_URL, () => HttpResponse.json(PREVIEW)))
    })

    it('accepts the invitation and links to the families', async () => {
      server.use(
        http.post(ACCEPT_URL, () =>
          HttpResponse.json({
            id: '1',
            name: 'Dupont',
            role: 'member',
            is_claimed: true,
            created_at: '2026-01-01T00:00:00Z',
          }),
        ),
      )
      renderPage()

      await userEvent.click(
        await screen.findByRole('button', { name: 'Accept invitation' }),
      )
      expect(
        await screen.findByText("You've joined the family."),
      ).toBeInTheDocument()

      await userEvent.click(
        screen.getByRole('button', { name: 'Go to your families' }),
      )
      expect(screen.getByText('family page')).toBeInTheDocument()
    })

    it('shows an error when accepting fails', async () => {
      server.use(
        http.post(ACCEPT_URL, () => new HttpResponse(null, { status: 500 })),
      )
      renderPage()

      await userEvent.click(
        await screen.findByRole('button', { name: 'Accept invitation' }),
      )
      expect(await screen.findByRole('alert')).toBeInTheDocument()
    })

    it('declines the invitation', async () => {
      server.use(
        http.post(DECLINE_URL, () => new HttpResponse(null, { status: 204 })),
      )
      renderPage()

      await userEvent.click(
        await screen.findByRole('button', { name: 'Decline' }),
      )
      expect(
        await screen.findByText('Invitation declined.'),
      ).toBeInTheDocument()
    })
  })

  describe('unauthenticated', () => {
    beforeEach(() => {
      mockUseAuth.mockReturnValue(
        makeAuth({ isAuthenticated: false, register }),
      )
      server.use(http.get(PREVIEW_URL, () => HttpResponse.json(PREVIEW)))
    })

    it('registers and claims, then shows the verify-email step', async () => {
      register.mockResolvedValue({
        id: '1',
        email: 'invitee@example.com',
        first_name: '',
        last_name: '',
      })
      renderPage()

      const email = await screen.findByLabelText('Email')
      expect(email).toHaveValue('invitee@example.com')
      await userEvent.type(screen.getByLabelText('Password'), 'a-strong-pass')
      await userEvent.click(
        screen.getByRole('button', { name: 'Register & join' }),
      )

      await waitFor(() =>
        expect(register).toHaveBeenCalledWith(
          { email: 'invitee@example.com', password: 'a-strong-pass' },
          'tok-123',
        ),
      )
      // Membership is granted at registration, but the account is inactive until
      // the email is verified, so we show the "check your email" step.
      expect(await screen.findByText('Check your email')).toBeInTheDocument()
    })

    it('shows an error when registration fails', async () => {
      register.mockRejectedValue(new Error('taken'))
      renderPage()

      await screen.findByLabelText('Email')
      await userEvent.type(screen.getByLabelText('Password'), 'a-strong-pass')
      await userEvent.click(
        screen.getByRole('button', { name: 'Register & join' }),
      )

      expect(await screen.findByRole('alert')).toBeInTheDocument()
    })

    it('offers a link to log in', async () => {
      renderPage()
      expect(
        await screen.findByRole('link', { name: 'Log in to accept' }),
      ).toBeInTheDocument()
    })
  })
})
