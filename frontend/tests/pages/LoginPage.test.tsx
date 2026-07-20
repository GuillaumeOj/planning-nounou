import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useAuth } from '@/src/auth/AuthContext'
import LoginPage from '@/src/pages/LoginPage'
import { makeAuth, renderWithProviders } from '@/tests/utils'

const mockNavigate = vi.fn()
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>()
  return { ...actual, useNavigate: () => mockNavigate }
})

vi.mock('@/src/auth/AuthContext', () => ({ useAuth: vi.fn() }))
const mockUseAuth = vi.mocked(useAuth)
const login = vi.fn()

beforeEach(() => {
  vi.clearAllMocks()
  mockUseAuth.mockReturnValue(makeAuth({ login }))
})

function renderPage() {
  return renderWithProviders(<LoginPage />)
}

describe('LoginPage', () => {
  it('submits credentials and navigates to the dashboard on success', async () => {
    login.mockResolvedValue(undefined)
    renderPage()

    await userEvent.type(screen.getByLabelText('Email'), 'x@example.com')
    await userEvent.type(screen.getByLabelText('Password'), 'secret-pass')
    await userEvent.click(screen.getByRole('button', { name: 'Log in' }))

    await waitFor(() =>
      expect(login).toHaveBeenCalledWith({
        email: 'x@example.com',
        password: 'secret-pass',
      }),
    )
    expect(mockNavigate).toHaveBeenCalledWith('/dashboard')
  })

  it('shows an error message when login fails', async () => {
    login.mockRejectedValue(new Error('bad'))
    renderPage()

    await userEvent.type(screen.getByLabelText('Email'), 'x@example.com')
    await userEvent.type(screen.getByLabelText('Password'), 'wrong-pass')
    await userEvent.click(screen.getByRole('button', { name: 'Log in' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Invalid email or password',
    )
    expect(mockNavigate).not.toHaveBeenCalled()
  })
})
