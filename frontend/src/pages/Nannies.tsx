import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { format } from 'date-fns'
import { useMemo, useState } from 'react'
import { type Child, listChildren } from '@/src/api/children'
import {
  acceptContractInvitation,
  attachContractFamily,
  type Contract,
  type ContractInput,
  type ContractSchedule,
  type ContractScheduleInput,
  type ContractTerms,
  type ContractTermsInput,
  createContract,
  createContractInvitation,
  createContractSchedule,
  createContractTerms,
  declineContractInvitation,
  deleteContract,
  deleteContractSchedule,
  deleteContractTerms,
  getContractInvitations,
  getContractSchedules,
  getContracts,
  getContractTerms,
  getMinimumWage,
  getMyContractInvitations,
  type Nanny,
  revokeContractInvitation,
  type ScheduleBlock,
  type SplitMethod,
  updateContract,
  updateContractSchedule,
  updateContractTerms,
} from '@/src/api/contracts'
import { createContractChild } from '@/src/api/declarations'
import { extractErrorMessages } from '@/src/api/errors'
import { type Family, getFamilies } from '@/src/api/family'
import { ConfirmButton } from '@/src/components/ConfirmButton'
import { ConfirmByTypingDialog } from '@/src/components/ConfirmByTypingDialog'
import { ContractChildrenSection } from '@/src/components/ContractChildrenSection'
import { DateField, formatDate } from '@/src/components/DateField'
import { DayWindowFields } from '@/src/components/DayWindowFields'
import { type Figure, FigureGroup } from '@/src/components/FigureGroup'
import { FormErrors } from '@/src/components/FormErrors'
import { Modal } from '@/src/components/Modal'
import { PersonAvatar } from '@/src/components/PersonAvatar'
import { SectionCard } from '@/src/components/SectionCard'
import { formatTimeRange } from '@/src/components/TimeField'
import { Button } from '@/src/components/ui/button'
import { Card, CardContent } from '@/src/components/ui/card'
import { Input } from '@/src/components/ui/input'
import { Label } from '@/src/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/src/components/ui/select'
import { useI18n } from '@/src/i18n/I18nContext'
import type { Language, TranslationKey } from '@/src/i18n/translations'
import { type DayWindow, WEEKDAY_KEYS } from '@/src/lib/weekdays'

// --- Static reference content -----------------------------------------------

const URSSAF_MIN =
  'https://www.urssaf.fr/accueil/particulier/particulier-employeur/embaucher-un-salarie/remunerer-salarie-domicile.html#ancre-les-montants-minimums'
const URSSAF_IND =
  'https://www.urssaf.fr/accueil/particulier/particulier-employeur/embaucher-un-salarie/remunerer-salarie-domicile.html#ancre-les-indemnites'

type MoneyKey =
  | 'net_hourly_rate'
  | 'night_presence_rate'
  | 'transport_fee'
  | 'mileage_rate'
  | 'benefits_in_kind'

// The unit each figure reads in — driving both the editor and the read-only
// summary so a rate never shows as a flat euro amount or vice versa.
const MONEY_UNIT: Record<MoneyKey, TranslationKey> = {
  net_hourly_rate: 'terms.unit.perHour',
  night_presence_rate: 'terms.unit.perHour',
  transport_fee: 'terms.unit.euro',
  mileage_rate: 'terms.unit.perKm',
  benefits_in_kind: 'terms.unit.euro',
}

const MONEY_FIELDS: {
  name: MoneyKey
  label: TranslationKey
  hint: TranslationKey
  url: string
}[] = [
  {
    name: 'net_hourly_rate',
    label: 'terms.netHourly',
    hint: 'terms.netHourlyHint',
    url: URSSAF_MIN,
  },
  {
    name: 'night_presence_rate',
    label: 'terms.nightPresence',
    hint: 'terms.nightPresenceHint',
    url: URSSAF_IND,
  },
  {
    name: 'transport_fee',
    label: 'terms.transport',
    hint: 'terms.transportHint',
    url: URSSAF_IND,
  },
  {
    name: 'mileage_rate',
    label: 'terms.mileage',
    hint: 'terms.mileageHint',
    url: URSSAF_IND,
  },
  {
    name: 'benefits_in_kind',
    label: 'terms.benefits',
    hint: 'terms.benefitsHint',
    url: URSSAF_IND,
  },
]

function effectiveRange(
  snapshot: { effective_from: string; effective_to: string | null },
  lang: Language,
  ongoing: string,
): string {
  const to = snapshot.effective_to
    ? formatDate(snapshot.effective_to, lang)
    : ongoing
  return `${formatDate(snapshot.effective_from, lang)} → ${to}`
}

// --- Drafts -----------------------------------------------------------------

type TermsDraft = Record<MoneyKey, string> & { effective_from: string }

const EMPTY_TERMS: TermsDraft = {
  effective_from: '',
  net_hourly_rate: '',
  night_presence_rate: '',
  transport_fee: '',
  mileage_rate: '',
  benefits_in_kind: '',
}

function termsToDraft(terms: ContractTerms): TermsDraft {
  return {
    effective_from: terms.effective_from,
    net_hourly_rate: terms.net_hourly_rate,
    night_presence_rate: terms.night_presence_rate,
    transport_fee: terms.transport_fee,
    mileage_rate: terms.mileage_rate,
    benefits_in_kind: terms.benefits_in_kind,
  }
}

function termsDraftToInput(draft: TermsDraft): ContractTermsInput {
  return {
    effective_from: draft.effective_from || undefined,
    net_hourly_rate: draft.net_hourly_rate,
    night_presence_rate: draft.night_presence_rate || undefined,
    transport_fee: draft.transport_fee || undefined,
    mileage_rate: draft.mileage_rate || undefined,
    benefits_in_kind: draft.benefits_in_kind || undefined,
  }
}

// A money/rate value with its unit, e.g. "12.50 €/h". Named apart from
// lib/utils' locale currency formatter: this deliberately shows the backend's
// raw decimal (mileage keeps its third decimal, which currency rounding drops).
function moneyWithUnit(
  value: string,
  field: MoneyKey,
  t: (key: TranslationKey) => string,
): string {
  return `${value} ${t(MONEY_UNIT[field])}`
}

// The full set of current compensation figures, in the order the editor lists
// them. This is the "all the information" the summary shows rather than the rate
// alone.
function termsFigures(
  terms: ContractTerms,
  t: (key: TranslationKey) => string,
): Figure[] {
  return MONEY_FIELDS.map((mf) => ({
    label: t(mf.label),
    value: moneyWithUnit(terms[mf.name], mf.name, t),
    strong: mf.name === 'net_hourly_rate',
  }))
}

// One day's blocks as a single string, sorted by start time. Shared by the
// schedule summary and the diff so the separator and ordering never drift.
function formatDayBlocks(blocks: ScheduleBlock[], lang: Language): string {
  return [...blocks]
    .sort((a, b) => a.start_time.localeCompare(b.start_time))
    .map((b) => formatTimeRange(b.start_time, b.end_time, lang))
    .join(' · ')
}

// The current weekly schedule as one row per worked day, each listing that day's
// time blocks — the actual hours, not just the weekly total.
function scheduleFigures(
  blocks: ScheduleBlock[],
  t: (key: TranslationKey) => string,
  lang: Language,
): Figure[] {
  const byDay = new Map<number, ScheduleBlock[]>()
  for (const block of blocks) {
    const day = byDay.get(block.weekday) ?? []
    day.push(block)
    byDay.set(block.weekday, day)
  }
  return [...byDay.keys()]
    .sort((a, b) => a - b)
    .map((weekday) => ({
      label: t(WEEKDAY_KEYS[weekday]),
      value: formatDayBlocks(byDay.get(weekday) ?? [], lang),
    }))
}

// A schedule block is a plain day window; the shape is shared with a child's
// presence windows, and so is the day-copying that edits either.
type BlockDraft = DayWindow
interface ScheduleDraft {
  effective_from: string
  blocks: BlockDraft[]
}

const EMPTY_SCHEDULE: ScheduleDraft = { effective_from: '', blocks: [] }

function scheduleToDraft(schedule: ContractSchedule): ScheduleDraft {
  return {
    effective_from: schedule.effective_from,
    blocks: schedule.blocks.map((b) => ({
      weekday: b.weekday,
      // API returns HH:mm:ss; the editor keeps HH:mm.
      start_time: b.start_time.slice(0, 5),
      end_time: b.end_time.slice(0, 5),
    })),
  }
}

function scheduleDraftToInput(draft: ScheduleDraft): ContractScheduleInput {
  return {
    effective_from: draft.effective_from || undefined,
    blocks: draft.blocks,
  }
}

// --- Reusable field groups --------------------------------------------------

function TermsFields({
  draft,
  onChange,
  lang,
}: {
  draft: TermsDraft
  onChange: (patch: Partial<TermsDraft>) => void
  lang: Language
}) {
  const { t } = useI18n()
  const [netBlurred, setNetBlurred] = useState(false)
  // The minimum is date-specific: warn against the minimum for the *effective*
  // date, not today (a rate fine in the past may be below today's minimum).
  const onDate = draft.effective_from || format(new Date(), 'yyyy-MM-dd')
  const { data: minimum } = useQuery({
    queryKey: ['minimum-wage', onDate],
    queryFn: () => getMinimumWage(onDate),
  })
  const min = minimum?.net_hourly_rate
  const netBelow = netBlurred && rateBelowMinimum(draft.net_hourly_rate, min)

  return (
    <div className="flex flex-col gap-4">
      <DateField
        id="terms-effective-from"
        label={t('terms.effectiveFrom')}
        value={draft.effective_from}
        onChange={(v) => onChange({ effective_from: v })}
        lang={lang}
      />
      {MONEY_FIELDS.map((mf) => (
        <div key={mf.name} className="flex flex-col gap-1">
          <Label htmlFor={`terms-${mf.name}`}>{t(mf.label)}</Label>
          <Input
            id={`terms-${mf.name}`}
            inputMode="decimal"
            value={draft[mf.name]}
            // Accept a comma decimal separator and normalise it to a dot.
            onChange={(e) =>
              onChange({
                [mf.name]: e.target.value.replace(',', '.'),
              } as Partial<TermsDraft>)
            }
            onBlur={
              mf.name === 'net_hourly_rate'
                ? () => setNetBlurred(true)
                : undefined
            }
          />
          <span className="text-xs text-muted-foreground">
            {t(mf.hint)}{' '}
            <a
              className="underline"
              href={mf.url}
              target="_blank"
              rel="noreferrer"
            >
              {t('terms.source')}
            </a>
          </span>
          {mf.name === 'net_hourly_rate' && netBelow && (
            <span className="text-xs text-destructive" role="alert">
              {t('terms.belowMinFor')} {min} €
            </span>
          )}
        </div>
      ))}
    </div>
  )
}

function ScheduleFields({
  draft,
  onChange,
  lang,
}: {
  draft: ScheduleDraft
  onChange: (patch: Partial<ScheduleDraft>) => void
  lang: Language
}) {
  const { t } = useI18n()

  return (
    <div className="flex flex-col gap-3">
      <DateField
        id="schedule-effective-from"
        label={t('terms.effectiveFrom')}
        value={draft.effective_from}
        onChange={(v) => onChange({ effective_from: v })}
        lang={lang}
      />
      <DayWindowFields
        windows={draft.blocks}
        onChange={(blocks) => onChange({ blocks })}
        lang={lang}
        idPrefix="block"
        addLabel={t('schedule.addBlock')}
        removeLabel={t('schedule.removeBlock')}
      />
    </div>
  )
}

// --- Consequence confirmation ----------------------------------------------

function ConsequenceDialog({
  lines,
  busy,
  onConfirm,
  onCancel,
}: {
  lines: string[]
  busy: boolean
  onConfirm: () => void
  onCancel: () => void
}) {
  const { t } = useI18n()
  return (
    <Modal title={t('confirm.title')} onClose={onCancel}>
      <ul className="flex list-disc flex-col gap-1 pl-5 text-sm">
        {lines.map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>
      <div className="flex gap-2">
        <Button type="button" onClick={onConfirm} disabled={busy}>
          {busy ? t('nanny.saving') : t('confirm.apply')}
        </Button>
        <Button type="button" variant="outline" onClick={onCancel}>
          {t('common.cancel')}
        </Button>
      </div>
    </Modal>
  )
}

// Is `rate` below the applicable net-hourly minimum? Shared by the live editor
// warning and the pre-submit confirmation so the comparison lives in one place.
function rateBelowMinimum(
  rate: string,
  min: string | null | undefined,
): boolean {
  return min != null && rate !== '' && Number(rate) < Number(min)
}

function belowMinimum(rate: string, current: ContractTerms | null): boolean {
  return rateBelowMinimum(rate, current?.minimum_net_hourly_rate)
}

// --- Modification history: who, and what changed ----------------------------

// One line of a diff. `before` is absent for the very first version (nothing to
// compare against); `changed` marks a line the reader should notice.
interface DiffRow {
  label: string
  before?: string
  after: string
  changed: boolean
}

// A dialog spelling out what one history entry changed against the version it
// superseded — the "what changed" behind the history's "who changed it" line.
function HistoryDiffDialog({
  title,
  subtitle,
  author,
  rows,
  onClose,
}: {
  title: string
  subtitle: string
  author: string | null
  rows: DiffRow[]
  onClose: () => void
}) {
  const { t } = useI18n()
  const initial = rows.every((r) => r.before === undefined)
  return (
    <Modal title={title} onClose={onClose}>
      <div className="flex flex-col gap-1 text-sm">
        <span className="text-muted-foreground">{subtitle}</span>
        {author && (
          <span className="text-muted-foreground">
            {t('history.by')} <span className="text-foreground">{author}</span>
          </span>
        )}
      </div>
      {initial && (
        <p className="text-xs text-muted-foreground">{t('history.initial')}</p>
      )}
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
        {rows.map((row) => (
          <div key={row.label} className="contents">
            <dt className="text-muted-foreground">{row.label}</dt>
            <dd
              className={
                row.changed ? 'font-semibold' : 'text-muted-foreground'
              }
            >
              {/* `changed` is only ever set when `before` is defined, so the
                  unchanged and initial cases both just show `after`. */}
              {row.changed ? (
                <>
                  <span className="text-muted-foreground line-through">
                    {row.before}
                  </span>{' '}
                  → {row.after}
                </>
              ) : (
                row.after
              )}
            </dd>
          </div>
        ))}
      </dl>
      <div className="flex justify-end">
        <Button type="button" variant="outline" onClick={onClose}>
          {t('common.close')}
        </Button>
      </div>
    </Modal>
  )
}

function termsDiffRows(
  item: ContractTerms,
  prev: ContractTerms | undefined,
  t: (key: TranslationKey) => string,
): DiffRow[] {
  return MONEY_FIELDS.map((mf) => ({
    label: t(mf.label),
    before: prev ? moneyWithUnit(prev[mf.name], mf.name, t) : undefined,
    after: moneyWithUnit(item[mf.name], mf.name, t),
    changed: prev ? item[mf.name] !== prev[mf.name] : false,
  }))
}

// One day's blocks as a single string, or an em dash when the nanny doesn't work
// that day — so a day that gained or lost hours reads as a real change.
function dayValue(
  blocks: ScheduleBlock[],
  weekday: number,
  lang: Language,
): string {
  const day = blocks.filter((b) => b.weekday === weekday)
  return day.length === 0 ? '—' : formatDayBlocks(day, lang)
}

function scheduleDiffRows(
  item: ContractSchedule,
  prev: ContractSchedule | undefined,
  t: (key: TranslationKey) => string,
  lang: Language,
): DiffRow[] {
  const weekdays = [
    ...new Set([...item.blocks, ...(prev?.blocks ?? [])].map((b) => b.weekday)),
  ].sort((a, b) => a - b)
  return weekdays.map((weekday) => {
    const after = dayValue(item.blocks, weekday, lang)
    const before = prev ? dayValue(prev.blocks, weekday, lang) : undefined
    return {
      label: t(WEEKDAY_KEYS[weekday]),
      before,
      after,
      changed: before !== undefined && before !== after,
    }
  })
}

// --- Compensation section ---------------------------------------------------

function TermsSection({
  familyId,
  contract,
}: {
  familyId: string
  contract: Contract
}) {
  const { t, lang } = useI18n()
  const queryClient = useQueryClient()
  const [draft, setDraft] = useState<TermsDraft>(EMPTY_TERMS)
  const [editingId, setEditingId] = useState<string | 'new' | null>(null)
  const [errors, setErrors] = useState<string[]>([])
  const [confirming, setConfirming] = useState(false)
  // Index into `history` of the entry whose diff is open, or null.
  const [diffIndex, setDiffIndex] = useState<number | null>(null)

  const { data: history } = useQuery({
    queryKey: ['contract-terms', contract.id],
    queryFn: () => getContractTerms(familyId, contract.id),
  })

  const invalidate = async () => {
    await queryClient.invalidateQueries({
      queryKey: ['contract-terms', contract.id],
    })
    await queryClient.invalidateQueries({ queryKey: ['contracts', familyId] })
  }
  const close = () => {
    setEditingId(null)
    setConfirming(false)
    setErrors([])
  }

  const mutation = useMutation({
    mutationFn: () => {
      const input = termsDraftToInput(draft)
      return editingId === 'new' || editingId === null
        ? createContractTerms(familyId, contract.id, input)
        : updateContractTerms(familyId, contract.id, editingId, input)
    },
    onSuccess: async () => {
      await invalidate()
      close()
    },
    onError: (err) => {
      setErrors(extractErrorMessages(err, t('nanny.error')))
      setConfirming(false)
    },
  })
  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteContractTerms(familyId, contract.id, id),
    onSuccess: invalidate,
  })

  const open = (mode: string | 'new', initial: TermsDraft) => {
    setDraft(initial)
    setEditingId(mode)
    setErrors([])
  }
  const review = () => {
    if (!draft.net_hourly_rate) {
      setErrors([t('terms.rateRequired')])
      return
    }
    setConfirming(true)
  }

  const consequenceLines = () => {
    const lines = [
      editingId === 'new'
        ? t('consequence.newVersion')
        : t('consequence.editInPlace'),
    ]
    if (belowMinimum(draft.net_hourly_rate, contract.current_terms)) {
      lines.push(t('consequence.belowMin'))
    }
    return lines
  }

  const current = contract.current_terms

  return (
    <SectionCard title={t('terms.title')} description={t('terms.description')}>
      {current ? (
        <div className="flex flex-col gap-2">
          <FigureGroup
            title={t('terms.current')}
            rows={termsFigures(current, t)}
            aside={
              <span className="text-xs text-muted-foreground">
                {t('terms.since')} {formatDate(current.effective_from, lang)}
                {current.edited && ` · ${t('common.edited')}`}
              </span>
            }
          />
          {current.below_minimum && (
            <span className="text-sm text-destructive" role="alert">
              {current.warnings[0] ?? t('terms.belowMinimum')}
            </span>
          )}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">{t('terms.none')}</p>
      )}

      {editingId !== null ? (
        <div className="flex flex-col gap-4 rounded-md border p-3">
          <TermsFields
            draft={draft}
            onChange={(p) => setDraft((d) => ({ ...d, ...p }))}
            lang={lang}
          />
          <FormErrors messages={errors} />
          <div className="flex gap-2">
            <Button type="button" onClick={review}>
              {t('terms.review')}
            </Button>
            <Button type="button" variant="outline" onClick={close}>
              {t('common.cancel')}
            </Button>
          </div>
        </div>
      ) : (
        <Button
          type="button"
          variant="outline"
          className="self-start"
          onClick={() => open('new', EMPTY_TERMS)}
        >
          {t('terms.addVersion')}
        </Button>
      )}

      {history && history.length > 0 && (
        <div className="flex flex-col gap-2">
          <h4 className="text-sm font-medium">{t('terms.history')}</h4>
          <ul className="flex flex-col divide-y text-sm">
            {history.map((terms, index) => (
              <li
                key={terms.id}
                className="flex flex-col items-start gap-1 py-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3"
              >
                <span className="flex min-w-0 flex-col">
                  <span className="text-muted-foreground">
                    {effectiveRange(terms, lang, t('nanny.ongoing'))} ·{' '}
                    {moneyWithUnit(terms.net_hourly_rate, 'net_hourly_rate', t)}
                    {terms.edited && ` · ${t('common.edited')}`}
                  </span>
                  {terms.created_by_name && (
                    <span className="text-xs text-muted-foreground">
                      {t('history.by')} {terms.created_by_name}
                    </span>
                  )}
                </span>
                <span className="flex shrink-0 gap-1">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setDiffIndex(index)}
                  >
                    {t('history.viewChanges')}
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => open(terms.id, termsToDraft(terms))}
                  >
                    {t('nanny.edit')}
                  </Button>
                  <ConfirmButton
                    trigger={t('nanny.delete')}
                    title={t('nanny.delete')}
                    description={t('terms.confirmDelete')}
                    onConfirm={() => deleteMutation.mutate(terms.id)}
                  />
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {history && diffIndex !== null && history[diffIndex] && (
        <HistoryDiffDialog
          title={t('terms.title')}
          subtitle={effectiveRange(
            history[diffIndex],
            lang,
            t('nanny.ongoing'),
          )}
          author={history[diffIndex].created_by_name}
          rows={termsDiffRows(history[diffIndex], history[diffIndex + 1], t)}
          onClose={() => setDiffIndex(null)}
        />
      )}

      {confirming && (
        <ConsequenceDialog
          lines={consequenceLines()}
          busy={mutation.isPending}
          onConfirm={() => mutation.mutate()}
          onCancel={() => setConfirming(false)}
        />
      )}
    </SectionCard>
  )
}

// --- Schedule section -------------------------------------------------------

function ScheduleSection({
  familyId,
  contract,
}: {
  familyId: string
  contract: Contract
}) {
  const { t, lang } = useI18n()
  const queryClient = useQueryClient()
  const [draft, setDraft] = useState<ScheduleDraft>(EMPTY_SCHEDULE)
  const [editingId, setEditingId] = useState<string | 'new' | null>(null)
  const [errors, setErrors] = useState<string[]>([])
  const [confirming, setConfirming] = useState(false)
  // Index into `history` of the entry whose diff is open, or null.
  const [diffIndex, setDiffIndex] = useState<number | null>(null)

  const { data: history } = useQuery({
    queryKey: ['contract-schedule', contract.id],
    queryFn: () => getContractSchedules(familyId, contract.id),
  })

  const invalidate = async () => {
    await queryClient.invalidateQueries({
      queryKey: ['contract-schedule', contract.id],
    })
    await queryClient.invalidateQueries({ queryKey: ['contracts', familyId] })
  }
  const close = () => {
    setEditingId(null)
    setConfirming(false)
    setErrors([])
  }

  const mutation = useMutation({
    mutationFn: () => {
      const input = scheduleDraftToInput(draft)
      return editingId === 'new' || editingId === null
        ? createContractSchedule(familyId, contract.id, input)
        : updateContractSchedule(familyId, contract.id, editingId, input)
    },
    onSuccess: async () => {
      await invalidate()
      close()
    },
    onError: (err) => {
      setErrors(extractErrorMessages(err, t('nanny.error')))
      setConfirming(false)
    },
  })
  const deleteMutation = useMutation({
    mutationFn: (id: string) =>
      deleteContractSchedule(familyId, contract.id, id),
    onSuccess: invalidate,
  })

  const open = (mode: string | 'new', initial: ScheduleDraft) => {
    setDraft(initial)
    setEditingId(mode)
    setErrors([])
  }
  const review = () => {
    if (draft.blocks.length === 0) {
      setErrors([t('schedule.empty')])
      return
    }
    setConfirming(true)
  }

  const current = contract.current_schedule

  return (
    <SectionCard
      title={t('schedule.title')}
      description={t('schedule.description')}
    >
      {current ? (
        current.blocks.length > 0 ? (
          <FigureGroup
            title={t('schedule.current')}
            rows={scheduleFigures(current.blocks, t, lang)}
            aside={
              <span className="text-xs text-muted-foreground">
                {current.weekly_hours} {t('schedule.perWeek')} ·{' '}
                {t('terms.since')} {formatDate(current.effective_from, lang)}
                {current.edited && ` · ${t('common.edited')}`}
              </span>
            }
          />
        ) : (
          <p className="text-sm text-muted-foreground">
            {t('schedule.noBlocks')}
          </p>
        )
      ) : (
        <p className="text-sm text-muted-foreground">{t('schedule.none')}</p>
      )}

      {editingId !== null ? (
        <div className="flex flex-col gap-4 rounded-md border p-3">
          <ScheduleFields
            draft={draft}
            onChange={(p) => setDraft((d) => ({ ...d, ...p }))}
            lang={lang}
          />
          <FormErrors messages={errors} />
          <div className="flex gap-2">
            <Button type="button" onClick={review}>
              {t('schedule.review')}
            </Button>
            <Button type="button" variant="outline" onClick={close}>
              {t('common.cancel')}
            </Button>
          </div>
        </div>
      ) : (
        <Button
          type="button"
          variant="outline"
          className="self-start"
          onClick={() => open('new', EMPTY_SCHEDULE)}
        >
          {t('schedule.addVersion')}
        </Button>
      )}

      {history && history.length > 0 && (
        <div className="flex flex-col gap-2">
          <h4 className="text-sm font-medium">{t('schedule.history')}</h4>
          <ul className="flex flex-col divide-y text-sm">
            {history.map((schedule, index) => (
              <li
                key={schedule.id}
                className="flex flex-col items-start gap-1 py-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3"
              >
                <span className="flex min-w-0 flex-col">
                  <span className="text-muted-foreground">
                    {effectiveRange(schedule, lang, t('nanny.ongoing'))} ·{' '}
                    {schedule.weekly_hours} {t('schedule.perWeek')}
                    {schedule.edited && ` · ${t('common.edited')}`}
                  </span>
                  {schedule.created_by_name && (
                    <span className="text-xs text-muted-foreground">
                      {t('history.by')} {schedule.created_by_name}
                    </span>
                  )}
                </span>
                <span className="flex shrink-0 gap-1">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setDiffIndex(index)}
                  >
                    {t('history.viewChanges')}
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => open(schedule.id, scheduleToDraft(schedule))}
                  >
                    {t('nanny.edit')}
                  </Button>
                  <ConfirmButton
                    trigger={t('nanny.delete')}
                    title={t('nanny.delete')}
                    description={t('schedule.confirmDelete')}
                    onConfirm={() => deleteMutation.mutate(schedule.id)}
                  />
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {history && diffIndex !== null && history[diffIndex] && (
        <HistoryDiffDialog
          title={t('schedule.title')}
          subtitle={effectiveRange(
            history[diffIndex],
            lang,
            t('nanny.ongoing'),
          )}
          author={history[diffIndex].created_by_name}
          rows={scheduleDiffRows(
            history[diffIndex],
            history[diffIndex + 1],
            t,
            lang,
          )}
          onClose={() => setDiffIndex(null)}
        />
      )}

      {confirming && (
        <ConsequenceDialog
          lines={[
            editingId === 'new'
              ? t('consequence.scheduleNew')
              : t('consequence.editInPlace'),
          ]}
          busy={mutation.isPending}
          onConfirm={() => mutation.mutate()}
          onCancel={() => setConfirming(false)}
        />
      )}
    </SectionCard>
  )
}

// --- Attaching a family the user also manages -------------------------------

// A user may attach a family to a contract directly (no email invite) only when
// they manage it: one they own, or one they created and nobody has claimed yet.
// Mirrors the backend's Family.can_manage.
function canManageFamily(family: Family): boolean {
  return family.role === 'owner' || (family.role === null && !family.is_claimed)
}

// The families the acting user could attach to this contract: ones they manage,
// that are neither the acting family nor already on it.
function attachableFamilies(
  families: Family[],
  actingFamilyId: string,
  excludeIds: string[],
): Family[] {
  return families.filter(
    (f) =>
      canManageFamily(f) &&
      f.id !== actingFamilyId &&
      !excludeIds.includes(f.id),
  )
}

// One attachable family: a checkbox to include it, and — once included — its
// children to put on the contract alongside it. Its own query so the child list
// loads only when the family is actually chosen.
function AttachFamilyOption({
  family,
  childIds,
  onToggleFamily,
  onToggleChild,
}: {
  family: Family
  // undefined when the family is not selected; a (possibly empty) list otherwise.
  childIds: string[] | undefined
  onToggleFamily: () => void
  onToggleChild: (childId: string) => void
}) {
  const { t } = useI18n()
  const selected = childIds !== undefined
  const { data: children } = useQuery({
    queryKey: ['children', family.id],
    queryFn: () => listChildren(family.id),
    enabled: selected,
  })
  return (
    <div className="flex flex-col gap-1">
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          className="size-4"
          checked={selected}
          onChange={onToggleFamily}
        />
        <span className="font-medium">{family.name}</span>
      </label>
      {selected && (
        <div className="flex flex-col gap-1 pl-6">
          {children && children.length > 0 ? (
            children.map((child: Child) => (
              <label key={child.id} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  className="size-4"
                  checked={(childIds ?? []).includes(child.id)}
                  onChange={() => onToggleChild(child.id)}
                />
                {child.first_name}
              </label>
            ))
          ) : (
            <p className="text-xs text-muted-foreground">
              {t('attach.noChildren')}
            </p>
          )}
        </div>
      )}
    </div>
  )
}

// Choose families the acting user also manages to attach, and which of their
// children come with them. Controlled: `value` maps a family id to its selected
// child ids (a key present means the family is selected).
function ManagedFamilyPicker({
  candidates,
  value,
  onChange,
}: {
  candidates: Family[]
  value: Record<string, string[]>
  onChange: (value: Record<string, string[]>) => void
}) {
  const toggleFamily = (id: string) => {
    const next = { ...value }
    if (id in next) delete next[id]
    else next[id] = []
    onChange(next)
  }
  const toggleChild = (id: string, childId: string) => {
    const current = value[id] ?? []
    onChange({
      ...value,
      [id]: current.includes(childId)
        ? current.filter((c) => c !== childId)
        : [...current, childId],
    })
  }
  return (
    <div className="flex flex-col gap-3">
      {candidates.map((family) => (
        <AttachFamilyOption
          key={family.id}
          family={family}
          childIds={value[family.id]}
          onToggleFamily={() => toggleFamily(family.id)}
          onToggleChild={(childId) => toggleChild(family.id, childId)}
        />
      ))}
    </div>
  )
}

// Attach the picked families to a contract and put their chosen children on it.
// Shared by the wizard (once it has created the contract) and the edit view.
async function applyFamilyAttachments(
  actingFamilyId: string,
  contractId: string,
  selection: Record<string, string[]>,
): Promise<void> {
  // Families are independent of each other, and a family's children of one
  // another; only a family's own attach must precede its children (the child
  // endpoint needs the share to exist). So fan out the families, and each
  // family's children once its attach resolves.
  await Promise.all(
    Object.entries(selection).map(async ([targetFamilyId, childIds]) => {
      await attachContractFamily(actingFamilyId, contractId, targetFamilyId)
      // A child is added through its own family's endpoint — the acting user
      // manages that family, and it now shares the contract, so the child is
      // allowed on it.
      await Promise.all(
        childIds.map((childId) =>
          createContractChild(targetFamilyId, contractId, {
            child: childId,
            windows: [],
          }),
        ),
      )
    }),
  )
}

// --- Sharing section --------------------------------------------------------

function SharingSection({
  familyId,
  contract,
  families,
}: {
  familyId: string
  contract: Contract
  families: Family[]
}) {
  const { t } = useI18n()
  const queryClient = useQueryClient()
  const [email, setEmail] = useState('')
  const [errors, setErrors] = useState<string[]>([])
  const [attachSel, setAttachSel] = useState<Record<string, string[]>>({})

  const attachCandidates = attachableFamilies(
    families,
    familyId,
    contract.families.map((f) => f.id),
  )

  const { data: invitations } = useQuery({
    queryKey: ['contract-invitations', contract.id],
    queryFn: () => getContractInvitations(familyId, contract.id),
  })
  const invalidate = () =>
    queryClient.invalidateQueries({
      queryKey: ['contract-invitations', contract.id],
    })

  const inviteMutation = useMutation({
    mutationFn: () => createContractInvitation(familyId, contract.id, email),
    onSuccess: async () => {
      await invalidate()
      setEmail('')
      setErrors([])
    },
    onError: (err) => setErrors(extractErrorMessages(err, t('nanny.error'))),
  })
  const revokeMutation = useMutation({
    mutationFn: (id: string) =>
      revokeContractInvitation(familyId, contract.id, id),
    onSuccess: invalidate,
  })
  const attachMutation = useMutation({
    mutationFn: () => applyFamilyAttachments(familyId, contract.id, attachSel),
    onSuccess: async () => {
      setAttachSel({})
      setErrors([])
      await queryClient.invalidateQueries({ queryKey: ['contracts', familyId] })
      await queryClient.invalidateQueries({
        queryKey: ['contract-children', contract.id],
      })
    },
    onError: (err) => setErrors(extractErrorMessages(err, t('nanny.error'))),
  })

  const pending = (invitations ?? []).filter((i) => i.status === 'pending')

  return (
    <SectionCard
      title={t('sharing.title')}
      description={t('sharing.description')}
    >
      <ul className="flex flex-col gap-1 text-sm">
        {contract.families.map((f) => (
          <li key={f.id}>
            {f.name}
            {f.is_originator && (
              <span className="text-muted-foreground">
                {' '}
                · {t('sharing.originator')}
              </span>
            )}
          </li>
        ))}
      </ul>

      {attachCandidates.length > 0 && (
        <div className="flex flex-col gap-2 rounded-md border p-3">
          <h4 className="text-sm font-medium">{t('attach.title')}</h4>
          <p className="text-xs text-muted-foreground">{t('attach.hint')}</p>
          <ManagedFamilyPicker
            candidates={attachCandidates}
            value={attachSel}
            onChange={setAttachSel}
          />
          {Object.keys(attachSel).length > 0 && (
            <Button
              type="button"
              className="self-start"
              disabled={attachMutation.isPending}
              onClick={() => attachMutation.mutate()}
            >
              {attachMutation.isPending
                ? t('nanny.saving')
                : t('attach.button')}
            </Button>
          )}
        </div>
      )}

      <form
        className="flex flex-col gap-2"
        onSubmit={(event) => {
          event.preventDefault()
          inviteMutation.mutate()
        }}
      >
        <Label htmlFor="invite-email">{t('sharing.email')}</Label>
        <Input
          id="invite-email"
          type="email"
          value={email}
          required
          onChange={(e) => setEmail(e.target.value)}
        />
        <FormErrors messages={errors} />
        <Button type="submit" disabled={inviteMutation.isPending}>
          {inviteMutation.isPending ? t('sharing.sending') : t('sharing.send')}
        </Button>
      </form>

      {pending.length > 0 && (
        <div className="flex flex-col gap-2">
          <h4 className="text-sm font-medium">{t('sharing.pending')}</h4>
          <ul className="flex flex-col divide-y text-sm">
            {pending.map((invitation) => (
              <li
                key={invitation.id}
                className="flex flex-col items-start gap-1 py-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3"
              >
                <span className="min-w-0 break-all text-muted-foreground">
                  {invitation.email}
                </span>
                <ConfirmButton
                  trigger={t('sharing.revoke')}
                  title={t('sharing.revoke')}
                  description={t('sharing.confirmRevoke')}
                  onConfirm={() => revokeMutation.mutate(invitation.id)}
                />
              </li>
            ))}
          </ul>
        </div>
      )}
    </SectionCard>
  )
}

// --- how the families split the hours ---------------------------------------

const SPLIT_METHODS: SplitMethod[] = ['equal', 'by_children']

// The radios the families set once and can revisit — 50/50 or fair-by-children.
// Just the choices; the caller supplies the heading, so this reads the same in
// the wizard step and the edit card without either repeating the other's title.
function SplitMethodChoice({
  value,
  onChange,
  disabled,
}: {
  value: SplitMethod
  onChange: (value: SplitMethod) => void
  disabled?: boolean
}) {
  const { t } = useI18n()
  return (
    <div className="flex flex-col gap-2">
      {SPLIT_METHODS.map((method) => (
        <label key={method} className="flex items-start gap-2 text-sm">
          <input
            type="radio"
            name="split-method"
            className="mt-0.5 size-4"
            checked={value === method}
            disabled={disabled}
            onChange={() => onChange(method)}
          />
          <span>
            <span className="font-medium">{t(`contract.split.${method}`)}</span>
            <span className="block text-xs text-muted-foreground">
              {t(`contract.split.${method}.hint`)}
            </span>
          </span>
        </label>
      ))}
    </div>
  )
}

// Editing the split on an existing contract. Its own card so it reads alongside
// the schedule and children it depends on. Saved immediately — a radio has no
// draft worth keeping.
function SplitSection({
  familyId,
  contract,
}: {
  familyId: string
  contract: Contract
}) {
  const { t } = useI18n()
  const queryClient = useQueryClient()
  const [errors, setErrors] = useState<string[]>([])

  const mutation = useMutation({
    mutationFn: (split_method: SplitMethod) =>
      updateContract(familyId, contract.id, { split_method }),
    onSuccess: async () => {
      setErrors([])
      await queryClient.invalidateQueries({ queryKey: ['contracts', familyId] })
    },
    onError: (err) => setErrors(extractErrorMessages(err, t('nanny.error'))),
  })

  return (
    <SectionCard
      title={t('contract.split')}
      description={t('contract.splitHint')}
    >
      <SplitMethodChoice
        value={contract.split_method}
        onChange={(method) => mutation.mutate(method)}
        disabled={mutation.isPending}
      />
      <FormErrors messages={errors} />
    </SectionCard>
  )
}

// --- Onboarding wizard ------------------------------------------------------

// The order of the wizard, and the only place it is written down.
const WIZARD_STEPS: TranslationKey[] = [
  'wizard.nanny',
  'wizard.compensation',
  'wizard.hours',
  'wizard.children',
  'wizard.daysOff',
  'wizard.share',
]

function ContractWizard({
  familyId,
  nannies,
  families,
  onClose,
  onCreated,
}: {
  familyId: string
  nannies: Nanny[]
  families: Family[]
  onClose: () => void
  onCreated: () => void
}) {
  const { t, lang } = useI18n()
  const [step, setStep] = useState(0)
  const [errors, setErrors] = useState<string[]>([])
  const [useExisting, setUseExisting] = useState(false)
  const [nannyId, setNannyId] = useState<string>('')
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [startingDate, setStartingDate] = useState('')
  const [paidLeave, setPaidLeave] = useState('')
  const [splitMethod, setSplitMethod] = useState<SplitMethod>('equal')
  const [terms, setTerms] = useState<TermsDraft>(EMPTY_TERMS)
  const [schedule, setSchedule] = useState<ScheduleDraft>(EMPTY_SCHEDULE)
  const [childIds, setChildIds] = useState<string[]>([])
  const [shareEmail, setShareEmail] = useState('')
  // Families the user also manages, to attach directly (see ManagedFamilyPicker).
  const [attachSel, setAttachSel] = useState<Record<string, string[]>>({})
  const attachCandidates = attachableFamilies(families, familyId, [])

  // Whose children are on offer: this family's own. The other family adds its
  // own from its side once the contract is shared.
  const { data: children } = useQuery({
    queryKey: ['children', familyId],
    queryFn: () => listChildren(familyId),
  })

  const toggleChild = (id: string) =>
    setChildIds((prev) =>
      prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id],
    )

  const mutation = useMutation({
    mutationFn: async () => {
      const input: ContractInput = {
        starting_date: startingDate,
        paid_leave_days: paidLeave ? Number(paidLeave) : undefined,
        split_method: splitMethod,
        ...(useExisting
          ? { nanny_id: nannyId }
          : { first_name: firstName, last_name: lastName }),
      }
      const contract = await createContract(familyId, input)
      if (terms.net_hourly_rate) {
        await createContractTerms(
          familyId,
          contract.id,
          termsDraftToInput(terms),
        )
      }
      if (schedule.blocks.length > 0) {
        await createContractSchedule(
          familyId,
          contract.id,
          scheduleDraftToInput(schedule),
        )
      }
      // Whole-time presence: the wizard's children are there whenever the nanny
      // works, which is the common case. Narrowing is the section's job.
      for (const id of childIds) {
        await createContractChild(familyId, contract.id, {
          child: id,
          windows: [],
        })
      }
      if (shareEmail) {
        await createContractInvitation(familyId, contract.id, shareEmail)
      }
      // Families the user manages themselves are attached directly, with the
      // children they bring — no invitation to accept.
      await applyFamilyAttachments(familyId, contract.id, attachSel)
    },
    onSuccess: onCreated,
    onError: (err) => setErrors(extractErrorMessages(err, t('nanny.error'))),
  })

  const canLeaveStep1 =
    !!startingDate && (useExisting ? nannyId !== '' : !!firstName && !!lastName)

  const next = () => {
    setErrors([])
    if (step === 0 && !canLeaveStep1) {
      setErrors([t('wizard.nannyError')])
      return
    }
    setStep((s) => s + 1)
  }

  return (
    <Modal
      title={t('wizard.title')}
      onClose={onClose}
      // On a phone the wizard takes the whole screen bar a margin: the square
      // below would leave the step body barely a couple of fields tall. From sm
      // up it is a large centred square (≥80% width where it fits, capped to
      // stay on screen) with a substantial margin around it.
      className="flex h-[calc(100dvh-2rem)] w-full flex-col gap-4 sm:h-[min(80vw,88vh)] sm:w-[min(80vw,88vh)] sm:max-w-none"
    >
      <div className="flex items-center justify-between border-b pb-2">
        <p className="text-sm font-medium">{t(WIZARD_STEPS[step])}</p>
        <p className="text-sm text-muted-foreground">
          {t('wizard.step')} {step + 1} {t('wizard.of')} {WIZARD_STEPS.length}
        </p>
      </div>

      {/* Scrollable step body; the header and footer nav stay pinned. */}
      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto">
        {step === 0 && (
          <div className="flex flex-col gap-4">
            {nannies.length > 0 && (
              <label className="flex items-center gap-2 py-1 text-sm">
                <input
                  type="checkbox"
                  className="size-4"
                  checked={useExisting}
                  onChange={(e) => setUseExisting(e.target.checked)}
                />
                {t('wizard.existingNanny')}
              </label>
            )}
            {useExisting ? (
              <div className="flex flex-col gap-1">
                <Label htmlFor="wizard-nanny">{t('wizard.pickNanny')}</Label>
                <Select value={nannyId} onValueChange={setNannyId}>
                  <SelectTrigger id="wizard-nanny">
                    <SelectValue placeholder="—" />
                  </SelectTrigger>
                  <SelectContent>
                    {nannies.map((n) => (
                      <SelectItem key={n.id} value={n.id}>
                        {n.first_name} {n.last_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : (
              <>
                <div className="flex flex-col gap-1">
                  <Label htmlFor="wizard-first">{t('nanny.firstName')}</Label>
                  <Input
                    id="wizard-first"
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <Label htmlFor="wizard-last">{t('nanny.lastName')}</Label>
                  <Input
                    id="wizard-last"
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                  />
                </div>
              </>
            )}
            <DateField
              id="wizard-start"
              label={t('nanny.startDate')}
              value={startingDate}
              onChange={setStartingDate}
              lang={lang}
              required
            />
          </div>
        )}

        {step === 1 && (
          <TermsFields
            draft={terms}
            onChange={(p) => setTerms((d) => ({ ...d, ...p }))}
            lang={lang}
          />
        )}

        {step === 2 && (
          <ScheduleFields
            draft={schedule}
            onChange={(p) => setSchedule((d) => ({ ...d, ...p }))}
            lang={lang}
          />
        )}

        {step === 3 && (
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-2 text-sm font-medium">
              {t('wizard.childrenOptional')}
            </legend>
            {children && children.length > 0 ? (
              <>
                {children.map((c) => (
                  <label key={c.id} className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={childIds.includes(c.id)}
                      onChange={() => toggleChild(c.id)}
                    />
                    {c.first_name}
                  </label>
                ))}
                <p className="text-xs text-muted-foreground">
                  {t('wizard.childrenHint')}
                </p>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">
                {t('contractChild.noChildren')}
              </p>
            )}
          </fieldset>
        )}

        {step === 4 && (
          <div className="flex flex-col gap-1">
            <Label htmlFor="wizard-leave">{t('contract.paidLeave')}</Label>
            <Input
              id="wizard-leave"
              inputMode="numeric"
              value={paidLeave}
              onChange={(e) => setPaidLeave(e.target.value)}
            />
          </div>
        )}

        {step === 5 && (
          <div className="flex flex-col gap-4">
            {attachCandidates.length > 0 && (
              <div className="flex flex-col gap-2">
                <p className="text-sm font-medium">{t('attach.title')}</p>
                <p className="text-xs text-muted-foreground">
                  {t('attach.hint')}
                </p>
                <ManagedFamilyPicker
                  candidates={attachCandidates}
                  value={attachSel}
                  onChange={setAttachSel}
                />
              </div>
            )}
            <div className="flex flex-col gap-1">
              <Label htmlFor="wizard-share">{t('wizard.shareOptional')}</Label>
              <Input
                id="wizard-share"
                type="email"
                value={shareEmail}
                onChange={(e) => setShareEmail(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-2">
              <p className="text-sm font-medium">{t('contract.split')}</p>
              <p className="text-xs text-muted-foreground">
                {t('contract.splitHint')}
              </p>
              <SplitMethodChoice
                value={splitMethod}
                onChange={setSplitMethod}
              />
            </div>
          </div>
        )}

        <FormErrors messages={errors} />
      </div>

      <div className="flex justify-between gap-2 border-t pt-3">
        <Button
          type="button"
          variant="outline"
          disabled={step === 0}
          onClick={() => setStep((s) => s - 1)}
        >
          {t('wizard.back')}
        </Button>
        {step < WIZARD_STEPS.length - 1 ? (
          <Button type="button" onClick={next}>
            {t('wizard.next')}
          </Button>
        ) : (
          <Button
            type="button"
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending}
          >
            {mutation.isPending ? t('wizard.creating') : t('wizard.finish')}
          </Button>
        )}
      </div>
    </Modal>
  )
}

// --- Page -------------------------------------------------------------------

// Deleting a contract is destructive and reaches beyond the acting family — the
// other employer loses it too, along with the planning and every declaration —
// so it goes through the type-to-confirm gate. The phrase is localised whole
// (verb included), so it reads in the user's language.
function DeleteContractDialog({
  nanny,
  busy,
  onConfirm,
}: {
  nanny: Nanny
  busy: boolean
  onConfirm: () => void
}) {
  const { t } = useI18n()
  return (
    <ConfirmByTypingDialog
      trigger={t('nanny.delete')}
      title={t('contract.delete.title')}
      lead={t('contract.delete.lead')}
      consequences={[
        t('contract.delete.consequence1'),
        t('contract.delete.consequence2'),
        t('contract.delete.consequence3'),
      ]}
      promptLabel={t('contract.delete.prompt')}
      phrase={`${t('contract.delete.verb')} ${nanny.first_name} ${nanny.last_name}`}
      confirmLabel={t('nanny.delete')}
      busy={busy}
      onConfirm={onConfirm}
    />
  )
}

// Contract invitations addressed to the logged-in user — how an existing
// account discovers a shared contract they've been invited to join. Accepting
// requires choosing which of the user's families joins the contract.
function PendingContractInvitationsSection({
  families,
}: {
  families: Family[]
}) {
  const { t } = useI18n()
  const queryClient = useQueryClient()
  // Per-invitation choice of which family joins; defaults to the first one.
  const [joinAs, setJoinAs] = useState<Record<string, string>>({})

  const { data: invitations } = useQuery({
    queryKey: ['my-contract-invitations'],
    queryFn: getMyContractInvitations,
  })

  const acceptMutation = useMutation({
    mutationFn: ({ token, familyId }: { token: string; familyId: string }) =>
      acceptContractInvitation(token, familyId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['my-contract-invitations'] })
      queryClient.invalidateQueries({ queryKey: ['contracts'] })
    },
  })
  const declineMutation = useMutation({
    mutationFn: (token: string) => declineContractInvitation(token),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ['my-contract-invitations'] }),
  })

  if (!invitations || invitations.length === 0) return null
  const manageable = families.filter(canManageFamily)
  const busy = acceptMutation.isPending || declineMutation.isPending

  return (
    <SectionCard title={t('contract.inbox.title')} className="max-w-2xl">
      <ul className="flex flex-col divide-y">
        {invitations.map((invite) => {
          const familyId = joinAs[invite.id] ?? manageable[0]?.id
          return (
            <li
              key={invite.id}
              className="flex flex-wrap items-center justify-between gap-3 py-3 first:pt-0 last:pb-0"
            >
              <div className="flex min-w-0 items-center gap-3">
                <PersonAvatar
                  name={`${invite.nanny_first_name} ${invite.nanny_last_name}`}
                />
                <div className="flex min-w-0 flex-col gap-0.5">
                  <span className="font-medium break-words text-foreground">
                    {invite.nanny_first_name} {invite.nanny_last_name}
                  </span>
                  <span className="text-sm text-muted-foreground">
                    {t('contract.inbox.subtitle')}
                  </span>
                </div>
              </div>
              {manageable.length === 0 ? (
                <span className="text-sm text-muted-foreground">
                  {t('contract.inbox.noFamily')}
                </span>
              ) : (
                <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
                  {manageable.length > 1 && (
                    <Select
                      value={familyId}
                      onValueChange={(value) =>
                        setJoinAs((prev) => ({
                          ...prev,
                          [invite.id]: value,
                        }))
                      }
                    >
                      <SelectTrigger
                        aria-label={t('contract.inbox.joinAs')}
                        className="w-auto"
                      >
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {manageable.map((f) => (
                          <SelectItem key={f.id} value={f.id}>
                            {f.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                  <Button
                    type="button"
                    size="sm"
                    disabled={busy}
                    onClick={() =>
                      acceptMutation.mutate({ token: invite.token, familyId })
                    }
                  >
                    {t('invite.accept')}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={busy}
                    onClick={() => declineMutation.mutate(invite.token)}
                  >
                    {t('invite.decline')}
                  </Button>
                </div>
              )}
            </li>
          )
        })}
      </ul>
    </SectionCard>
  )
}

export default function Nannies() {
  const { t, lang } = useI18n()
  const queryClient = useQueryClient()
  const [familyId, setFamilyId] = useState<string | null>(null)
  const [openId, setOpenId] = useState<string | null>(null)
  const [wizardOpen, setWizardOpen] = useState(false)

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

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteContract(activeFamilyId as string, id),
    onSuccess: () =>
      queryClient.invalidateQueries({
        queryKey: ['contracts', activeFamilyId],
      }),
  })

  // Nannies the acting family already works with, for reuse in the wizard.
  const knownNannies = useMemo(() => {
    const map = new Map<string, Nanny>()
    for (const c of contracts ?? []) map.set(c.nanny.id, c.nanny)
    return [...map.values()]
  }, [contracts])

  if (!families || families.length === 0) {
    return (
      <main className="flex flex-1 flex-col gap-6 p-4 sm:p-10">
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
          {t('nanny.title')}
        </h1>
        <PendingContractInvitationsSection families={families ?? []} />
        <p className="text-sm text-muted-foreground">
          {t('contract.noFamilies')}
        </p>
      </main>
    )
  }

  return (
    <main className="flex flex-1 flex-col gap-6 p-4 sm:p-10">
      <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
        {t('nanny.title')}
      </h1>

      <PendingContractInvitationsSection families={families} />

      <div className="flex w-full max-w-xs flex-col gap-2">
        <Label htmlFor="acting-family">{t('contract.selectFamily')}</Label>
        <Select
          value={activeFamilyId ?? ''}
          onValueChange={(value) => {
            setFamilyId(value)
            setOpenId(null)
          }}
        >
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

      <Button
        type="button"
        className="self-start"
        onClick={() => setWizardOpen(true)}
      >
        {t('contract.addTitle')}
      </Button>

      <Card className="max-w-2xl">
        <CardContent>
          {isLoading ? (
            <p className="text-sm text-muted-foreground">
              {t('contract.loading')}
            </p>
          ) : isError ? (
            <p className="text-sm text-destructive" role="alert">
              {t('contract.loadError')}
            </p>
          ) : contracts && contracts.length > 0 ? (
            <ul className="flex flex-col divide-y">
              {contracts.map((contract) => (
                <li
                  key={contract.id}
                  className="flex flex-col gap-3 py-3 first:pt-0 last:pb-0"
                >
                  <div className="flex flex-col items-start gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
                    <div className="flex min-w-0 items-center gap-3">
                      <PersonAvatar
                        name={`${contract.nanny.first_name} ${contract.nanny.last_name}`}
                      />
                      <div className="flex min-w-0 flex-col gap-0.5">
                        <span className="font-medium break-words">
                          {contract.nanny.first_name} {contract.nanny.last_name}
                        </span>
                        <span className="text-sm text-muted-foreground">
                          {formatDate(contract.starting_date, lang)} →{' '}
                          {contract.ending_date
                            ? formatDate(contract.ending_date, lang)
                            : t('nanny.ongoing')}
                          {' · '}
                          {contract.paid_leave_days} {t('contract.daysOff')}
                        </span>
                      </div>
                    </div>
                    <div className="flex shrink-0 gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        type="button"
                        onClick={() =>
                          setOpenId((prev) =>
                            prev === contract.id ? null : contract.id,
                          )
                        }
                      >
                        {openId === contract.id
                          ? t('contract.close')
                          : t('contract.manage')}
                      </Button>
                      <DeleteContractDialog
                        nanny={contract.nanny}
                        busy={deleteMutation.isPending}
                        onConfirm={() => deleteMutation.mutate(contract.id)}
                      />
                    </div>
                  </div>
                  {openId === contract.id && activeFamilyId !== null && (
                    <div className="flex flex-col gap-4">
                      <TermsSection
                        familyId={activeFamilyId}
                        contract={contract}
                      />
                      <ScheduleSection
                        familyId={activeFamilyId}
                        contract={contract}
                      />
                      <ContractChildrenSection
                        familyId={activeFamilyId}
                        contract={contract}
                      />
                      <SplitSection
                        familyId={activeFamilyId}
                        contract={contract}
                      />
                      <SharingSection
                        familyId={activeFamilyId}
                        contract={contract}
                        families={families}
                      />
                    </div>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">
              {t('contract.empty')}
            </p>
          )}
        </CardContent>
      </Card>

      {wizardOpen && activeFamilyId !== null && (
        <ContractWizard
          familyId={activeFamilyId}
          nannies={knownNannies}
          families={families}
          onClose={() => setWizardOpen(false)}
          onCreated={() => {
            queryClient.invalidateQueries({
              queryKey: ['contracts', activeFamilyId],
            })
            setWizardOpen(false)
          }}
        />
      )}
    </main>
  )
}
