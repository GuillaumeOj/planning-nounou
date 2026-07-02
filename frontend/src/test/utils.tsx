import { render } from '@testing-library/react'
import type { ReactElement } from 'react'
import { MemoryRouter } from 'react-router-dom'
import { vi } from 'vitest'
import type { AuthContextValue } from '../auth/AuthContext'
import { I18nProvider } from '../i18n/I18nContext'
import { ThemeProvider } from '../theme/ThemeContext'

// Build an AuthContextValue for `useAuth` mocks; override only what a test needs.
export function makeAuth(
  overrides: Partial<AuthContextValue> = {},
): AuthContextValue {
  return {
    user: null,
    isAuthenticated: false,
    isLoading: false,
    login: vi.fn(),
    register: vi.fn(),
    logout: vi.fn(),
    ...overrides,
  }
}

// Render a UI tree inside the app-wide providers (theme, i18n, router).
export function renderWithProviders(
  ui: ReactElement,
  { route = '/' }: { route?: string } = {},
) {
  return render(
    <ThemeProvider>
      <I18nProvider>
        <MemoryRouter initialEntries={[route]}>{ui}</MemoryRouter>
      </I18nProvider>
    </ThemeProvider>,
  )
}
