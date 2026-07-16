import { useQuery } from '@tanstack/react-query'
import { useMemo, useState } from 'react'
import { getContracts } from '@/src/api/contracts'
import { getFamilies } from '@/src/api/family'
import { LeavesSection } from '@/src/components/LeavesSection'
import { Label } from '@/src/components/ui/label'
import { useI18n } from '@/src/i18n/I18nContext'
import { selectClass } from '@/src/lib/utils'

// Dedicated Days-off screen (navbar-accessible): pick an acting family, then
// manage each nanny's leaves in a card. Mirrors the family-selector pattern of
// the Planning and Nannies pages.
export default function Leaves() {
  const { t } = useI18n()
  const [familyId, setFamilyId] = useState<string | null>(null)

  const { data: families } = useQuery({
    queryKey: ['families'],
    queryFn: getFamilies,
  })

  const activeFamilyId = useMemo(() => {
    if (familyId !== null) return familyId
    return families && families.length > 0 ? families[0].id : null
  }, [familyId, families])

  const {
    data: contracts,
    isLoading,
    isError,
  } = useQuery({
    queryKey: ['contracts', activeFamilyId],
    queryFn: () => getContracts(activeFamilyId as string),
    enabled: activeFamilyId !== null,
  })

  if (!families || families.length === 0) {
    return (
      <main className="flex flex-1 flex-col gap-6 p-4 sm:p-10">
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
          {t('leaves.title')}
        </h1>
        <p className="text-sm text-muted-foreground">
          {t('contract.noFamilies')}
        </p>
      </main>
    )
  }

  return (
    <main className="flex flex-1 flex-col gap-6 p-4 sm:p-10">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
          {t('leaves.title')}
        </h1>
        <p className="text-sm text-muted-foreground">
          {t('leaves.pageSubtitle')}
        </p>
      </div>

      <div className="flex w-full max-w-xs flex-col gap-2">
        <Label htmlFor="acting-family">{t('contract.selectFamily')}</Label>
        <select
          id="acting-family"
          className={selectClass}
          value={activeFamilyId ?? ''}
          onChange={(e) => setFamilyId(e.target.value)}
        >
          {families.map((f) => (
            <option key={f.id} value={f.id}>
              {f.name}
            </option>
          ))}
        </select>
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">{t('contract.loading')}</p>
      ) : isError ? (
        <p className="text-sm text-destructive">{t('contract.loadError')}</p>
      ) : contracts && contracts.length > 0 && activeFamilyId ? (
        <div className="flex flex-col gap-4">
          {contracts.map((contract) => (
            <LeavesSection
              key={contract.id}
              familyId={activeFamilyId}
              contract={contract}
            />
          ))}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">{t('contract.empty')}</p>
      )}
    </main>
  )
}
