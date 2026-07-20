import { screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import Landing from '@/src/pages/Landing'
import { renderWithProviders } from '@/tests/utils'

describe('Landing', () => {
  it('leads with the hero pitch and a beta notice', () => {
    renderWithProviders(<Landing />)

    expect(
      screen.getByRole('heading', {
        level: 1,
        name: /shared childcare, with peace of mind/i,
      }),
    ).toBeInTheDocument()
    expect(
      screen.getByText(/still validating the calculations/i),
    ).toBeInTheDocument()
  })

  it('links to the features page and to registration', () => {
    renderWithProviders(<Landing />)

    expect(
      screen.getByRole('link', { name: /see all features/i }),
    ).toHaveAttribute('href', '/features')
    expect(
      screen.getByRole('link', { name: /create my account/i }),
    ).toHaveAttribute('href', '/register')
  })

  it('sets the document title for search engines', () => {
    renderWithProviders(<Landing />)
    expect(document.title).toMatch(/shared nanny care/i)
  })
})
