import { Languages, Palette } from 'lucide-react'
import type { LanguagePreference } from '@/src/i18n/I18nContext'
import { useI18n } from '@/src/i18n/I18nContext'
import { LANGUAGE_NAMES, LANGUAGES } from '@/src/i18n/translations'
import { selectClass } from '@/src/lib/utils'
import type { ThemePreference } from '@/src/theme/ThemeContext'
import { useTheme } from '@/src/theme/ThemeContext'

// Language + theme dropdowns. Both follow the browser by default ("System") and
// let the user override it explicitly. Shared by the auth-page top bar and the
// navbar account menu.
export function AppearanceControls() {
  const { preference, setLanguage, t } = useI18n()
  const { theme, setTheme } = useTheme()

  return (
    <>
      <label className="inline-flex items-center gap-1.5 text-sm text-muted-foreground">
        <Languages size={16} aria-hidden="true" className="shrink-0" />
        <span className="sr-only">{t('settings.language')}</span>
        <select
          className={selectClass}
          aria-label={t('settings.language')}
          value={preference}
          onChange={(event) =>
            setLanguage(event.target.value as LanguagePreference)
          }
        >
          <option value="system">{t('settings.system')}</option>
          {LANGUAGES.map((code) => (
            <option key={code} value={code}>
              {LANGUAGE_NAMES[code]}
            </option>
          ))}
        </select>
      </label>
      <label className="inline-flex items-center gap-1.5 text-sm text-muted-foreground">
        <Palette size={16} aria-hidden="true" className="shrink-0" />
        <span className="sr-only">{t('settings.theme')}</span>
        <select
          className={selectClass}
          aria-label={t('settings.theme')}
          value={theme}
          onChange={(event) => setTheme(event.target.value as ThemePreference)}
        >
          <option value="system">{t('settings.system')}</option>
          <option value="light">{t('settings.light')}</option>
          <option value="dark">{t('settings.dark')}</option>
        </select>
      </label>
    </>
  )
}
