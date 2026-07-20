import { Info, X } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/src/components/ui/button'
import { useI18n } from '@/src/i18n/I18nContext'
import { cn } from '@/src/lib/utils'

// One shared key across the landing and the dashboard: dismissing the banner in
// one place dismisses it everywhere, which is what we want for a single beta
// notice. Mirrors the nounou.* localStorage convention (see ThemeContext).
const DISMISS_KEY = 'nounou.betaBanner.dismissed'

function readDismissed(): boolean {
  try {
    return localStorage.getItem(DISMISS_KEY) === '1'
  } catch {
    // A blocked/absent localStorage just means we show the banner.
    return false
  }
}

// A calm, honest notice that the app is in beta and its figures should be
// double-checked before declaring. Shown on the public landing and at the top
// of the dashboard.
export function BetaBanner({ className }: { className?: string }) {
  const { t } = useI18n()
  const [dismissed, setDismissed] = useState(readDismissed)

  if (dismissed) return null

  const dismiss = () => {
    try {
      localStorage.setItem(DISMISS_KEY, '1')
    } catch {
      /* ignore a write we can't persist; still hide for this session */
    }
    setDismissed(true)
  }

  return (
    <div
      className={cn(
        'flex items-start gap-3 rounded-lg border border-warning/40 bg-warning/10 px-4 py-3 text-sm text-foreground',
        className,
      )}
    >
      <Info
        size={18}
        aria-hidden="true"
        className="mt-0.5 shrink-0 text-warning-foreground"
      />
      <p className="flex-1 leading-relaxed">{t('beta.banner')}</p>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        aria-label={t('beta.banner.dismiss')}
        onClick={dismiss}
      >
        <X size={16} aria-hidden="true" />
      </Button>
    </div>
  )
}
