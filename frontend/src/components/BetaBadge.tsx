import { Badge } from '@/src/components/ui/badge'
import { useI18n } from '@/src/i18n/I18nContext'
import { cn } from '@/src/lib/utils'

// A neutral "Beta" tag. The product is still validating its calculations, so
// this rides next to the brand name on the landing and in the navbar. Uses the
// badge "tag" family (secondary), which the guide reserves for neutral
// classification rather than a status/alert.
export function BetaBadge({ className }: { className?: string }) {
  const { t } = useI18n()
  return (
    <Badge variant="secondary" className={cn('uppercase', className)}>
      {t('beta.tag')}
    </Badge>
  )
}
