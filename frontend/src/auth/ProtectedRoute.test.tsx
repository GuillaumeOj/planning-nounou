import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { makeAuth } from '../test/utils'
import type { AuthContextValue } from './AuthContext'
import { useAuth } from './AuthContext'
import { ProtectedRoute } from './ProtectedRoute'

vi.mock('./AuthContext', () => ({ useAuth: vi.fn() }))
const mockUseAuth = vi.mocked(useAuth)

function setAuth(partial: Partial<AuthContextValue>) {
  mockUseAuth.mockReturnValue(makeAuth(partial))
}

function renderAt(initial: string) {
  return render(
    <MemoryRouter initialEntries={[initial]}>
      <Routes>
        <Route path="/login" element={<p>login page</p>} />
        <Route
          path="/"
          element={
            <ProtectedRoute>
              <p>secret</p>
            </ProtectedRoute>
          }
        />
      </Routes>
    </MemoryRouter>,
  )
}

describe('ProtectedRoute', () => {
  it('shows a loading state while auth resolves', () => {
    setAuth({ isLoading: true })
    renderAt('/')
    expect(screen.getByText('Loading…')).toBeInTheDocument()
  })

  it('redirects to /login when unauthenticated', () => {
    setAuth({ isAuthenticated: false })
    renderAt('/')
    expect(screen.getByText('login page')).toBeInTheDocument()
  })

  it('renders children when authenticated', () => {
    setAuth({ isAuthenticated: true })
    renderAt('/')
    expect(screen.getByText('secret')).toBeInTheDocument()
  })
})
