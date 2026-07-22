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
import { type ComponentType, useMemo, useState } from 'react'
import {
  type Contract,
  getContractSchedules,
  getContracts,
} from '@/src/api/contracts'
import {
  type ContractChild,
  exceptionalHoursQueryOptions,
  exceptionalPresencesQueryOptions,
  getContractChildren,
} from '@/src/api/declarations'
import { getFamilies } from '@/src/api/family'
import { type BankHoliday, getBankHolidays } from '@/src/api/holidays'
import { type LeaveType, leavesQueryOptions } from '@/src/api/leaves'
import { formatDate } from '@/src/components/DateField'
import { ExceptionalHoursSection } from '@/src/components/ExceptionalHoursSection'
import { ExceptionalPresenceSection } from '@/src/components/ExceptionalPresenceSection'
import { LeavesSection } from '@/src/components/LeavesSection'
import { hhmm, toDisplayTime } from '@/src/components/TimeField'
import { Button } from '@/src/components/ui/button'
import { Label } from '@/src/components/ui/label'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/src/components/ui/popover'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/src/components/ui/select'
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/src/components/ui/tabs'
import { MOBILE_QUERY, useMediaQuery } from '@/src/hooks/useMediaQuery'
import { useI18n } from '@/src/i18n/I18nContext'
import type { TranslationKey } from '@/src/i18n/translations'
import { toMonthParam } from '@/src/lib/months'
import { cn, localeFor } from '@/src/lib/utils'
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

// The day-off type spelled out on the calendar mark, so "Marie · Paid leave · …"
// reads what kind of absence it is, not a bare "Day off".
const LEAVE_TYPE_KEYS: Record<LeaveType, TranslationKey> = {
  paid: 'leaves.type.paid',
  unpaid: 'leaves.type.unpaid',
  sickness: 'leaves.type.sickness',
  maternity: 'leaves.type.maternity',
}

// A special event on a day — a leave, exceptional hours, or an exceptional
// presence — surfaced as a mark on the calendar and spelled out on click. Kept
// apart from the nanny palette (a solid dot) and the holiday (red) by a hollow,
// muted marker, so a busy day still reads at a glance.
type PlanningEventKind = 'leave' | 'hours' | 'presence'

interface PlanningEvent {
  key: string
  kind: PlanningEventKind
  text: string
}

// Literal class strings, both the solid fill (the popover list) and the hollow
// ring (a phone cell's mark) — Tailwind's scanner only keeps classes it can see
// spelled out, so these cannot be built from a base by string surgery.
const EVENT_STYLES: Record<PlanningEventKind, { dot: string; ring: string }> = {
  leave: { dot: 'bg-amber-500', ring: 'ring-amber-500' },
  hours: { dot: 'bg-indigo-500', ring: 'ring-indigo-500' },
  presence: { dot: 'bg-teal-500', ring: 'ring-teal-500' },
}

// The kinds a day carries, once. Marks and the popover both key off it.
const distinctKinds = (events: PlanningEvent[]): PlanningEventKind[] => [
  ...new Set(events.map((event) => event.kind)),
]

// The one marker dot — a solid fill in a list, or a hollow ring on a phone cell
// where it must read apart from a worked-block dot. `className` carries the
// per-site alignment (a list row needs `mt-1.5 shrink-0`).
function EventDot({
  kind,
  ring,
  className,
}: {
  kind: PlanningEventKind
  ring?: boolean
  className?: string
}) {
  return (
    <span
      className={cn(
        'size-1.5 rounded-full',
        ring
          ? `ring-1 ring-inset ${EVENT_STYLES[kind].ring}`
          : EVENT_STYLES[kind].dot,
        className,
      )}
    />
  )
}

// A day's special-event mark: one hollow dot per kind present, opening a popover
// that spells the events out. Desktop only — a phone lists them in the panel
// under the grid instead, where there is room. Returns nothing on an empty day,
// so a cell without events carries no marker at all.
function DayEventsMark({
  events,
  title,
}: {
  events: PlanningEvent[]
  title: string
}) {
  if (events.length === 0) return null
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={title}
          className="mt-auto flex items-center gap-0.5 self-start rounded p-0.5 hover:bg-muted"
        >
          {distinctKinds(events).map((kind) => (
            <EventDot key={kind} kind={kind} />
          ))}
        </button>
      </PopoverTrigger>
      <PopoverContent className="flex w-64 flex-col gap-2">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {title}
        </p>
        <ul className="flex flex-col gap-1.5 text-sm">
          {events.map((event) => (
            <li key={event.key} className="flex items-start gap-2">
              <EventDot kind={event.kind} className="mt-1.5 shrink-0" />
              <span>{event.text}</span>
            </li>
          ))}
        </ul>
      </PopoverContent>
    </Popover>
  )
}

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

  // The special events the calendar marks: days off, exceptional hours, and a
  // child present outside their window. One query set each, per contract, so a
  // mark can name the nanny it belongs to. Shared exceptional hours come back
  // for every family; that is fine here — a mark is a mark. Each uses the same
  // query options as its record section, so the two share a cache entry rather
  // than fetching the resource twice.
  const eventsEnabled = activeFamilyId !== null
  const eventsFamilyId = activeFamilyId ?? ''
  const leaveQueries = useQueries({
    queries: contractList.map((contract) => ({
      ...leavesQueryOptions(eventsFamilyId, contract.id),
      enabled: eventsEnabled,
    })),
  })
  const hoursQueries = useQueries({
    queries: contractList.map((contract) => ({
      ...exceptionalHoursQueryOptions(eventsFamilyId, contract.id),
      enabled: eventsEnabled,
    })),
  })
  const presenceQueries = useQueries({
    queries: contractList.map((contract) => ({
      ...exceptionalPresencesQueryOptions(eventsFamilyId, contract.id),
      enabled: eventsEnabled,
    })),
  })
  // The children each contract covers, so a worked day can name who was there.
  // Shares the ['contract-children', id] cache entry with the presence section.
  const childrenQueries = useQueries({
    queries: contractList.map((contract) => ({
      queryKey: ['contract-children', contract.id],
      queryFn: () => getContractChildren(eventsFamilyId, contract.id),
      enabled: eventsEnabled,
    })),
  })

  const childrenByContract: Record<string, ContractChild[]> =
    Object.fromEntries(
      contractList.map((contract, index) => [
        contract.id,
        childrenQueries[index]?.data ?? [],
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
      childrenByContract,
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

  // The special events, keyed by ISO date. A leave is marked on every day it
  // spans within the grid; exceptional hours and presences on their own day.
  // Built inline (≈42 days × a handful of records) each render.
  const gridIso = new Set(isoDays)
  const eventsByIso = new Map<string, PlanningEvent[]>()
  const addEvent = (iso: string, event: PlanningEvent) => {
    if (!gridIso.has(iso)) return
    const list = eventsByIso.get(iso)
    if (list) list.push(event)
    else eventsByIso.set(iso, [event])
  }
  contractList.forEach((contract, index) => {
    const who = contract.nanny.first_name
    for (const leave of leaveQueries[index]?.data ?? []) {
      // The kind of day off and its comment, not a bare "Day off": a parent
      // clicking the mark wants to know it was sickness, and read the note.
      const kindLabel = t(LEAVE_TYPE_KEYS[leave.leave_type])
      const note = leave.notes ? ` · ${leave.notes}` : ''
      for (const day of eachDayOfInterval({
        start: new Date(`${leave.start_date}T00:00:00`),
        end: new Date(`${leave.end_date}T00:00:00`),
      })) {
        addEvent(toISODate(day), {
          key: `leave-${leave.id}-${toISODate(day)}`,
          kind: 'leave',
          text: `${who} · ${kindLabel}${note}`,
        })
      }
    }
    for (const entry of hoursQueries[index]?.data ?? []) {
      // Exceptional hours are private to the family that filed them. The endpoint
      // also returns the co-employer's *shared* entries (so the hours tab can
      // prompt "add yours"), but the calendar shows only the acting family's own —
      // a mark here is the acting family's own record of the month.
      if (entry.family !== activeFamilyId) continue
      const span =
        entry.start_date === entry.end_date
          ? toDisplayTime(hhmm(entry.start_time), lang)
          : `${toDisplayTime(hhmm(entry.start_time), lang)} → ${formatDate(entry.end_date, lang)}`
      addEvent(entry.start_date, {
        key: `hours-${entry.id}`,
        kind: 'hours',
        text: `${who} · ${t('planning.event.hours')} · ${span}`,
      })
    }
    // A presence belongs to the family whose child it is; the calendar shows only
    // the acting family's own children, not the co-employer's.
    const familyOfChild = new Map(
      (childrenByContract[contract.id] ?? []).map((c) => [
        c.child,
        c.family_id,
      ]),
    )
    for (const presence of presenceQueries[index]?.data ?? []) {
      if (familyOfChild.get(presence.child) !== activeFamilyId) continue
      addEvent(presence.date, {
        key: `presence-${presence.id}`,
        kind: 'presence',
        text: `${who} · ${t('planning.event.presence')} · ${presence.first_name}`,
      })
    }
  })

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
  const selectedEvents = eventsByIso.get(isoDays[selectedIndex]) ?? []

  // The month the record tabs are scoped to, so days off, exceptional hours and
  // exceptional care show the *visible* month's entries rather than the whole
  // contract's history — the same month the calendar and the declaration use.
  const monthParam = toMonthParam(visibleMonth)

  // The record tabs all hang off the same contracts query and all lay out the
  // same way — a card per nanny, scoped to the family and month selected above.
  // Only the section inside the card differs, so the shell is written once.
  const contractCards = (
    Section: ComponentType<{
      familyId: string
      contract: Contract
      month: string
    }>,
  ) => {
    if (isLoading) {
      return (
        <p className="text-sm text-muted-foreground">{t('planning.loading')}</p>
      )
    }
    if (isError) {
      return (
        <p className="text-sm text-destructive">{t('planning.loadError')}</p>
      )
    }
    if (activeFamilyId === null || contractList.length === 0) {
      return (
        <p className="text-sm text-muted-foreground">{t('contract.empty')}</p>
      )
    }
    return (
      <div className="flex flex-col gap-4">
        {contractList.map((contract) => (
          <Section
            key={contract.id}
            familyId={activeFamilyId}
            contract={contract}
            month={monthParam}
          />
        ))}
      </div>
    )
  }

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

      {/* The selector and the month above scope every tab. The list is a 2×2
          grid on a phone and one row from md up — same triggers either way, so
          this is a matter for CSS rather than for a branch on the viewport. */}
      <Tabs defaultValue="calendar">
        <TabsList className="grid h-auto! w-full grid-cols-2 gap-1 md:inline-flex md:w-fit">
          <TabsTrigger value="calendar" className="h-8">
            {t('planning.tab.calendar')}
          </TabsTrigger>
          <TabsTrigger value="leaves" className="h-8">
            {t('planning.tab.leaves')}
          </TabsTrigger>
          <TabsTrigger value="hours" className="h-8">
            {t('planning.tab.hours')}
          </TabsTrigger>
          <TabsTrigger value="presence" className="h-8">
            {t('planning.tab.presence')}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="calendar" className="flex flex-col gap-6">
          {isLoading ? (
            <p className="text-sm text-muted-foreground">
              {t('planning.loading')}
            </p>
          ) : isError ? (
            <p className="text-sm text-destructive">
              {t('planning.loadError')}
            </p>
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
                  const events = eventsByIso.get(iso) ?? []
                  const eventKinds = distinctKinds(events)
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
                                NANNY_COLORS[nannyColorIndex[entry.nannyId]]
                                  .dot,
                              )}
                            />
                          ))}
                          {/* Hollow ring so an event mark reads apart from a
                              solid worked-block dot. */}
                          {eventKinds.map((kind) => (
                            <EventDot key={kind} kind={kind} ring />
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
                          {entry.childNames.length > 0 && (
                            <div className="truncate opacity-80">
                              {entry.childNames.join(', ')}
                            </div>
                          )}
                        </div>
                      ))}
                      <DayEventsMark
                        events={events}
                        title={t('planning.event.title')}
                      />
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
                  {selectedEntries.length === 0 &&
                  selectedEvents.length === 0 ? (
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
                        <span className="flex min-w-0 flex-col">
                          <span className="truncate font-medium">
                            {entry.nannyName}
                          </span>
                          {entry.childNames.length > 0 && (
                            <span className="truncate text-xs opacity-80">
                              {entry.childNames.join(', ')}
                            </span>
                          )}
                        </span>
                        <span className="shrink-0 tabular-nums">
                          {entry.start}–{entry.end}
                        </span>
                      </div>
                    ))
                  )}
                  {/* The special events for the selected day: the phone's stand-in
                      for the desktop popover, spelled out under the grid. */}
                  {selectedEvents.map((event) => (
                    <div
                      key={event.key}
                      className="flex items-start gap-2 rounded-lg border px-3 py-2 text-sm"
                    >
                      <EventDot kind={event.kind} className="mt-1.5 shrink-0" />
                      <span className="min-w-0">{event.text}</span>
                    </div>
                  ))}
                </section>
              )}

              {!hasEntries && (
                <p className="text-sm text-muted-foreground">
                  {t('planning.noWorkedDays')}
                </p>
              )}
            </>
          )}
        </TabsContent>

        {/* Radix unmounts the tab that is not showing, so only the calendar's
            queries run until one of these is asked for. */}
        <TabsContent value="leaves">{contractCards(LeavesSection)}</TabsContent>
        <TabsContent value="hours">
          {contractCards(ExceptionalHoursSection)}
        </TabsContent>
        <TabsContent value="presence">
          {contractCards(ExceptionalPresenceSection)}
        </TabsContent>
      </Tabs>
    </main>
  )
}
