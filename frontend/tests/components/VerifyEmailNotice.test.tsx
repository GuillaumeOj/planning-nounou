import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { HttpResponse, http } from 'msw'
import { describe, expect, it } from 'vitest'
import { VerifyEmailNotice } from '@/src/components/VerifyEmailNotice'
import { server } from '@/tests/msw/server'
import { renderWithProviders } from '@/tests/utils'

// Resending the activation email posts here (see src/api/generated.ts).
const RESEND = '*/api/auth/users/resend_activation/'

function renderNotice(props: {
  email: string
  inline?: boolean
  next?: string
}) {
  return renderWithProviders(<VerifyEmailNotice {...props} />)
}

describe('VerifyEmailNotice', () => {
  it('shows the target email and a back-to-login link', () => {
    renderNotice({ email: 'new@example.com' })

    expect(screen.getByText('Check your email')).toBeInTheDocument()
    expect(screen.getByText('new@example.com')).toBeInTheDocument()
    expect(
      screen.getByRole('link', { name: 'Back to log in' }),
    ).toHaveAttribute('href', '/login')
  })

  it('carries a next target into the back-to-login link', () => {
    renderNotice({ email: 'new@example.com', next: '/contract-invite/abc' })

    expect(
      screen.getByRole('link', { name: 'Back to log in' }),
    ).toHaveAttribute(
      'href',
      `/login?next=${encodeURIComponent('/contract-invite/abc')}`,
    )
  })

  it('resends the activation email on demand', async () => {
    // Capture the posted body so we can assert the email it carries — the MSW
    // equivalent of the old `expect(mockResend).toHaveBeenCalledWith(...)`.
    let sent: unknown
    server.use(
      http.post(RESEND, async ({ request }) => {
        sent = await request.json()
        return new HttpResponse(null, { status: 204 })
      }),
    )
    renderNotice({ email: 'new@example.com' })

    await userEvent.click(
      screen.getByRole('button', { name: 'Resend the email' }),
    )

    await waitFor(() =>
      expect(sent).toMatchObject({ email: 'new@example.com' }),
    )
    expect(
      await screen.findByText('Verification email sent again.'),
    ).toBeInTheDocument()
  })

  it('surfaces an error when the resend fails', async () => {
    // A 500 with no body carries no field messages, so the UI shows the fallback.
    server.use(http.post(RESEND, () => new HttpResponse(null, { status: 500 })))
    renderNotice({ email: 'new@example.com' })

    await userEvent.click(
      screen.getByRole('button', { name: 'Resend the email' }),
    )

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Could not resend the email',
    )
  })
})
