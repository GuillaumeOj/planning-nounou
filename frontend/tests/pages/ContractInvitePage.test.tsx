import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  acceptContractInvitation,
  declineContractInvitation,
  getContractInvitationPreview,
} from '@/src/api/contracts'
import { getFamilies } from '@/src/api/family'
import { useAuth } from '@/src/auth/AuthContext'
import { I18nProvider } from '@/src/i18n/I18nContext'
import ContractInvitePage from '@/src/pages/ContractInvitePage'
import { makeAuth } from '@/tests/utils'

vi.mock('@/src/api/contracts', () => ({
  getContractInvitationPreview: vi.fn(),
  acceptContractInvitation: vi.fn(),
  declineContractInvitation: vi.fn(),
}))
// Keep the real canManageFamily (a pure filter); only stub the network call.
vi.mock('@/src/api/family', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/src/api/family')>()),
  getFamilies: vi.fn(),
}))
vi.mock('@/src/auth/AuthContext', () => ({ useAuth: vi.fn() }))

const mockPreview = vi.mocked(getContractInvitationPreview)
const mockAccept = vi.mocked(acceptContractInvitation)
const mockDecline = vi.mocked(declineContractInvitation)
const mockFamilies = vi.mocked(getFamilies)
const mockUseAuth = vi.mocked(useAuth)

const PREVIEW = {
  email: 'invitee@example.com',
  status: 'pending' as const,
  nanny_first_name: 'Marie',
  nanny_last_name: 'Dupont',
  expires_at: '2026-01-08T00:00:00Z',
}

const family = (id: string, name: string) => ({
  id,
  name,
  role: 'owner' as const,
  is_claimed: true,
  created_at: '2026-01-01T00:00:00Z',
})

function renderPage() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return render(
    <I18nProvider>
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={['/contract-invite/tok-123']}>
          <Routes>
            <Route
              path="/contract-invite/:token"
              element={<ContractInvitePage />}
            />
            <Route path="/nannies" element={<p>nannies page</p>} />
            <Route path="/family" element={<p>family page</p>} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    </I18nProvider>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  mockUseAuth.mockReturnValue(makeAuth())
})

describe('ContractInvitePage', () => {
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
    mockPreview.mockResolvedValue({ ...PREVIEW, status: 'revoked' })
    renderPage()
    expect(
      await screen.findByText('This invitation is not valid or has expired.'),
    ).toBeInTheDocument()
  })

  describe('unauthenticated', () => {
    beforeEach(() => {
      mockUseAuth.mockReturnValue(makeAuth({ isAuthenticated: false }))
      mockPreview.mockResolvedValue(PREVIEW)
    })

    it('offers register and login links carrying the invite as ?next=', async () => {
      renderPage()

      const encoded = encodeURIComponent('/contract-invite/tok-123')
      expect(
        await screen.findByRole('link', { name: 'Create an account' }),
      ).toHaveAttribute('href', `/register?next=${encoded}`)
      expect(screen.getByRole('link', { name: 'Log in' })).toHaveAttribute(
        'href',
        `/login?next=${encoded}`,
      )
    })
  })

  describe('authenticated', () => {
    beforeEach(() => {
      mockUseAuth.mockReturnValue(makeAuth({ isAuthenticated: true }))
      mockPreview.mockResolvedValue(PREVIEW)
    })

    it('accepts with the sole managed family, then links to the nannies', async () => {
      mockFamilies.mockResolvedValue([family('f1', 'Dupont')])
      mockAccept.mockResolvedValue({} as never)
      renderPage()

      await userEvent.click(
        await screen.findByRole('button', { name: 'Accept' }),
      )

      await waitFor(() =>
        expect(mockAccept).toHaveBeenCalledWith('tok-123', 'f1'),
      )
      expect(
        await screen.findByText('The contract is now shared with your family.'),
      ).toBeInTheDocument()

      await userEvent.click(
        screen.getByRole('button', { name: 'Go to your nannies' }),
      )
      expect(screen.getByText('nannies page')).toBeInTheDocument()
    })

    it('lets the user pick among several families before accepting', async () => {
      mockFamilies.mockResolvedValue([
        family('f1', 'Dupont'),
        family('f2', 'Martin'),
      ])
      mockAccept.mockResolvedValue({} as never)
      renderPage()

      // Second family chosen explicitly; the first is the default.
      await userEvent.click(await screen.findByLabelText('Martin'))
      await userEvent.click(screen.getByRole('button', { name: 'Accept' }))

      await waitFor(() =>
        expect(mockAccept).toHaveBeenCalledWith('tok-123', 'f2'),
      )
    })

    it('shows an error when accepting fails', async () => {
      mockFamilies.mockResolvedValue([family('f1', 'Dupont')])
      mockAccept.mockRejectedValue(new Error('nope'))
      renderPage()

      await userEvent.click(
        await screen.findByRole('button', { name: 'Accept' }),
      )
      expect(await screen.findByRole('alert')).toBeInTheDocument()
    })

    it('declines the invitation', async () => {
      mockFamilies.mockResolvedValue([family('f1', 'Dupont')])
      mockDecline.mockResolvedValue(undefined)
      renderPage()

      await userEvent.click(
        await screen.findByRole('button', { name: 'Decline' }),
      )
      expect(
        await screen.findByText('Invitation declined.'),
      ).toBeInTheDocument()
    })

    it('surfaces an error when families fail to load, not a no-family prompt', async () => {
      mockFamilies.mockRejectedValue(new Error('down'))
      renderPage()

      expect(await screen.findByRole('alert')).toBeInTheDocument()
      expect(
        screen.queryByRole('button', { name: 'Create a family' }),
      ).not.toBeInTheDocument()
    })

    it('prompts to create a family when the user manages none', async () => {
      // A member-only family cannot own a shared contract, so it is filtered out.
      mockFamilies.mockResolvedValue([
        { ...family('f1', 'Guest'), role: 'member' as const },
      ])
      renderPage()

      await userEvent.click(
        await screen.findByRole('button', { name: 'Create a family' }),
      )
      expect(screen.getByText('family page')).toBeInTheDocument()
    })
  })
})
