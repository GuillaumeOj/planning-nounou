import { useQueries, useQuery } from '@tanstack/react-query'
import {
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameMonth,
  isToday,
  startOfMonth,
  startOfWeek,
  subMonths,
} from 'date-fns'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useMemo, useState } from 'react'
import { getContractSchedules, getContracts } from '../api/contracts'
import { getFamilies } from '../api/family'
import { Button } from '../components/ui/button'
import { Label } from '../components/ui/label'
import { useI18n } from '../i18n/I18nContext'
import { cn, localeFor } from '../lib/utils'
import { nannyColorMap, workedEntriesForDay } from './planningSchedule'

// Per-nanny color palette. Class strings are literals so Tailwind's scanner
// keeps them; each pairs a tinted background with a readable foreground in both
// light and dark themes. nannyColorMap assigns each nanny a slot in this array.
const NANNY_COLORS = [
  'bg-violet-500/15 text-violet-700 dark:text-violet-300',
  'bg-sky-500/15 text-sky-700 dark:text-sky-300',
  'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300',
  'bg-amber-500/15 text-amber-800 dark:text-amber-300',
  'bg-rose-500/15 text-rose-700 dark:text-rose-300',
  'bg-teal-500/15 text-teal-700 dark:text-teal-300',
  'bg-fuchsia-500/15 text-fuchsia-700 dark:text-fuchsia-300',
  'bg-indigo-500/15 text-indigo-700 dark:text-indigo-300',
  'bg-cyan-500/15 text-cyan-700 dark:text-cyan-300',
  'bg-orange-500/15 text-orange-700 dark:text-orange-300',
] as const

export default function Planning() {
  const { t, lang } = useI18n()
  const locale = localeFor(lang)
  const [familyId, setFamilyId] = useState<string | null>(null)
  const [visibleMonth, setVisibleMonth] = useState(() =>
    startOfMonth(new Date()),
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

  // Fetch each contract's full schedule history so navigating to past/future
  // months uses the version in force then, not just today's snapshot.
  const scheduleQueries = useQueries({
    queries: contractList.map((contract) => ({
      queryKey: ['contract-schedules', contract.id],
      queryFn: () =>
        getContractSchedules(activeFamilyId as string, contract.id),
      enabled: activeFamilyId !== null,
    })),
  })

  const schedulesByContract = Object.fromEntries(
    contractList.map((contract, index) => [
      contract.id,
      scheduleQueries[index]?.data ?? [],
    ]),
  )

  // Days shown in the grid: whole weeks (Monday-first) spanning the month.
  const days = useMemo(() => {
    const start = startOfWeek(startOfMonth(visibleMonth), { weekStartsOn: 1 })
    const end = endOfWeek(endOfMonth(visibleMonth), { weekStartsOn: 1 })
    return eachDayOfInterval({ start, end })
  }, [visibleMonth])

  // The grid starts on a Monday and spans whole weeks, so its first row is the
  // Mon–Sun weekday header.
  const weekdayHeaders = days.slice(0, 7)

  // Cheap (≈42 days × few contracts), so recompute inline each render.
  const entriesByDay = days.map((day) =>
    workedEntriesForDay(day, contractList, schedulesByContract),
  )
  const hasEntries = entriesByDay.some((entries) => entries.length > 0)

  // Distinct, stable color slot per nanny across the whole shown set.
  const nannyColorIndex = nannyColorMap(
    contractList.map((c) => c.nanny.id),
    NANNY_COLORS.length,
  )

  if (!families || families.length === 0) {
    return (
      <main className="flex flex-1 flex-col gap-6 p-6 sm:p-10">
        <h1 className="text-3xl font-semibold tracking-tight">
          {t('planning.title')}
        </h1>
        <p className="text-sm text-muted-foreground">
          {t('contract.noFamilies')}
        </p>
      </main>
    )
  }

  return (
    <main className="flex flex-1 flex-col gap-6 p-6 sm:p-10">
      <h1 className="text-3xl font-semibold tracking-tight">
        {t('planning.title')}
      </h1>

      <div className="flex max-w-xs flex-col gap-2">
        <Label htmlFor="acting-family">{t('contract.selectFamily')}</Label>
        <select
          id="acting-family"
          className="h-9 rounded-md border border-input bg-transparent px-2 text-sm"
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

      <div className="flex flex-wrap items-center gap-3">
        <Button
          variant="outline"
          size="icon"
          aria-label={t('planning.previousMonth')}
          onClick={() => setVisibleMonth((m) => subMonths(m, 1))}
        >
          <ChevronLeft size={18} aria-hidden="true" />
        </Button>
        <div className="min-w-44 text-center text-lg font-medium capitalize">
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
        <p className="text-sm text-muted-foreground">{t('planning.loading')}</p>
      ) : isError ? (
        <p className="text-sm text-destructive">{t('planning.loadError')}</p>
      ) : (
        <>
          <div className="grid grid-cols-7 gap-px overflow-hidden rounded-lg bg-border">
            {weekdayHeaders.map((day) => (
              <div
                key={format(day, 'EEEE')}
                className="bg-muted px-2 py-1.5 text-center text-xs font-medium uppercase text-muted-foreground"
              >
                {format(day, 'EEEEEE', { locale })}
              </div>
            ))}
            {days.map((day, index) => {
              const entries = entriesByDay[index]
              const outside = !isSameMonth(day, visibleMonth)
              const today = isToday(day)
              return (
                <div
                  key={day.toISOString()}
                  className={cn(
                    'flex min-h-24 flex-col gap-1 p-1.5',
                    outside ? 'bg-muted/40' : 'bg-background',
                  )}
                >
                  <span
                    className={cn(
                      'text-xs',
                      today
                        ? 'flex size-5 items-center justify-center rounded-full bg-primary font-medium text-primary-foreground'
                        : outside
                          ? 'text-muted-foreground'
                          : 'text-foreground',
                    )}
                  >
                    {format(day, 'd')}
                  </span>
                  {entries.map((entry) => (
                    <div
                      key={`${entry.contractId}-${entry.start}-${entry.end}`}
                      className={cn(
                        'rounded px-1.5 py-1 text-[11px] leading-tight',
                        NANNY_COLORS[nannyColorIndex[entry.nannyId]],
                      )}
                    >
                      <div className="truncate font-bold">
                        {entry.nannyName}
                      </div>
                      <div className="tabular-nums">
                        {entry.start}–{entry.end}
                      </div>
                    </div>
                  ))}
                </div>
              )
            })}
          </div>
          {!hasEntries && (
            <p className="text-sm text-muted-foreground">
              {t('planning.noWorkedDays')}
            </p>
          )}
        </>
      )}
    </main>
  )
}
