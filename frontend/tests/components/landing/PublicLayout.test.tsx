import { screen } from '@testing-library/react'
import { Route, Routes } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import { PublicLayout } from '@/src/components/landing/PublicLayout'
import { renderWithProviders } from '@/tests/utils'

function renderShell() {
  return renderWithProviders(
    <Routes>
      <Route element={<PublicLayout />}>
        <Route path="/" element={<p>routed page</p>} />
      </Route>
    </Routes>,
    { route: '/' },
  )
}

describe('PublicLayout', () => {
  it('frames the routed page with the brand header and footer', () => {
    renderShell()

    // Brand lockup appears in both the header and the footer.
    expect(screen.getAllByText('Ma Garde Sereine')).toHaveLength(2)
    // The beta tag rides in the header lockup only.
    expect(screen.getByText('Beta')).toBeInTheDocument()
    expect(screen.getByText('routed page')).toBeInTheDocument()
    expect(
      screen.getByText(/shared in-home childcare, managed with serenity/i),
    ).toBeInTheDocument()
  })

  it('offers the account actions in the header', () => {
    renderShell()

    const registerLinks = screen.getAllByRole('link', {
      name: 'Create an account',
    })
    expect(registerLinks.length).toBeGreaterThanOrEqual(1)
    expect(registerLinks[0]).toHaveAttribute('href', '/register')
  })
})
