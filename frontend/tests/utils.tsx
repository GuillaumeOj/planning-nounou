import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactElement } from 'react'
import { MemoryRouter } from 'react-router-dom'
import { vi } from 'vitest'
import type { AuthContextValue } from '@/src/auth/AuthContext'
import { I18nProvider } from '@/src/i18n/I18nContext'
import { ThemeProvider } from '@/src/theme/ThemeContext'

// Drive a shadcn/Radix <Select>: open the trigger (found by its accessible name,
// e.g. its <Label> or aria-label) and pick an option by its visible text. This
// replaces userEvent.selectOptions, which only works on a native <select>. Note
// the option is chosen by TEXT, not by value.
export async function selectOption(
  triggerName: string | RegExp,
  optionName: string | RegExp,
  // Accept either the module's direct API or a userEvent.setup() instance.
  user: { click: (element: Element) => Promise<unknown> } = userEvent,
) {
  await user.click(screen.getByRole('combobox', { name: triggerName }))
  await user.click(await screen.findByRole('option', { name: optionName }))
}

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
    refreshUser: vi.fn(),
    ...overrides,
  }
}

// Render a UI tree inside the app-wide providers (theme, i18n, query, router).
export function renderWithProviders(
  ui: ReactElement,
  { route = '/' }: { route?: string } = {},
) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return render(
    <ThemeProvider>
      <I18nProvider>
        <QueryClientProvider client={client}>
          <MemoryRouter initialEntries={[route]}>{ui}</MemoryRouter>
        </QueryClientProvider>
      </I18nProvider>
    </ThemeProvider>,
  )
}
