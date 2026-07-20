import { screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import Features from '@/src/pages/Features'
import { renderWithProviders } from '@/tests/utils'

describe('Features', () => {
  it('renders every feature section with its details', () => {
    renderWithProviders(<Features />)

    expect(
      screen.getByRole('heading', {
        level: 1,
        name: /ma garde sereine features/i,
      }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('heading', {
        name: /the contract, your reference point/i,
      }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('heading', { name: /shared care, managed together/i }),
    ).toBeInTheDocument()
    // A representative bullet from the contract section.
    expect(screen.getByText(/recurring weekly schedule/i)).toBeInTheDocument()
  })

  it('closes with a registration call to action', () => {
    renderWithProviders(<Features />)
    expect(
      screen.getByRole('link', { name: /create an account/i }),
    ).toHaveAttribute('href', '/register')
  })

  it('sets the features document title', () => {
    renderWithProviders(<Features />)
    expect(document.title).toMatch(/features/i)
  })
})
