import { Languages, Palette } from 'lucide-react'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/src/components/ui/select'
import type { LanguagePreference } from '@/src/i18n/I18nContext'
import { useI18n } from '@/src/i18n/I18nContext'
import { LANGUAGE_NAMES, LANGUAGES } from '@/src/i18n/translations'
import type { ThemePreference } from '@/src/theme/ThemeContext'
import { useTheme } from '@/src/theme/ThemeContext'

// Language + theme dropdowns. Both follow the browser by default ("System") and
// let the user override it explicitly. Shared by the auth-page top bar and the
// navbar account menu. The trigger sizes to its content (w-auto) so it stays a
// compact control in both.
export function AppearanceControls() {
  const { preference, setLanguage, t } = useI18n()
  const { theme, setTheme } = useTheme()

  return (
    <>
      <Select
        value={preference}
        onValueChange={(value) => setLanguage(value as LanguagePreference)}
      >
        <SelectTrigger
          aria-label={t('settings.language')}
          className="w-auto gap-1.5 text-muted-foreground"
        >
          <Languages size={16} aria-hidden="true" className="shrink-0" />
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="system">{t('settings.system')}</SelectItem>
          {LANGUAGES.map((code) => (
            <SelectItem key={code} value={code}>
              {LANGUAGE_NAMES[code]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select
        value={theme}
        onValueChange={(value) => setTheme(value as ThemePreference)}
      >
        <SelectTrigger
          aria-label={t('settings.theme')}
          className="w-auto gap-1.5 text-muted-foreground"
        >
          <Palette size={16} aria-hidden="true" className="shrink-0" />
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="system">{t('settings.system')}</SelectItem>
          <SelectItem value="light">{t('settings.light')}</SelectItem>
          <SelectItem value="dark">{t('settings.dark')}</SelectItem>
        </SelectContent>
      </Select>
    </>
  )
}
