import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ThemeProvider, useTheme } from './ThemeContext'

// Installs a controllable matchMedia mock and returns a setter to flip the
// system preference and notify listeners.
function mockMatchMedia(initialDark: boolean) {
  let listeners: Array<(event: { matches: boolean }) => void> = []
  const mql = {
    matches: initialDark,
    media: '(prefers-color-scheme: dark)',
    onchange: null,
    addEventListener: (
      _type: string,
      cb: (event: { matches: boolean }) => void,
    ) => {
      listeners.push(cb)
    },
    removeEventListener: (
      _type: string,
      cb: (event: { matches: boolean }) => void,
    ) => {
      listeners = listeners.filter((listener) => listener !== cb)
    },
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  }
  window.matchMedia = vi
    .fn()
    .mockReturnValue(mql) as unknown as typeof window.matchMedia
  return {
    setDark(dark: boolean) {
      mql.matches = dark
      for (const listener of listeners) {
        listener({ matches: dark })
      }
    },
  }
}

function Probe() {
  const { theme, resolvedTheme, setTheme } = useTheme()
  return (
    <div>
      <span data-testid="theme">{theme}</span>
      <span data-testid="resolved">{resolvedTheme}</span>
      <button type="button" onClick={() => setTheme('dark')}>
        dark
      </button>
      <button type="button" onClick={() => setTheme('light')}>
        light
      </button>
      <button type="button" onClick={() => setTheme('system')}>
        system
      </button>
    </div>
  )
}

function renderProbe() {
  return render(
    <ThemeProvider>
      <Probe />
    </ThemeProvider>,
  )
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('ThemeProvider', () => {
  it('defaults to system and resolves to light when the OS is light', () => {
    mockMatchMedia(false)
    renderProbe()
    expect(screen.getByTestId('theme')).toHaveTextContent('system')
    expect(screen.getByTestId('resolved')).toHaveTextContent('light')
    expect(document.documentElement.dataset.theme).toBe('light')
  })

  it('resolves system to dark when the OS prefers dark', () => {
    mockMatchMedia(true)
    renderProbe()
    expect(screen.getByTestId('resolved')).toHaveTextContent('dark')
    expect(document.documentElement.dataset.theme).toBe('dark')
  })

  it('applies and persists an explicit choice', async () => {
    mockMatchMedia(false)
    renderProbe()

    await userEvent.click(screen.getByText('dark'))

    expect(screen.getByTestId('resolved')).toHaveTextContent('dark')
    expect(document.documentElement.dataset.theme).toBe('dark')
    expect(localStorage.getItem('nounou.theme')).toBe('dark')
  })

  it('restores the persisted choice on load', () => {
    localStorage.setItem('nounou.theme', 'dark')
    mockMatchMedia(false)
    renderProbe()
    expect(screen.getByTestId('theme')).toHaveTextContent('dark')
    expect(document.documentElement.dataset.theme).toBe('dark')
  })

  it('follows live OS changes while on system', () => {
    const control = mockMatchMedia(false)
    renderProbe()
    expect(screen.getByTestId('resolved')).toHaveTextContent('light')

    act(() => control.setDark(true))

    expect(screen.getByTestId('resolved')).toHaveTextContent('dark')
    expect(document.documentElement.dataset.theme).toBe('dark')
  })

  it('throws when useTheme is used outside a provider', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(() => render(<Probe />)).toThrow(
      'useTheme must be used within a ThemeProvider',
    )
    spy.mockRestore()
  })
})
