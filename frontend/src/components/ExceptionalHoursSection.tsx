import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import type { Contract } from '@/src/api/contracts'
import {
  createExceptionalHours,
  deleteExceptionalHours,
  type ExceptionalHours,
  type ExceptionalHoursInput,
  type ExceptionalKind,
  exceptionalHoursQueryOptions,
  updateExceptionalHours,
} from '@/src/api/declarations'
import { extractErrorMessages } from '@/src/api/errors'
import { ConfirmButton } from '@/src/components/ConfirmButton'
import { DateField, formatDate } from '@/src/components/DateField'
import { FormErrors } from '@/src/components/FormErrors'
import { SectionCard } from '@/src/components/SectionCard'
import { hhmm, TimeField, toDisplayTime } from '@/src/components/TimeField'
import { Button } from '@/src/components/ui/button'
import { Input } from '@/src/components/ui/input'
import { Label } from '@/src/components/ui/label'
import { useI18n } from '@/src/i18n/I18nContext'
import type { Language, TranslationKey } from '@/src/i18n/translations'
import { overlapsMonth } from '@/src/lib/months'
import { selectClass } from '@/src/lib/utils'

interface HoursDraft {
  kind: ExceptionalKind
  is_shared: boolean
  start_date: string
  start_time: string
  end_date: string
  end_time: string
  interventions: string
  notes: string
}

const EMPTY_HOURS: HoursDraft = {
  kind: 'effective',
  is_shared: false,
  start_date: '',
  start_time: '',
  end_date: '',
  end_time: '',
  interventions: '',
  notes: '',
}

const KIND_KEYS: Record<ExceptionalKind, TranslationKey> = {
  effective: 'exceptional.kind.effective',
  presence_responsable: 'exceptional.kind.presence_responsable',
  night_presence: 'exceptional.kind.night_presence',
}

function entryToDraft(entry: ExceptionalHours): HoursDraft {
  return {
    kind: entry.kind,
    is_shared: entry.is_shared,
    start_date: entry.start_date,
    start_time: hhmm(entry.start_time),
    end_date: entry.end_date,
    end_time: hhmm(entry.end_time),
    interventions: String(entry.interventions),
    notes: entry.notes,
  }
}

function hoursDraftToInput(draft: HoursDraft): ExceptionalHoursInput {
  // Interventions count the times the nanny was woken, so they only mean
  // anything for a night. Any other kind files zero rather than carrying over a
  // count left behind by a change of mind.
  const night = draft.kind === 'night_presence'
  return {
    kind: draft.kind,
    is_shared: draft.is_shared,
    start_date: draft.start_date,
    start_time: draft.start_time,
    end_date: draft.end_date,
    end_time: draft.end_time,
    interventions: night ? Number(draft.interventions || 0) : 0,
    notes: draft.notes || undefined,
  }
}

// The same window, whoever filed it — how a family's shared entry is matched to
// the other family's, so a prompt disappears once it has been answered.
function sameWindow(a: ExceptionalHours, b: ExceptionalHours): boolean {
  return (
    a.start_date === b.start_date &&
    a.start_time === b.start_time &&
    a.end_date === b.end_date &&
    a.end_time === b.end_time
  )
}

function HoursFields({
  draft,
  onChange,
  lang,
  sharedAllowed,
}: {
  draft: HoursDraft
  onChange: (patch: Partial<HoursDraft>) => void
  lang: Language
  // Only a shared-care contract can mark hours shared; a solo one pays them whole.
  sharedAllowed: boolean
}) {
  const { t } = useI18n()

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <Label htmlFor="hours-kind">{t('exceptional.kind')}</Label>
        <select
          id="hours-kind"
          className={selectClass}
          value={draft.kind}
          onChange={(e) =>
            onChange({ kind: e.target.value as ExceptionalKind })
          }
        >
          {(Object.keys(KIND_KEYS) as ExceptionalKind[]).map((kind) => (
            <option key={kind} value={kind}>
              {t(KIND_KEYS[kind])}
            </option>
          ))}
        </select>
      </div>
      {sharedAllowed && (
        <div className="flex flex-col gap-1">
          <label className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              className="mt-0.5 size-4"
              checked={draft.is_shared}
              onChange={(e) => onChange({ is_shared: e.target.checked })}
            />
            <span>
              <span className="font-medium">{t('exceptional.shared')}</span>
              <span className="block text-xs text-muted-foreground">
                {t('exceptional.sharedHint')}
              </span>
            </span>
          </label>
        </div>
      )}
      <DateField
        id="hours-start-date"
        label={t('exceptional.startDate')}
        value={draft.start_date}
        onChange={(v) => onChange({ start_date: v })}
        lang={lang}
        required
      />
      <TimeField
        id="hours-start-time"
        label={t('exceptional.startTime')}
        value={draft.start_time}
        onChange={(v) => onChange({ start_time: v })}
        lang={lang}
      />
      {/* Its own date, not the start's: a night runs past midnight. */}
      <DateField
        id="hours-end-date"
        label={t('exceptional.endDate')}
        value={draft.end_date}
        onChange={(v) => onChange({ end_date: v })}
        lang={lang}
        required
      />
      <TimeField
        id="hours-end-time"
        label={t('exceptional.endTime')}
        value={draft.end_time}
        onChange={(v) => onChange({ end_time: v })}
        lang={lang}
      />
      {draft.kind === 'night_presence' && (
        <div className="flex flex-col gap-1">
          <Label htmlFor="hours-interventions">
            {t('exceptional.interventions')}
          </Label>
          <Input
            id="hours-interventions"
            inputMode="numeric"
            value={draft.interventions}
            onChange={(e) =>
              onChange({ interventions: e.target.value.replace(/\D/g, '') })
            }
          />
          <p className="text-xs text-muted-foreground">
            {t('exceptional.interventionsHint')}
          </p>
        </div>
      )}
      <div className="flex flex-col gap-1">
        <Label htmlFor="hours-notes">{t('exceptional.notes')}</Label>
        <Input
          id="hours-notes"
          value={draft.notes}
          onChange={(e) => onChange({ notes: e.target.value })}
        />
      </div>
    </div>
  )
}

// The hours a nanny worked beyond the planning, for one contract. Read is
// contract-wide — a family's own pay depends on what the other filed, so it must
// see those entries — but only the acting family's own are editable.
//
// Which kinds may be combined with what is the convention's business, not ours:
// the API answers 400 with the reason (a présence responsable on a shared
// contract, hours that overlap the planning), and that message is what shows.
export function ExceptionalHoursSection({
  familyId,
  contract,
  month,
}: {
  familyId: string
  contract: Contract
  month: string
}) {
  const { t, lang } = useI18n()
  const queryClient = useQueryClient()
  const [draft, setDraft] = useState<HoursDraft>(EMPTY_HOURS)
  const [editingId, setEditingId] = useState<string | 'new' | null>(null)
  const [errors, setErrors] = useState<string[]>([])

  // A contract with a second family can share hours; a solo one always pays them
  // whole, so the shared checkbox and the "add yours" prompts are hidden there.
  const isShared = contract.families.length > 1

  const { data: entries, isError } = useQuery(
    exceptionalHoursQueryOptions(familyId, contract.id),
  )

  const invalidate = () =>
    queryClient.invalidateQueries({
      queryKey: ['exceptional-hours', contract.id],
    })
  const close = () => {
    setEditingId(null)
    setErrors([])
  }

  const mutation = useMutation({
    mutationFn: () => {
      const input = hoursDraftToInput(draft)
      return editingId === 'new' || editingId === null
        ? createExceptionalHours(familyId, contract.id, input)
        : updateExceptionalHours(familyId, contract.id, editingId, input)
    },
    onSuccess: async () => {
      await invalidate()
      close()
    },
    onError: (err) => setErrors(extractErrorMessages(err, t('nanny.error'))),
  })
  const deleteMutation = useMutation({
    mutationFn: (id: string) =>
      deleteExceptionalHours(familyId, contract.id, id),
    onSuccess: invalidate,
  })

  const open = (mode: string | 'new', initial: HoursDraft) => {
    setDraft(initial)
    setEditingId(mode)
    setErrors([])
  }
  const submit = () => {
    if (!draft.start_date || !draft.end_date) {
      setErrors([t('exceptional.datesRequired')])
      return
    }
    if (!draft.start_time || !draft.end_time) {
      setErrors([t('exceptional.timesRequired')])
      return
    }
    mutation.mutate()
  }

  const describe = (entry: ExceptionalHours) => {
    const from = `${formatDate(entry.start_date, lang)} ${toDisplayTime(hhmm(entry.start_time), lang)}`
    // A night ends the next day; spell that date out rather than leave the
    // reader to assume the entry closed before midnight.
    const to =
      entry.start_date === entry.end_date
        ? toDisplayTime(hhmm(entry.end_time), lang)
        : `${formatDate(entry.end_date, lang)} ${toDisplayTime(hhmm(entry.end_time), lang)}`
    const woken =
      entry.kind === 'night_presence' && entry.interventions > 0
        ? ` · ${entry.interventions} ${t('exceptional.interventionsShort')}`
        : ''
    const shared = entry.is_shared ? ` · ${t('exceptional.shared')}` : ''
    return `${from} → ${to} · ${t(KIND_KEYS[entry.kind])}${woken}${shared}`
  }

  const monthMatch = (entry: ExceptionalHours) =>
    overlapsMonth(entry.start_date, entry.end_date, month)

  // The endpoint returns this family's own entries and every family's shared
  // ones, so ownership tells the two apart. Own entries are editable; the
  // other family's shared entries are read-only, and only surface as prompts.
  const own = (entries ?? []).filter((entry) => entry.family === familyId)
  const othersShared = (entries ?? []).filter(
    (entry) => entry.family !== familyId,
  )
  const visibleOwn = own.filter(monthMatch)

  // The other family logged shared care and this family has not matched it yet.
  // Answering the prompt files an identical shared entry, so each declares its
  // own contractual share of the same hours.
  const prompts = othersShared.filter(
    (other) =>
      monthMatch(other) &&
      !own.some((mine) => mine.is_shared && sameWindow(mine, other)),
  )

  const answerPrompt = (other: ExceptionalHours) =>
    open('new', {
      kind: other.kind,
      is_shared: true,
      start_date: other.start_date,
      start_time: hhmm(other.start_time),
      end_date: other.end_date,
      end_time: hhmm(other.end_time),
      interventions: String(other.interventions),
      notes: '',
    })

  return (
    <SectionCard
      title={`${contract.nanny.first_name} ${contract.nanny.last_name}`}
    >
      {editingId !== null ? (
        <div className="flex flex-col gap-4 rounded-md border p-3">
          <HoursFields
            draft={draft}
            onChange={(p) => setDraft((d) => ({ ...d, ...p }))}
            lang={lang}
            sharedAllowed={isShared}
          />
          <FormErrors messages={errors} />
          <div className="flex gap-2">
            <Button
              type="button"
              onClick={submit}
              disabled={mutation.isPending}
            >
              {t('exceptional.hours.save')}
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
          onClick={() => open('new', EMPTY_HOURS)}
        >
          {t('exceptional.hours.add')}
        </Button>
      )}

      {prompts.length > 0 && (
        <div className="flex flex-col gap-2 rounded-md border border-primary/40 bg-primary/5 p-3">
          <p className="text-sm font-medium">
            {t('exceptional.sharedPromptTitle')}
          </p>
          <ul className="flex flex-col gap-2 text-sm">
            {prompts.map((other) => (
              <li
                key={other.id}
                className="flex flex-col items-start gap-1 sm:flex-row sm:items-center sm:justify-between sm:gap-3"
              >
                <span className="min-w-0 text-muted-foreground">
                  {describe(other)}
                </span>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="shrink-0"
                  onClick={() => answerPrompt(other)}
                >
                  {t('exceptional.sharedPromptAdd')}
                </Button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {isError ? (
        // A failed load renders nothing to list; without this it reads as "none
        // this month", and a parent re-adds an entry that already exists.
        <p className="text-sm text-destructive">{t('exceptional.loadError')}</p>
      ) : visibleOwn.length > 0 ? (
        <ul className="flex flex-col divide-y text-sm">
          {visibleOwn.map((entry) => (
            // describe() is a long sentence (two dates, two times, the kind);
            // beside two non-shrinking buttons it would collapse to a few words
            // per line.
            <li
              key={entry.id}
              className="flex flex-col items-start gap-1 py-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3"
            >
              <span className="min-w-0 text-muted-foreground">
                {describe(entry)}
              </span>
              <span className="flex shrink-0 gap-1">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => open(entry.id, entryToDraft(entry))}
                >
                  {t('nanny.edit')}
                </Button>
                <ConfirmButton
                  trigger={t('nanny.delete')}
                  title={t('nanny.delete')}
                  description={t('exceptional.hours.confirmDelete')}
                  onConfirm={() => deleteMutation.mutate(entry.id)}
                />
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">
          {t('exceptional.hours.noneThisMonth')}
        </p>
      )}
    </SectionCard>
  )
}
