import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  acceptInvitation,
  declineInvitation,
  getInvitationPreview,
} from '../api/family'
import { useAuth } from '../auth/AuthContext'
import { I18nProvider } from '../i18n/I18nContext'
import { makeAuth } from '../test/utils'
import InvitePage from './InvitePage'

vi.mock('../api/family', () => ({
  getInvitationPreview: vi.fn(),
  acceptInvitation: vi.fn(),
  declineInvitation: vi.fn(),
}))
vi.mock('../auth/AuthContext', () => ({ useAuth: vi.fn() }))

const mockPreview = vi.mocked(getInvitationPreview)
const mockAccept = vi.mocked(acceptInvitation)
const mockDecline = vi.mocked(declineInvitation)
const mockUseAuth = vi.mocked(useAuth)
const register = vi.fn()

const PREVIEW = {
  email: 'invitee@example.com',
  role: 'member' as const,
  status: 'pending' as const,
  family_name: 'Dupont',
  expires_at: '2026-01-08T00:00:00Z',
}

function renderPage() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return render(
    <I18nProvider>
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={['/invite/tok-123']}>
          <Routes>
            <Route path="/invite/:token" element={<InvitePage />} />
            <Route path="/family" element={<p>family page</p>} />
            <Route path="/login" element={<p>login page</p>} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    </I18nProvider>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  mockUseAuth.mockReturnValue(makeAuth({ register }))
})

describe('InvitePage', () => {
  it('shows a loading state', () => {
    mockPreview.mockReturnValue(new Promise(() => {}))
    renderPage()
    expect(screen.getByText('Loading invitation…')).toBeInTheDocument()
  })

  it('shows an invalid message on error', async () => {
    mockPreview.mockRejectedValue(new Error('gone'))
    renderPage()
    expect(
      await screen.findByText('This invitation is not valid or has expired.'),
    ).toBeInTheDocument()
  })

  it('treats a non-pending invitation as invalid', async () => {
    mockPreview.mockResolvedValue({ ...PREVIEW, status: 'accepted' })
    renderPage()
    expect(
      await screen.findByText('This invitation is not valid or has expired.'),
    ).toBeInTheDocument()
  })

  describe('authenticated', () => {
    beforeEach(() => {
      mockUseAuth.mockReturnValue(makeAuth({ isAuthenticated: true, register }))
      mockPreview.mockResolvedValue(PREVIEW)
    })

    it('accepts the invitation and links to the families', async () => {
      mockAccept.mockResolvedValue({
        id: '1',
        name: 'Dupont',
        role: 'member',
        is_claimed: true,
        created_at: '2026-01-01T00:00:00Z',
      })
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
      mockAccept.mockRejectedValue(new Error('nope'))
      renderPage()

      await userEvent.click(
        await screen.findByRole('button', { name: 'Accept invitation' }),
      )
      expect(await screen.findByRole('alert')).toBeInTheDocument()
    })

    it('declines the invitation', async () => {
      mockDecline.mockResolvedValue(undefined)
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
      mockPreview.mockResolvedValue(PREVIEW)
    })

    it('registers and claims, then navigates to the families', async () => {
      register.mockResolvedValue(undefined)
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
      expect(await screen.findByText('family page')).toBeInTheDocument()
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
