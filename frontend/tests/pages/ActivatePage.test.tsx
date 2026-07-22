import { screen } from '@testing-library/react'
import { HttpResponse, http } from 'msw'
import { Route, Routes } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import ActivatePage from '@/src/pages/ActivatePage'
import { server } from '@/tests/msw/server'
import { renderWithProviders } from '@/tests/utils'

// POST /api/auth/users/activation/ — the endpoint ActivatePage confirms the email with.
const ACTIVATION = '*/api/auth/users/activation/'

function renderPage() {
  return renderWithProviders(
    <Routes>
      <Route path="/activate/:uid/:token" element={<ActivatePage />} />
    </Routes>,
    { route: '/activate/uid-1/tok-1' },
  )
}

describe('ActivatePage', () => {
  it('activates with the uid and token, then confirms success', async () => {
    let body: unknown
    server.use(
      http.post(ACTIVATION, async ({ request }) => {
        body = await request.json()
        return new HttpResponse(null, { status: 204 })
      }),
    )
    renderPage()

    expect(
      await screen.findByText('Your account is now active. You can log in.'),
    ).toBeInTheDocument()
    expect(body).toMatchObject({ uid: 'uid-1', token: 'tok-1' })
    expect(
      screen.getByRole('link', { name: 'Go to log in' }),
    ).toBeInTheDocument()
  })

  it('shows an error for an invalid or expired link', async () => {
    server.use(
      http.post(ACTIVATION, () => new HttpResponse(null, { status: 400 })),
    )
    renderPage()

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'This activation link is invalid or has expired.',
    )
  })
})
