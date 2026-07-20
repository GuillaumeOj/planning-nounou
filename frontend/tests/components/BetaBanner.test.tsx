import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { BetaBanner } from '@/src/components/BetaBanner'
import { renderWithProviders } from '@/tests/utils'

const DISMISS_KEY = 'nounou.betaBanner.dismissed'

// localStorage is cleared after each test by tests/setup.ts.

describe('BetaBanner', () => {
  it('renders the reassurance notice when not dismissed', () => {
    renderWithProviders(<BetaBanner />)
    expect(
      screen.getByText(/still validating the calculations/i),
    ).toBeInTheDocument()
  })

  it('hides and persists the choice when dismissed', async () => {
    renderWithProviders(<BetaBanner />)

    await userEvent.click(
      screen.getByRole('button', { name: 'Dismiss banner' }),
    )

    expect(
      screen.queryByText(/still validating the calculations/i),
    ).not.toBeInTheDocument()
    expect(localStorage.getItem(DISMISS_KEY)).toBe('1')
  })

  it('stays hidden when already dismissed', () => {
    localStorage.setItem(DISMISS_KEY, '1')
    renderWithProviders(<BetaBanner />)
    expect(
      screen.queryByText(/still validating the calculations/i),
    ).not.toBeInTheDocument()
  })
})
