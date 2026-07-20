import { screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import LegalNotice from '@/src/pages/LegalNotice'
import Privacy from '@/src/pages/Privacy'
import { renderWithProviders } from '@/tests/utils'

describe('Privacy', () => {
  it('renders the policy sections', () => {
    renderWithProviders(<Privacy />)

    expect(
      screen.getByRole('heading', { level: 1, name: /privacy policy/i }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('heading', { name: /data we collect/i }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('heading', { name: /your rights/i }),
    ).toBeInTheDocument()
  })

  it('sets the privacy document title', () => {
    renderWithProviders(<Privacy />)
    expect(document.title).toMatch(/privacy policy/i)
  })
})

describe('LegalNotice', () => {
  it('renders the legal sections including the host', () => {
    renderWithProviders(<LegalNotice />)

    expect(
      screen.getByRole('heading', { level: 1, name: /legal notice/i }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('heading', { name: /publisher/i }),
    ).toBeInTheDocument()
    expect(screen.getByText(/vercel inc/i)).toBeInTheDocument()
  })
})
