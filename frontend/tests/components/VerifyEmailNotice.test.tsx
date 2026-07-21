import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { resendActivation } from '@/src/api/auth'
import { VerifyEmailNotice } from '@/src/components/VerifyEmailNotice'
import { I18nProvider } from '@/src/i18n/I18nContext'

vi.mock('@/src/api/auth', () => ({ resendActivation: vi.fn() }))
const mockResend = vi.mocked(resendActivation)

function renderNotice(props: {
  email: string
  inline?: boolean
  next?: string
}) {
  return render(
    <I18nProvider>
      <MemoryRouter>
        <VerifyEmailNotice {...props} />
      </MemoryRouter>
    </I18nProvider>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
})

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
    mockResend.mockResolvedValue(undefined)
    renderNotice({ email: 'new@example.com' })

    await userEvent.click(
      screen.getByRole('button', { name: 'Resend the email' }),
    )

    await waitFor(() =>
      expect(mockResend).toHaveBeenCalledWith('new@example.com'),
    )
    expect(
      await screen.findByText('Verification email sent again.'),
    ).toBeInTheDocument()
  })

  it('surfaces an error when the resend fails', async () => {
    mockResend.mockRejectedValue(new Error('nope'))
    renderNotice({ email: 'new@example.com' })

    await userEvent.click(
      screen.getByRole('button', { name: 'Resend the email' }),
    )

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Could not resend the email',
    )
  })
})
