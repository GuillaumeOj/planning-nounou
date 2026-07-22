import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react'
import {
  DEFAULT_LANGUAGE,
  LANGUAGES,
  type Language,
  type TranslationKey,
  translations,
} from '@/src/i18n/translations'

// 'system' follows the browser; a concrete language overrides it.
export type LanguagePreference = 'system' | Language

const LANG_KEY = 'nounou.lang'

export interface I18nContextValue {
  lang: Language
  preference: LanguagePreference
  setLanguage: (preference: LanguagePreference) => void
  t: (key: TranslationKey) => string
}

function isSupported(value: string): value is Language {
  return (LANGUAGES as readonly string[]).includes(value)
}

// Pick the first browser-preferred language we support, else fall back to the
// default (French).
export function detectLanguage(): Language {
  const candidates = navigator.languages?.length
    ? navigator.languages
    : [navigator.language]

  for (const candidate of candidates) {
    const base = candidate.toLowerCase().split('-')[0]
    if (isSupported(base)) {
      return base
    }
  }
  return DEFAULT_LANGUAGE
}

function readStoredPreference(): LanguagePreference {
  const stored = localStorage.getItem(LANG_KEY)
  if (stored === 'system' || (stored !== null && isSupported(stored))) {
    return stored
  }
  return 'system'
}

const I18nContext = createContext<I18nContextValue | null>(null)

export function I18nProvider({ children }: { children: ReactNode }) {
  const [preference, setPreference] =
    useState<LanguagePreference>(readStoredPreference)
  const [systemLang, setSystemLang] = useState<Language>(detectLanguage)

  // The browser fires `languagechange` when the user changes their preferred
  // language; this keeps the "system" option in sync live.
  useEffect(() => {
    const handleChange = () => setSystemLang(detectLanguage())
    window.addEventListener('languagechange', handleChange)
    return () => window.removeEventListener('languagechange', handleChange)
  }, [])

  const lang: Language = preference === 'system' ? systemLang : preference

  useEffect(() => {
    document.documentElement.lang = lang
  }, [lang])

  const setLanguage = useCallback((next: LanguagePreference) => {
    localStorage.setItem(LANG_KEY, next)
    setPreference(next)
  }, [])

  const t = useCallback(
    (key: TranslationKey) => translations[lang][key],
    [lang],
  )

  const value = useMemo<I18nContextValue>(
    () => ({ lang, preference, setLanguage, t }),
    [lang, preference, setLanguage, t],
  )

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}

export function useI18n(): I18nContextValue {
  const context = useContext(I18nContext)
  if (!context) {
    throw new Error('useI18n must be used within an I18nProvider')
  }
  return context
}
