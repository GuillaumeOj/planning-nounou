import { CircleCheck, FilePen } from 'lucide-react'
import type { MonthlyDeclarationStatusEnum } from '@/src/api'
import { Badge, StatusBadge } from '@/src/components/ui/badge'
import { useI18n } from '@/src/i18n/I18nContext'

// The draft/filed pill for a monthly declaration. Shared by the declaration card
// and the home dashboard's month summary, so the two never drift on colour or
// wording. Per the brand guide, a real status is never colour alone: "filed" is
// a success state with a check; "draft" is a neutral in-progress tag.
export function DeclarationStatusBadge({
  status,
}: {
  status: MonthlyDeclarationStatusEnum
}) {
  const { t } = useI18n()
  if (status === 'filed') {
    return (
      <StatusBadge icon={CircleCheck} variant="success">
        {t('declaration.status.filed')}
      </StatusBadge>
    )
  }
  return (
    <Badge variant="secondary">
      <FilePen aria-hidden={true} />
      {t('declaration.status.draft')}
    </Badge>
  )
}
