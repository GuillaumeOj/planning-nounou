import { screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import Pricing from '@/src/pages/Pricing'
import { renderWithProviders } from '@/tests/utils'

describe('Pricing', () => {
  it('states the app is free during the beta and lists what is included', () => {
    renderWithProviders(<Pricing />)

    expect(
      screen.getByRole('heading', { level: 1, name: /simple pricing/i }),
    ).toBeInTheDocument()
    expect(screen.getByText('Free')).toBeInTheDocument()
    expect(
      screen.getByText(/shared care between two families/i),
    ).toBeInTheDocument()
    expect(
      screen.getByText(/nothing becomes paid without notice/i),
    ).toBeInTheDocument()
  })

  it('offers a registration call to action', () => {
    renderWithProviders(<Pricing />)
    expect(
      screen.getByRole('link', { name: /create a free account/i }),
    ).toHaveAttribute('href', '/register')
  })
})
