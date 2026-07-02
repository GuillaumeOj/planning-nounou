import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AxiosError } from 'axios'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useAuth } from '../auth/AuthContext'
import { makeAuth, renderWithProviders } from '../test/utils'
import RegisterPage from './RegisterPage'

const mockNavigate = vi.fn()
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>()
  return { ...actual, useNavigate: () => mockNavigate }
})

vi.mock('../auth/AuthContext', () => ({ useAuth: vi.fn() }))
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
  it('registers and navigates home on success', async () => {
    register.mockResolvedValue(undefined)
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
    expect(mockNavigate).toHaveBeenCalledWith('/')
  })

  it('shows an error message when registration fails', async () => {
    register.mockRejectedValue(new Error('bad'))
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
    const error = new AxiosError('bad request')
    const data = {
      email: ['A user with this email already exists.'],
      password: ['This password is too short.'],
    }
    // biome-ignore lint/suspicious/noExplicitAny: minimal response shape for the test
    error.response = { data } as any
    register.mockRejectedValue(error)
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
