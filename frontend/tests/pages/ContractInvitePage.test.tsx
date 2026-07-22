import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { HttpResponse, http } from 'msw'
import { Provider } from 'react-redux'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ContractInvitationPreviewRead, FamilyRead } from '@/src/api'
import { makeStore } from '@/src/app/store'
import { useAuth } from '@/src/auth/AuthContext'
import { I18nProvider } from '@/src/i18n/I18nContext'
import ContractInvitePage from '@/src/pages/ContractInvitePage'
import { server } from '@/tests/msw/server'
import { makeAuth } from '@/tests/utils'

vi.mock('@/src/auth/AuthContext', () => ({ useAuth: vi.fn() }))

const mockUseAuth = vi.mocked(useAuth)

const PREVIEW: ContractInvitationPreviewRead = {
  email: 'invitee@example.com',
  status: 'pending',
  nanny_first_name: 'Marie',
  nanny_last_name: 'Dupont',
  expires_at: '2026-01-08T00:00:00Z',
}

const family = (
  id: string,
  name: string,
  role: string = 'owner',
): FamilyRead => ({
  id,
  name,
  role,
  is_claimed: true,
  created_at: '2026-01-01T00:00:00Z',
})

const PREVIEW_URL = '*/api/contract-invitations/:token/'
const ACCEPT_URL = '*/api/contract-invitations/:token/accept/'
const DECLINE_URL = '*/api/contract-invitations/:token/decline/'
const FAMILIES_URL = '*/api/families/'

function renderPage() {
  return render(
    <Provider store={makeStore()}>
      <I18nProvider>
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
      </I18nProvider>
    </Provider>,
  )
}

beforeEach(() => {
  mockUseAuth.mockReturnValue(makeAuth())
})

describe('ContractInvitePage', () => {
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
        HttpResponse.json({ ...PREVIEW, status: 'revoked' }),
      ),
    )
    renderPage()
    expect(
      await screen.findByText('This invitation is not valid or has expired.'),
    ).toBeInTheDocument()
  })

  describe('unauthenticated', () => {
    beforeEach(() => {
      mockUseAuth.mockReturnValue(makeAuth({ isAuthenticated: false }))
      server.use(http.get(PREVIEW_URL, () => HttpResponse.json(PREVIEW)))
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
      server.use(http.get(PREVIEW_URL, () => HttpResponse.json(PREVIEW)))
    })

    it('accepts with the sole managed family, then links to the nannies', async () => {
      server.use(
        http.get(FAMILIES_URL, () =>
          HttpResponse.json([family('f1', 'Dupont')]),
        ),
      )
      const accepted: { token?: string; family_id?: string } = {}
      server.use(
        http.post(ACCEPT_URL, async ({ request, params }) => {
          accepted.token = params.token as string
          accepted.family_id = (
            (await request.json()) as { family_id: string }
          ).family_id
          return HttpResponse.json({})
        }),
      )
      renderPage()

      await userEvent.click(
        await screen.findByRole('button', { name: 'Accept' }),
      )

      await waitFor(() =>
        expect(accepted).toEqual({ token: 'tok-123', family_id: 'f1' }),
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
      server.use(
        http.get(FAMILIES_URL, () =>
          HttpResponse.json([family('f1', 'Dupont'), family('f2', 'Martin')]),
        ),
      )
      const accepted: { family_id?: string } = {}
      server.use(
        http.post(ACCEPT_URL, async ({ request }) => {
          accepted.family_id = (
            (await request.json()) as { family_id: string }
          ).family_id
          return HttpResponse.json({})
        }),
      )
      renderPage()

      // Second family chosen explicitly; the first is the default.
      await userEvent.click(await screen.findByLabelText('Martin'))
      await userEvent.click(screen.getByRole('button', { name: 'Accept' }))

      await waitFor(() => expect(accepted.family_id).toBe('f2'))
    })

    it('shows an error when accepting fails', async () => {
      server.use(
        http.get(FAMILIES_URL, () =>
          HttpResponse.json([family('f1', 'Dupont')]),
        ),
        http.post(ACCEPT_URL, () => new HttpResponse(null, { status: 500 })),
      )
      renderPage()

      await userEvent.click(
        await screen.findByRole('button', { name: 'Accept' }),
      )
      expect(await screen.findByRole('alert')).toBeInTheDocument()
    })

    it('declines the invitation', async () => {
      server.use(
        http.get(FAMILIES_URL, () =>
          HttpResponse.json([family('f1', 'Dupont')]),
        ),
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

    it('surfaces an error when families fail to load, not a no-family prompt', async () => {
      server.use(
        http.get(FAMILIES_URL, () => new HttpResponse(null, { status: 500 })),
      )
      renderPage()

      expect(await screen.findByRole('alert')).toBeInTheDocument()
      expect(
        screen.queryByRole('button', { name: 'Create a family' }),
      ).not.toBeInTheDocument()
    })

    it('prompts to create a family when the user manages none', async () => {
      // A member-only family cannot own a shared contract, so it is filtered out.
      server.use(
        http.get(FAMILIES_URL, () =>
          HttpResponse.json([family('f1', 'Guest', 'member')]),
        ),
      )
      renderPage()

      await userEvent.click(
        await screen.findByRole('button', { name: 'Create a family' }),
      )
      expect(screen.getByText('family page')).toBeInTheDocument()
    })
  })
})
