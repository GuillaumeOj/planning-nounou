import { Languages, Palette } from 'lucide-react'
import type { LanguagePreference } from '../i18n/I18nContext'
import { useI18n } from '../i18n/I18nContext'
import { LANGUAGE_NAMES, LANGUAGES } from '../i18n/translations'
import type { ThemePreference } from '../theme/ThemeContext'
import { useTheme } from '../theme/ThemeContext'

// Language + theme dropdowns. Both follow the browser by default ("System") and
// let the user override it explicitly. Shared by the auth-page top bar and the
// navbar account menu.
export function AppearanceControls() {
  const { preference, setLanguage, t } = useI18n()
  const { theme, setTheme } = useTheme()

  return (
    <>
      <label className="settings-control">
        <Languages className="settings-icon" size={16} aria-hidden="true" />
        <span className="sr-only">{t('settings.language')}</span>
        <select
          className="settings-select"
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
      <label className="settings-control">
        <Palette className="settings-icon" size={16} aria-hidden="true" />
        <span className="sr-only">{t('settings.theme')}</span>
        <select
          className="settings-select"
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
