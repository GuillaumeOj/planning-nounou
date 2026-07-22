import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { HttpResponse, http } from 'msw'
import { describe, expect, it } from 'vitest'
import ForgotPasswordPage from '@/src/pages/ForgotPasswordPage'
import { server } from '@/tests/msw/server'
import { renderWithProviders } from '@/tests/utils'

// POST /api/auth/users/reset_password/ — djoser's "send me a reset link" endpoint.
const RESET_PASSWORD = '*/api/auth/users/reset_password/'

function renderPage() {
  return renderWithProviders(<ForgotPasswordPage />)
}

describe('ForgotPasswordPage', () => {
  it('requests a reset and confirms it was sent', async () => {
    let body: unknown
    server.use(
      http.post(RESET_PASSWORD, async ({ request }) => {
        body = await request.json()
        return new HttpResponse(null, { status: 204 })
      }),
    )
    renderPage()

    await userEvent.type(screen.getByLabelText('Email'), 'x@example.com')
    await userEvent.click(
      screen.getByRole('button', { name: 'Send reset link' }),
    )

    await waitFor(() => expect(body).toMatchObject({ email: 'x@example.com' }))
    expect(
      await screen.findByText(
        'If an account exists for that email, a reset link is on its way.',
      ),
    ).toBeInTheDocument()
  })

  it('shows an error when the request fails', async () => {
    server.use(
      http.post(RESET_PASSWORD, () => new HttpResponse(null, { status: 500 })),
    )
    renderPage()

    await userEvent.type(screen.getByLabelText('Email'), 'x@example.com')
    await userEvent.click(
      screen.getByRole('button', { name: 'Send reset link' }),
    )

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Could not send the reset link',
    )
  })
})
