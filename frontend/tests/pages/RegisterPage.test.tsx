import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useAuth } from '@/src/auth/AuthContext'
import RegisterPage from '@/src/pages/RegisterPage'
import { makeAuth, renderWithProviders } from '@/tests/utils'

const mockNavigate = vi.fn()
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>()
  return { ...actual, useNavigate: () => mockNavigate }
})

vi.mock('@/src/auth/AuthContext', () => ({ useAuth: vi.fn() }))
const mockUseAuth = vi.mocked(useAuth)
const register = vi.fn()

beforeEach(() => {
  vi.clearAllMocks()
  mockUseAuth.mockReturnValue(makeAuth({ register }))
})

function renderPage() {
  return renderWithProviders(<RegisterPage />)
}

describe('RegisterPage', () => {
  it('registers and shows the verify-email step on success', async () => {
    register.mockResolvedValue({
      id: '1',
      email: 'new@example.com',
      first_name: '',
      last_name: '',
    })
    renderPage()

    await userEvent.type(screen.getByLabelText('Email'), 'new@example.com')
    await userEvent.type(screen.getByLabelText('Password'), 'secret-pass')
    await userEvent.click(screen.getByRole('button', { name: 'Register' }))

    await waitFor(() =>
      expect(register).toHaveBeenCalledWith({
        email: 'new@example.com',
        password: 'secret-pass',
      }),
    )
    // No auto-login: the account is inactive until the email is verified.
    expect(await screen.findByText('Check your email')).toBeInTheDocument()
    expect(screen.getByText('new@example.com')).toBeInTheDocument()
    expect(mockNavigate).not.toHaveBeenCalled()
  })

  it('shows an error message when registration fails', async () => {
    // A bodyless server failure carries no field messages, so the UI falls back
    // to the generic copy.
    register.mockRejectedValue({ status: 500 })
    renderPage()

    await userEvent.type(screen.getByLabelText('Email'), 'new@example.com')
    await userEvent.type(screen.getByLabelText('Password'), 'x')
    await userEvent.click(screen.getByRole('button', { name: 'Register' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Could not create account',
    )
    expect(mockNavigate).not.toHaveBeenCalled()
  })

  it('lists every field error when the API returns several', async () => {
    // A rejected mutation `.unwrap()` throws a FetchBaseQueryError ({ status, data });
    // extractErrorMessages flattens the DRF field -> [messages] map into a list.
    register.mockRejectedValue({
      status: 400,
      data: {
        email: ['A user with this email already exists.'],
        password: ['This password is too short.'],
      },
    })
    renderPage()

    await userEvent.type(screen.getByLabelText('Email'), 'taken@example.com')
    await userEvent.type(screen.getByLabelText('Password'), '123')
    await userEvent.click(screen.getByRole('button', { name: 'Register' }))

    const items = await screen.findAllByRole('listitem')
    expect(items).toHaveLength(2)
    expect(items[0]).toHaveTextContent('A user with this email already exists.')
    expect(items[1]).toHaveTextContent('This password is too short.')
  })
})
