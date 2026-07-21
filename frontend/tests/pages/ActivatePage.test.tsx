import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { activate } from '@/src/api/auth'
import { I18nProvider } from '@/src/i18n/I18nContext'
import ActivatePage from '@/src/pages/ActivatePage'

vi.mock('@/src/api/auth', () => ({ activate: vi.fn() }))
const mockActivate = vi.mocked(activate)

function renderPage() {
  return render(
    <I18nProvider>
      <MemoryRouter initialEntries={['/activate/uid-1/tok-1']}>
        <Routes>
          <Route path="/activate/:uid/:token" element={<ActivatePage />} />
        </Routes>
      </MemoryRouter>
    </I18nProvider>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('ActivatePage', () => {
  it('activates with the uid and token, then confirms success', async () => {
    mockActivate.mockResolvedValue(undefined)
    renderPage()

    expect(
      await screen.findByText('Your account is now active. You can log in.'),
    ).toBeInTheDocument()
    expect(mockActivate).toHaveBeenCalledWith({ uid: 'uid-1', token: 'tok-1' })
    expect(
      screen.getByRole('link', { name: 'Go to log in' }),
    ).toBeInTheDocument()
  })

  it('shows an error for an invalid or expired link', async () => {
    mockActivate.mockRejectedValue(new Error('stale'))
    renderPage()

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'This activation link is invalid or has expired.',
    )
  })
})
