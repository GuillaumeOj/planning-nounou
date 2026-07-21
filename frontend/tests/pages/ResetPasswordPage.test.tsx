import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { confirmPasswordReset } from '@/src/api/auth'
import { I18nProvider } from '@/src/i18n/I18nContext'
import ResetPasswordPage from '@/src/pages/ResetPasswordPage'

vi.mock('@/src/api/auth', () => ({ confirmPasswordReset: vi.fn() }))
const mockConfirm = vi.mocked(confirmPasswordReset)

function renderPage() {
  return render(
    <I18nProvider>
      <MemoryRouter initialEntries={['/reset-password/uid-1/tok-1']}>
        <Routes>
          <Route
            path="/reset-password/:uid/:token"
            element={<ResetPasswordPage />}
          />
        </Routes>
      </MemoryRouter>
    </I18nProvider>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('ResetPasswordPage', () => {
  it('confirms the reset with the uid and token from the URL', async () => {
    mockConfirm.mockResolvedValue(undefined)
    renderPage()

    await userEvent.type(
      screen.getByLabelText('New password'),
      'a-brand-new-pass',
    )
    await userEvent.click(
      screen.getByRole('button', { name: 'Update password' }),
    )

    await waitFor(() =>
      expect(mockConfirm).toHaveBeenCalledWith({
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
    mockConfirm.mockRejectedValue(new Error('bad token'))
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
