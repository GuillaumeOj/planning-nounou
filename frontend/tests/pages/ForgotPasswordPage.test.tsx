import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { requestPasswordReset } from '@/src/api/auth'
import { I18nProvider } from '@/src/i18n/I18nContext'
import ForgotPasswordPage from '@/src/pages/ForgotPasswordPage'

vi.mock('@/src/api/auth', () => ({ requestPasswordReset: vi.fn() }))
const mockRequest = vi.mocked(requestPasswordReset)

function renderPage() {
  return render(
    <I18nProvider>
      <MemoryRouter>
        <ForgotPasswordPage />
      </MemoryRouter>
    </I18nProvider>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('ForgotPasswordPage', () => {
  it('requests a reset and confirms it was sent', async () => {
    mockRequest.mockResolvedValue(undefined)
    renderPage()

    await userEvent.type(screen.getByLabelText('Email'), 'x@example.com')
    await userEvent.click(
      screen.getByRole('button', { name: 'Send reset link' }),
    )

    await waitFor(() =>
      expect(mockRequest).toHaveBeenCalledWith('x@example.com'),
    )
    expect(
      await screen.findByText(
        'If an account exists for that email, a reset link is on its way.',
      ),
    ).toBeInTheDocument()
  })

  it('shows an error when the request fails', async () => {
    mockRequest.mockRejectedValue(new Error('nope'))
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
