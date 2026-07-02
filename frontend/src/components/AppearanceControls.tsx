import { Languages, Palette } from 'lucide-react'
import type { LanguagePreference } from '../i18n/I18nContext'
import { useI18n } from '../i18n/I18nContext'
import { LANGUAGE_NAMES, LANGUAGES } from '../i18n/translations'
import type { ThemePreference } from '../theme/ThemeContext'
import { useTheme } from '../theme/ThemeContext'

// Native selects keep this control simple and fully keyboard/AT accessible; they
// are styled to match the shadcn input surface.
const selectClass =
  'h-8 rounded-md border border-input bg-background px-2 text-sm text-foreground shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50'

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
