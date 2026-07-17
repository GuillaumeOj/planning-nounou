import { useQuery } from '@tanstack/react-query'
import { addMonths, format, startOfMonth, subMonths } from 'date-fns'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useMemo, useState } from 'react'
import { getContracts } from '@/src/api/contracts'
import { getFamilies } from '@/src/api/family'
import { DeclarationSection } from '@/src/components/DeclarationSection'
import { Button } from '@/src/components/ui/button'
import { Label } from '@/src/components/ui/label'
import { useI18n } from '@/src/i18n/I18nContext'
import { toMonthParam } from '@/src/lib/months'
import { localeFor, selectClass } from '@/src/lib/utils'

// The month's pay, per contract and per family, ready to be typed into
// pajemploi. The figures come from the backend already priced — this page picks
// the month and the acting family, and shows what came back.
export default function Declarations() {
  const { t, lang } = useI18n()
  const locale = localeFor(lang)
  const [familyId, setFamilyId] = useState<string | null>(null)
  // Default to last month: you declare a month once it is over, so the month
  // just gone is what a parent almost always came here for.
  const [visibleMonth, setVisibleMonth] = useState(() =>
    subMonths(startOfMonth(new Date()), 1),
  )

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

  const contractList = contracts ?? []
  const month = toMonthParam(visibleMonth)

  if (!families || families.length === 0) {
    return (
      <main className="flex flex-1 flex-col gap-6 p-4 sm:p-10">
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
          {t('declaration.title')}
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
          {t('declaration.title')}
        </h1>
        <p className="text-sm text-muted-foreground">
          {t('declaration.subtitle')}
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

      <div className="flex items-center gap-2 sm:gap-3">
        <Button
          variant="outline"
          size="icon"
          aria-label={t('planning.previousMonth')}
          onClick={() => setVisibleMonth((m) => subMonths(m, 1))}
        >
          <ChevronLeft size={18} aria-hidden="true" />
        </Button>
        {/* Takes the leftover width on a phone so the row never wraps. */}
        <div className="min-w-0 flex-1 text-center text-lg font-medium capitalize sm:min-w-44 sm:flex-none">
          {format(visibleMonth, 'LLLL yyyy', { locale })}
        </div>
        <Button
          variant="outline"
          size="icon"
          aria-label={t('planning.nextMonth')}
          onClick={() => setVisibleMonth((m) => addMonths(m, 1))}
        >
          <ChevronRight size={18} aria-hidden="true" />
        </Button>
        <Button
          variant="outline"
          onClick={() => setVisibleMonth(startOfMonth(new Date()))}
        >
          {t('planning.today')}
        </Button>
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">
          {t('declaration.loading')}
        </p>
      ) : isError ? (
        <p className="text-sm text-destructive">{t('declaration.loadError')}</p>
      ) : activeFamilyId === null || contractList.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {t('declaration.noContracts')}
        </p>
      ) : (
        <div className="flex flex-col gap-4">
          {contractList.map((contract) => (
            <DeclarationSection
              key={contract.id}
              familyId={activeFamilyId}
              contract={contract}
              month={month}
            />
          ))}
        </div>
      )}
    </main>
  )
}
