import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { api } from '../api/client'
import { detectLanguage, I18nProvider, useI18n } from './I18nContext'

function setLanguages(languages: string[]) {
  Object.defineProperty(navigator, 'languages', {
    value: languages,
    configurable: true,
  })
}

function setLanguage(language: string) {
  Object.defineProperty(navigator, 'language', {
    value: language,
    configurable: true,
  })
}

function Probe() {
  const { lang, preference, setLanguage, t } = useI18n()
  return (
    <div>
      <span data-testid="lang">{lang}</span>
      <span data-testid="preference">{preference}</span>
      <span data-testid="title">{t('login.title')}</span>
      <button type="button" onClick={() => setLanguage('fr')}>
        force-fr
      </button>
      <button type="button" onClick={() => setLanguage('system')}>
        use-system
      </button>
    </div>
  )
}

afterEach(() => {
  setLanguages(['en-US'])
})

describe('detectLanguage', () => {
  it('picks the first supported browser language', () => {
    setLanguages(['fr-FR', 'en-US'])
    expect(detectLanguage()).toBe('fr')
  })

  it('skips unsupported languages', () => {
    setLanguages(['de-DE', 'fr'])
    expect(detectLanguage()).toBe('fr')
  })

  it('falls back to English when nothing matches', () => {
    setLanguages(['de-DE', 'es-ES'])
    expect(detectLanguage()).toBe('en')
  })

  it('uses navigator.language when the languages list is empty', () => {
    setLanguages([])
    setLanguage('fr-CA')
    expect(detectLanguage()).toBe('fr')
  })
})

describe('I18nProvider', () => {
  it('renders English by default', () => {
    setLanguages(['en-US'])
    render(
      <I18nProvider>
        <Probe />
      </I18nProvider>,
    )
    expect(screen.getByTestId('lang')).toHaveTextContent('en')
    expect(screen.getByTestId('title')).toHaveTextContent('Welcome back')
  })

  it('renders French when the browser prefers it', () => {
    setLanguages(['fr-FR'])
    render(
      <I18nProvider>
        <Probe />
      </I18nProvider>,
    )
    expect(screen.getByTestId('lang')).toHaveTextContent('fr')
    expect(screen.getByTestId('title')).toHaveTextContent('Bon retour')
  })

  it('syncs <html lang> and the Accept-Language header', () => {
    setLanguages(['fr-FR'])
    render(
      <I18nProvider>
        <Probe />
      </I18nProvider>,
    )
    expect(document.documentElement.lang).toBe('fr')
    expect(api.defaults.headers.common['Accept-Language']).toBe('fr')
  })

  it('updates live when the browser language changes', () => {
    setLanguages(['en-US'])
    render(
      <I18nProvider>
        <Probe />
      </I18nProvider>,
    )
    expect(screen.getByTestId('lang')).toHaveTextContent('en')

    act(() => {
      setLanguages(['fr-FR'])
      window.dispatchEvent(new Event('languagechange'))
    })

    expect(screen.getByTestId('lang')).toHaveTextContent('fr')
    expect(screen.getByTestId('title')).toHaveTextContent('Bon retour')
  })

  it('throws when useI18n is used outside a provider', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(() => render(<Probe />)).toThrow(
      'useI18n must be used within an I18nProvider',
    )
    spy.mockRestore()
  })
})

describe('language preference override', () => {
  it('forces a language regardless of the browser and persists it', async () => {
    setLanguages(['en-US'])
    render(
      <I18nProvider>
        <Probe />
      </I18nProvider>,
    )
    expect(screen.getByTestId('lang')).toHaveTextContent('en')

    await userEvent.click(screen.getByText('force-fr'))

    expect(screen.getByTestId('preference')).toHaveTextContent('fr')
    expect(screen.getByTestId('lang')).toHaveTextContent('fr')
    expect(screen.getByTestId('title')).toHaveTextContent('Bon retour')
    expect(localStorage.getItem('nounou.lang')).toBe('fr')
  })

  it('restores a persisted preference on load', () => {
    localStorage.setItem('nounou.lang', 'fr')
    setLanguages(['en-US'])
    render(
      <I18nProvider>
        <Probe />
      </I18nProvider>,
    )
    expect(screen.getByTestId('lang')).toHaveTextContent('fr')
  })

  it('returns to browser detection when set back to system', async () => {
    setLanguages(['en-US'])
    render(
      <I18nProvider>
        <Probe />
      </I18nProvider>,
    )
    await userEvent.click(screen.getByText('force-fr'))
    expect(screen.getByTestId('lang')).toHaveTextContent('fr')

    await userEvent.click(screen.getByText('use-system'))

    expect(screen.getByTestId('preference')).toHaveTextContent('system')
    expect(screen.getByTestId('lang')).toHaveTextContent('en')
  })
})
