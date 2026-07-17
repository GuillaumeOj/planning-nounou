import type { DeclarationStatus } from '@/src/api/declarations'
import { useI18n } from '@/src/i18n/I18nContext'
import { cn } from '@/src/lib/utils'

// The draft/filed pill for a monthly declaration. Shared by the declaration card
// and the home dashboard's month summary, so the two never drift on colour or
// wording.
export function DeclarationStatusBadge({
  status,
}: {
  status: DeclarationStatus
}) {
  const { t } = useI18n()
  const isFiled = status === 'filed'
  return (
    <span
      className={cn(
        'rounded-full px-2 py-0.5 text-xs font-medium',
        isFiled
          ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
          : 'bg-muted text-muted-foreground',
      )}
    >
      {isFiled ? t('declaration.status.filed') : t('declaration.status.draft')}
    </span>
  )
}
