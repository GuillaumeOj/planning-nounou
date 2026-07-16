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
import { getContractSchedules, getContracts } from '@/src/api/contracts'
import { getFamilies } from '@/src/api/family'
import { type BankHoliday, getBankHolidays } from '@/src/api/holidays'
import { Button } from '@/src/components/ui/button'
import { Label } from '@/src/components/ui/label'
import { MOBILE_QUERY, useMediaQuery } from '@/src/hooks/useMediaQuery'
import { useI18n } from '@/src/i18n/I18nContext'
import { cn, localeFor, selectClass } from '@/src/lib/utils'
import {
  nannyColorMap,
  toISODate,
  workedEntriesForDay,
} from '@/src/pages/planningSchedule'

// Per-nanny color palette. nannyColorMap assigns each nanny a slot here.
// `tint` is a background + a foreground readable in both themes, used wherever
// the name is spelled out; `dot` is the solid marker a phone cell carries
// instead, being too narrow for a name and hours. Pairing them in one entry
// keeps the two from drifting apart. Class strings are literals so Tailwind's
// scanner keeps them.
const NANNY_COLORS = [
  {
    tint: 'bg-violet-500/15 text-violet-700 dark:text-violet-300',
    dot: 'bg-violet-500',
  },
  { tint: 'bg-sky-500/15 text-sky-700 dark:text-sky-300', dot: 'bg-sky-500' },
  {
    tint: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300',
    dot: 'bg-emerald-500',
  },
  {
    tint: 'bg-amber-500/15 text-amber-800 dark:text-amber-300',
    dot: 'bg-amber-500',
  },
  {
    tint: 'bg-rose-500/15 text-rose-700 dark:text-rose-300',
    dot: 'bg-rose-500',
  },
  {
    tint: 'bg-teal-500/15 text-teal-700 dark:text-teal-300',
    dot: 'bg-teal-500',
  },
  {
    tint: 'bg-fuchsia-500/15 text-fuchsia-700 dark:text-fuchsia-300',
    dot: 'bg-fuchsia-500',
  },
  {
    tint: 'bg-indigo-500/15 text-indigo-700 dark:text-indigo-300',
    dot: 'bg-indigo-500',
  },
  {
    tint: 'bg-cyan-500/15 text-cyan-700 dark:text-cyan-300',
    dot: 'bg-cyan-500',
  },
  {
    tint: 'bg-orange-500/15 text-orange-700 dark:text-orange-300',
    dot: 'bg-orange-500',
  },
] as const

export default function Planning() {
  const { t, lang } = useI18n()
  const locale = localeFor(lang)
  const isMobile = useMediaQuery(MOBILE_QUERY)
  const [familyId, setFamilyId] = useState<string | null>(null)
  const [visibleMonth, setVisibleMonth] = useState(() =>
    startOfMonth(new Date()),
  )
  // Which day the mobile detail panel describes. Held as an ISO date so it
  // survives re-renders without carrying a Date identity around.
  const [selectedIso, setSelectedIso] = useState(() => toISODate(new Date()))

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

  // The grid can straddle two calendar years, so fetch holidays for every year
  // it shows (usually one, at most two). Holidays are global — no family needed.
  const shownYears = [...new Set(days.map((day) => day.getFullYear()))]
  const holidayQueries = useQueries({
    queries: shownYears.map((year) => ({
      queryKey: ['bank-holidays', year],
      queryFn: () => getBankHolidays(year),
    })),
  })

  // Lookup by ISO date for rendering the name, plus the set of non-workable
  // dates the schedule uses to drop working blocks.
  const holidaysByIso = new Map<string, BankHoliday>()
  const nonWorkableHolidays = new Set<string>()
  for (const query of holidayQueries) {
    for (const holiday of query.data ?? []) {
      holidaysByIso.set(holiday.date, holiday)
      if (!holiday.is_workable) nonWorkableHolidays.add(holiday.date)
    }
  }

  // Cheap (≈42 days × few contracts), so recompute inline each render.
  const entriesByDay = days.map((day) =>
    workedEntriesForDay(
      day,
      contractList,
      schedulesByContract,
      nonWorkableHolidays,
    ),
  )
  const hasEntries = entriesByDay.some((entries) => entries.length > 0)

  // Distinct, stable color slot per nanny across the whole shown set.
  const nannyColorIndex = nannyColorMap(
    contractList.map((c) => c.nanny.id),
    NANNY_COLORS.length,
  )

  // The ISO of each shown day, computed once: the cells, the holiday lookup and
  // the selection all key off it.
  const isoDays = days.map((day) => toISODate(day))

  // Navigating away from the selected day's month leaves the selection off the
  // grid; fall back to the 1st rather than showing a panel for an unseen day.
  // Resolving to an index (not a Date) keeps the panel, the ring and the entries
  // reading from the same row — visibleMonth is never one of the Dates in `days`,
  // so looking the entries up by identity would always come back empty.
  const foundIndex = isoDays.indexOf(selectedIso)
  const selectedIndex =
    foundIndex === -1 ? isoDays.indexOf(toISODate(visibleMonth)) : foundIndex
  const selectedDay = days[selectedIndex]
  const selectedEntries = entriesByDay[selectedIndex]
  const selectedHoliday = holidaysByIso.get(isoDays[selectedIndex])

  if (!families || families.length === 0) {
    return (
      <main className="flex flex-1 flex-col gap-6 p-4 sm:p-10">
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
          {t('planning.title')}
        </h1>
        <p className="text-sm text-muted-foreground">
          {t('contract.noFamilies')}
        </p>
      </main>
    )
  }

  return (
    <main className="flex flex-1 flex-col gap-6 p-4 sm:p-10">
      <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
        {t('planning.title')}
      </h1>

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
              const iso = isoDays[index]
              const entries = entriesByDay[index]
              const outside = !isSameMonth(day, visibleMonth)
              const today = isToday(day)
              const holiday = holidaysByIso.get(iso)
              const background = holiday
                ? 'bg-red-500/10'
                : outside
                  ? 'bg-muted/40'
                  : 'bg-background'
              const dayNumber = (
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
              )

              // Phone: a tappable square carrying only the date and one dot per
              // worked block. The names and hours live in the panel below.
              if (isMobile) {
                const selected = index === selectedIndex
                return (
                  <button
                    type="button"
                    key={day.toISOString()}
                    onClick={() => setSelectedIso(iso)}
                    aria-pressed={selected}
                    aria-label={format(day, 'PPPP', { locale })}
                    className={cn(
                      'flex min-h-14 flex-col items-center gap-1 p-1.5',
                      background,
                      selected && 'ring-2 ring-primary ring-inset',
                    )}
                  >
                    {dayNumber}
                    <span className="flex flex-wrap justify-center gap-0.5">
                      {holiday && (
                        <span className="size-1.5 rounded-full bg-red-500" />
                      )}
                      {entries.map((entry) => (
                        <span
                          key={`${entry.contractId}-${entry.start}-${entry.end}`}
                          className={cn(
                            'size-1.5 rounded-full',
                            NANNY_COLORS[nannyColorIndex[entry.nannyId]].dot,
                          )}
                        />
                      ))}
                    </span>
                  </button>
                )
              }

              return (
                <div
                  key={day.toISOString()}
                  className={cn(
                    'flex min-h-24 flex-col gap-1 p-1.5',
                    background,
                  )}
                >
                  {dayNumber}
                  {holiday && (
                    <div className="truncate rounded bg-red-500/15 px-1.5 py-1 text-[11px] font-medium leading-tight text-red-700 dark:text-red-300">
                      {holiday.name}
                    </div>
                  )}
                  {entries.map((entry) => (
                    <div
                      key={`${entry.contractId}-${entry.start}-${entry.end}`}
                      className={cn(
                        'rounded px-1.5 py-1 text-[11px] leading-tight',
                        NANNY_COLORS[nannyColorIndex[entry.nannyId]].tint,
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

          {isMobile && (
            <section className="flex flex-col gap-2" aria-live="polite">
              <h2 className="text-sm font-medium capitalize">
                {format(selectedDay, 'PPPP', { locale })}
              </h2>
              {selectedHoliday && (
                <p className="rounded-lg bg-red-500/15 px-3 py-2 text-sm font-medium text-red-700 dark:text-red-300">
                  {selectedHoliday.name}
                </p>
              )}
              {selectedEntries.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  {t('planning.noWorkedDay')}
                </p>
              ) : (
                selectedEntries.map((entry) => (
                  <div
                    key={`${entry.contractId}-${entry.start}-${entry.end}`}
                    className={cn(
                      'flex items-center justify-between gap-3 rounded-lg px-3 py-2 text-sm',
                      NANNY_COLORS[nannyColorIndex[entry.nannyId]].tint,
                    )}
                  >
                    <span className="min-w-0 truncate font-medium">
                      {entry.nannyName}
                    </span>
                    <span className="shrink-0 tabular-nums">
                      {entry.start}–{entry.end}
                    </span>
                  </div>
                ))
              )}
            </section>
          )}

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
