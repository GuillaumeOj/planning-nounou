import { useQueries, useQuery } from '@tanstack/react-query'
import { format, startOfMonth, subMonths } from 'date-fns'
import { useMemo, useState } from 'react'
import {
  type Contract,
  getContracts,
  type PaidLeaveBalance,
  paidLeaveQueryOptions,
} from '@/src/api/contracts'
import { getDeclarations } from '@/src/api/declarations'
import { getFamilies } from '@/src/api/family'
import { useAuth } from '@/src/auth/AuthContext'
import { BetaBanner } from '@/src/components/BetaBanner'
import { formatDate } from '@/src/components/DateField'
import { DeclarationStatusBadge } from '@/src/components/DeclarationStatusBadge'
import { type Figure, FigureGroup } from '@/src/components/FigureGroup'
import { PersonAvatar } from '@/src/components/PersonAvatar'
import { SectionCard } from '@/src/components/SectionCard'
import { Label } from '@/src/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/src/components/ui/select'
import { useI18n } from '@/src/i18n/I18nContext'
import { toMonthParam } from '@/src/lib/months'
import { formatDays, formatMoney, localeFor } from '@/src/lib/utils'

// The dashboard: the family's contracts, each with the nanny's paid-leave
// standing and a run of the recent months' declarations. It picks the acting
// family (like the planning and the declarations pages) and shows what came back
// — the figures are all priced on the backend.

// The current month and the three before it, most recent first: what a parent
// glances at to see the last few months are declared and this one is in hand.
const RECENT_MONTHS = 4

// The nanny's congés-payés standing for the current reference period: the agreed
// total, what has accrued so far, what has been taken, and what is left.
function PaidLeave({ balance }: { balance: PaidLeaveBalance }) {
  const { t, lang } = useI18n()
  const days = t('home.paidLeave.days')
  // The unit rides on each value so the shared FigureGroup renders the row as-is.
  const figure = (key: keyof PaidLeaveBalance) =>
    `${formatDays(balance[key], lang)} ${days}`
  const rows: Figure[] = [
    { label: t('home.paidLeave.total'), value: figure('total_days') },
    { label: t('home.paidLeave.accrued'), value: figure('accrued') },
    { label: t('home.paidLeave.taken'), value: figure('taken') },
    {
      label: t('home.paidLeave.remaining'),
      value: figure('remaining'),
      strong: true,
    },
  ]
  return (
    <FigureGroup
      title={t('home.paidLeave.title')}
      rows={rows}
      aside={
        <span className="text-xs text-muted-foreground">
          {formatDate(balance.period_start, lang)} →{' '}
          {formatDate(balance.period_end, lang)}
        </span>
      }
    />
  )
}

// The recent months' declarations for the acting family: net salary and status
// per month, so a parent sees at a glance which are filed and which still need
// doing. The list endpoint recomputes each draft as it reads.
function RecentDeclarations({
  familyId,
  contract,
  months,
}: {
  familyId: string
  contract: Contract
  months: Date[]
}) {
  const { t, lang } = useI18n()
  const locale = localeFor(lang)

  // Only the months the contract was actually live for: a month before it
  // started — or after it ended — has nothing to declare, so it is dropped rather
  // than shown as an empty "Nothing" row. "YYYY-MM" compares lexicographically.
  const visibleMonths = months.filter((month) => {
    const param = toMonthParam(month)
    return (
      param >= contract.starting_date.slice(0, 7) &&
      (contract.ending_date === null ||
        param <= contract.ending_date.slice(0, 7))
    )
  })

  const queries = useQueries({
    queries: visibleMonths.map((month) => ({
      // Same key as the declarations page, so the two share a cache entry.
      // familyId is part of it because the endpoint returns only the acting
      // family's row — a user managing both families of a shared contract must
      // not read one family's figures under the other.
      queryKey: ['declarations', contract.id, familyId, toMonthParam(month)],
      queryFn: () =>
        getDeclarations(familyId, contract.id, toMonthParam(month)),
    })),
  })

  return (
    <div className="flex flex-col gap-2">
      <h4 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {t('home.declarations.title')}
      </h4>
      <ul className="flex flex-col divide-y text-sm">
        {visibleMonths.length === 0 && (
          <li className="py-2 text-xs text-muted-foreground">
            {t('home.declarations.nothing')}
          </li>
        )}
        {visibleMonths.map((month, index) => {
          const query = queries[index]
          // The endpoint returns only the acting family's row for the month.
          const declaration = query?.data?.[0]
          return (
            <li
              key={toMonthParam(month)}
              className="flex items-center justify-between gap-3 py-2"
            >
              <span className="capitalize text-muted-foreground">
                {format(month, 'LLLL yyyy', { locale })}
              </span>
              {query?.isLoading ? (
                <span className="text-xs text-muted-foreground">
                  {t('home.declarations.loading')}
                </span>
              ) : declaration ? (
                <span className="flex items-center gap-2">
                  <span className="tabular-nums font-medium">
                    {formatMoney(declaration.net_salary, lang)}
                  </span>
                  <DeclarationStatusBadge status={declaration.status} />
                </span>
              ) : (
                <span className="text-xs text-muted-foreground">
                  {t('home.declarations.nothing')}
                </span>
              )}
            </li>
          )
        })}
      </ul>
    </div>
  )
}

function ContractCard({
  familyId,
  contract,
  months,
}: {
  familyId: string
  contract: Contract
  months: Date[]
}) {
  const { t } = useI18n()
  const { data: balance, isError } = useQuery(
    paidLeaveQueryOptions(familyId, contract.id),
  )

  return (
    <SectionCard
      title={`${contract.nanny.first_name} ${contract.nanny.last_name}`}
      avatar={
        <PersonAvatar
          name={`${contract.nanny.first_name} ${contract.nanny.last_name}`}
        />
      }
    >
      {balance ? (
        <PaidLeave balance={balance} />
      ) : isError ? (
        // Without this branch a failed balance shows a permanent "loading".
        <p className="text-sm text-destructive">{t('home.balanceError')}</p>
      ) : (
        <p className="text-sm text-muted-foreground">{t('home.loading')}</p>
      )}
      <RecentDeclarations
        familyId={familyId}
        contract={contract}
        months={months}
      />
    </SectionCard>
  )
}

export default function Home() {
  const { user } = useAuth()
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

  // The current month and the three before it, computed once.
  const months = useMemo(() => {
    const current = startOfMonth(new Date())
    return Array.from({ length: RECENT_MONTHS }, (_, i) =>
      subMonths(current, i),
    )
  }, [])

  const contractList = contracts ?? []

  return (
    <main className="flex flex-1 flex-col gap-6 p-4 sm:p-10">
      <BetaBanner />
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
          {t('home.title')}
        </h1>
        <p className="break-words text-sm text-muted-foreground">
          {t('home.signedInAs')}{' '}
          <strong className="text-foreground">{user?.email}</strong>
        </p>
      </div>

      {!families || families.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {t('contract.noFamilies')}
        </p>
      ) : (
        <>
          {families.length > 1 && (
            <div className="flex w-full max-w-xs flex-col gap-2">
              <Label htmlFor="acting-family">
                {t('contract.selectFamily')}
              </Label>
              <Select value={activeFamilyId ?? ''} onValueChange={setFamilyId}>
                <SelectTrigger id="acting-family">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {families.map((f) => (
                    <SelectItem key={f.id} value={f.id}>
                      {f.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {isLoading ? (
            <p className="text-sm text-muted-foreground">{t('home.loading')}</p>
          ) : isError ? (
            <p className="text-sm text-destructive">{t('home.loadError')}</p>
          ) : activeFamilyId === null || contractList.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {t('home.noContracts')}
            </p>
          ) : (
            // Card grid (brand guide p.6): contracts flow into columns on wider
            // screens, one per column on a phone.
            <div className="grid grid-cols-[repeat(auto-fill,minmax(320px,1fr))] gap-5">
              {contractList.map((contract) => (
                <ContractCard
                  key={contract.id}
                  familyId={activeFamilyId}
                  contract={contract}
                  months={months}
                />
              ))}
            </div>
          )}
        </>
      )}
    </main>
  )
}
