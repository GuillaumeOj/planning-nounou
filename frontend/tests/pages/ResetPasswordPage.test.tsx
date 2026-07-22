import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { HttpResponse, http } from 'msw'
import { Route, Routes } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import ResetPasswordPage from '@/src/pages/ResetPasswordPage'
import { server } from '@/tests/msw/server'
import { renderWithProviders } from '@/tests/utils'

// POST /api/auth/users/reset_password_confirm/ — djoser's reset-confirmation endpoint.
const RESET_CONFIRM = '*/api/auth/users/reset_password_confirm/'

function renderPage() {
  return renderWithProviders(
    <Routes>
      <Route
        path="/reset-password/:uid/:token"
        element={<ResetPasswordPage />}
      />
    </Routes>,
    { route: '/reset-password/uid-1/tok-1' },
  )
}

describe('ResetPasswordPage', () => {
  it('confirms the reset with the uid and token from the URL', async () => {
    let body: unknown
    server.use(
      http.post(RESET_CONFIRM, async ({ request }) => {
        body = await request.json()
        return new HttpResponse(null, { status: 204 })
      }),
    )
    renderPage()

    await userEvent.type(
      screen.getByLabelText('New password'),
      'a-brand-new-pass',
    )
    await userEvent.click(
      screen.getByRole('button', { name: 'Update password' }),
    )

    await waitFor(() =>
      expect(body).toMatchObject({
        uid: 'uid-1',
        token: 'tok-1',
        new_password: 'a-brand-new-pass',
      }),
    )
    expect(
      await screen.findByText(
        'Your password has been updated. You can now log in.',
      ),
    ).toBeInTheDocument()
  })

  it('shows an error when the link is invalid or expired', async () => {
    server.use(
      http.post(RESET_CONFIRM, () => new HttpResponse(null, { status: 400 })),
    )
    renderPage()

    await userEvent.type(screen.getByLabelText('New password'), 'x')
    await userEvent.click(
      screen.getByRole('button', { name: 'Update password' }),
    )

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Could not reset your password. The link may have expired.',
    )
  })
})
