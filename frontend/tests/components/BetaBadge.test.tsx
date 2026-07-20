import { screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { BetaBadge } from '@/src/components/BetaBadge'
import { renderWithProviders } from '@/tests/utils'

describe('BetaBadge', () => {
  it('renders the beta label', () => {
    renderWithProviders(<BetaBadge />)
    expect(screen.getByText('Beta')).toBeInTheDocument()
  })
})
