import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { format } from 'date-fns'
import { useMemo, useState } from 'react'
import {
  acceptContractInvitation,
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
  updateContractSchedule,
  updateContractTerms,
} from '@/src/api/contracts'
import { extractErrorMessages } from '@/src/api/errors'
import { type Family, getFamilies } from '@/src/api/family'
import { ConfirmButton } from '@/src/components/ConfirmButton'
import { DateField, formatDate } from '@/src/components/DateField'
import { FormErrors } from '@/src/components/FormErrors'
import { Modal } from '@/src/components/Modal'
import { SectionCard } from '@/src/components/SectionCard'
import { TimeField } from '@/src/components/TimeField'
import { Button } from '@/src/components/ui/button'
import { Card, CardContent } from '@/src/components/ui/card'
import { Input } from '@/src/components/ui/input'
import { Label } from '@/src/components/ui/label'
import { useI18n } from '@/src/i18n/I18nContext'
import type { Language, TranslationKey } from '@/src/i18n/translations'
import { selectClass } from '@/src/lib/utils'

// --- Static reference content -----------------------------------------------

const URSSAF_MIN =
  'https://www.urssaf.fr/accueil/particulier/particulier-employeur/embaucher-un-salarie/remunerer-salarie-domicile.html#ancre-les-montants-minimums'
const URSSAF_IND =
  'https://www.urssaf.fr/accueil/particulier/particulier-employeur/embaucher-un-salarie/remunerer-salarie-domicile.html#ancre-les-indemnites'

type MoneyKey =
  | 'net_hourly_rate'
  | 'transport_fee'
  | 'mileage_rate'
  | 'benefits_in_kind'

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

const WEEKDAY_KEYS: TranslationKey[] = [
  'weekday.mon',
  'weekday.tue',
  'weekday.wed',
  'weekday.thu',
  'weekday.fri',
  'weekday.sat',
  'weekday.sun',
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
  transport_fee: '',
  mileage_rate: '',
  benefits_in_kind: '',
}

function termsToDraft(terms: ContractTerms): TermsDraft {
  return {
    effective_from: terms.effective_from,
    net_hourly_rate: terms.net_hourly_rate,
    transport_fee: terms.transport_fee,
    mileage_rate: terms.mileage_rate,
    benefits_in_kind: terms.benefits_in_kind,
  }
}

function termsDraftToInput(draft: TermsDraft): ContractTermsInput {
  return {
    effective_from: draft.effective_from || undefined,
    net_hourly_rate: draft.net_hourly_rate,
    transport_fee: draft.transport_fee || undefined,
    mileage_rate: draft.mileage_rate || undefined,
    benefits_in_kind: draft.benefits_in_kind || undefined,
  }
}

interface BlockDraft {
  weekday: number
  start_time: string
  end_time: string
}
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

// Copy every block of `from` onto each `toDays`, replacing those days.
export function duplicateDayBlocks(
  blocks: BlockDraft[],
  from: number,
  toDays: number[],
): BlockDraft[] {
  const source = blocks.filter((b) => b.weekday === from)
  const kept = blocks.filter((b) => !toDays.includes(b.weekday))
  const added = toDays.flatMap((day) =>
    source.map((b) => ({ ...b, weekday: day })),
  )
  return [...kept, ...added]
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
  // The day being copied from (its "Copy day" button was clicked), or null.
  const [copyFrom, setCopyFrom] = useState<number | null>(null)
  const [copyTo, setCopyTo] = useState<number[]>([])

  // Keep blocks ordered by weekday so the editor always reads Monday→Sunday.
  const sortByDay = (blocks: BlockDraft[]) =>
    [...blocks].sort((a, b) => a.weekday - b.weekday)
  const setBlocks = (blocks: BlockDraft[]) =>
    onChange({ blocks: sortByDay(blocks) })
  const addBlock = () =>
    setBlocks([
      ...draft.blocks,
      { weekday: 0, start_time: '09:00', end_time: '17:00' },
    ])
  const removeBlock = (index: number) =>
    setBlocks(draft.blocks.filter((_, i) => i !== index))
  const updateBlock = (index: number, patch: Partial<BlockDraft>) =>
    setBlocks(
      draft.blocks.map((b, i) => (i === index ? { ...b, ...patch } : b)),
    )

  const openCopy = (day: number) => {
    setCopyFrom(day)
    setCopyTo([])
  }
  const toggleCopyTo = (day: number) =>
    setCopyTo((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day],
    )
  const applyCopy = () => {
    if (copyFrom !== null)
      setBlocks(duplicateDayBlocks(draft.blocks, copyFrom, copyTo))
    setCopyFrom(null)
  }

  return (
    <div className="flex flex-col gap-3">
      <DateField
        id="schedule-effective-from"
        label={t('terms.effectiveFrom')}
        value={draft.effective_from}
        onChange={(v) => onChange({ effective_from: v })}
        lang={lang}
      />
      {draft.blocks.map((block, index) => (
        // Five controls never fit one phone row: wrapping alone would squeeze
        // the time inputs to their min-content width, so stack them in a grid
        // (day, then from/to side by side, then the actions) and only fall back
        // to the single wrapping row once there is room for it.
        <div
          // biome-ignore lint/suspicious/noArrayIndexKey: draft rows have no id
          key={index}
          className="grid grid-cols-2 items-end gap-2 sm:flex sm:flex-wrap"
        >
          <div className="col-span-2 flex flex-col gap-1">
            <Label htmlFor={`block-day-${index}`}>{t('schedule.day')}</Label>
            <select
              id={`block-day-${index}`}
              className={selectClass}
              value={block.weekday}
              onChange={(e) =>
                updateBlock(index, { weekday: Number(e.target.value) })
              }
            >
              {WEEKDAY_KEYS.map((key, day) => (
                <option key={key} value={day}>
                  {t(key)}
                </option>
              ))}
            </select>
          </div>
          <TimeField
            id={`block-start-${index}`}
            label={t('schedule.from')}
            value={block.start_time}
            onChange={(v) => updateBlock(index, { start_time: v })}
            lang={lang}
          />
          <TimeField
            id={`block-end-${index}`}
            label={t('schedule.to')}
            value={block.end_time}
            onChange={(v) => updateBlock(index, { end_time: v })}
            lang={lang}
          />
          <div className="col-span-2 flex gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => openCopy(block.weekday)}
            >
              {t('schedule.copyDay')}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => removeBlock(index)}
            >
              {t('schedule.removeBlock')}
            </Button>
          </div>
        </div>
      ))}
      <Button
        type="button"
        variant="outline"
        onClick={addBlock}
        className="self-start"
      >
        {t('schedule.addBlock')}
      </Button>

      {copyFrom !== null && (
        <Modal
          title={t('schedule.copyDialogTitle')}
          onClose={() => setCopyFrom(null)}
        >
          <p className="text-sm text-muted-foreground">
            {t('schedule.copyDialogHint')} {t(WEEKDAY_KEYS[copyFrom])}
          </p>
          <div className="flex flex-wrap gap-3 text-sm">
            {WEEKDAY_KEYS.map((key, day) =>
              day === copyFrom ? null : (
                <label key={key} className="flex items-center gap-1.5 py-1">
                  <input
                    type="checkbox"
                    className="size-4"
                    checked={copyTo.includes(day)}
                    onChange={() => toggleCopyTo(day)}
                  />
                  {t(key)}
                </label>
              ),
            )}
          </div>
          <div className="flex gap-2">
            <Button
              type="button"
              onClick={applyCopy}
              disabled={copyTo.length === 0}
            >
              {t('schedule.apply')}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => setCopyFrom(null)}
            >
              {t('common.cancel')}
            </Button>
          </div>
        </Modal>
      )}
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
        <div className="flex flex-col gap-1 text-sm">
          <span className="font-medium">
            {current.net_hourly_rate} €/h · {t('terms.since')}{' '}
            {current.effective_from}
            {current.edited && (
              <span className="text-muted-foreground">
                {' '}
                · {t('common.edited')}
              </span>
            )}
          </span>
          {current.below_minimum && (
            <span className="text-destructive" role="alert">
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
            {history.map((terms) => (
              <li
                key={terms.id}
                className="flex flex-col items-start gap-1 py-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3"
              >
                <span className="text-muted-foreground">
                  {effectiveRange(terms, lang, t('nanny.ongoing'))} ·{' '}
                  {terms.net_hourly_rate} €/h
                  {terms.edited && ` · ${t('common.edited')}`}
                </span>
                <span className="flex shrink-0 gap-1">
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
        <p className="text-sm">
          {current.weekly_hours} {t('schedule.perWeek')} · {t('terms.since')}{' '}
          {current.effective_from}
          {current.edited && (
            <span className="text-muted-foreground">
              {' '}
              · {t('common.edited')}
            </span>
          )}
        </p>
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
            {history.map((schedule) => (
              <li
                key={schedule.id}
                className="flex flex-col items-start gap-1 py-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3"
              >
                <span className="text-muted-foreground">
                  {effectiveRange(schedule, lang, t('nanny.ongoing'))} ·{' '}
                  {schedule.weekly_hours} {t('schedule.perWeek')}
                  {schedule.edited && ` · ${t('common.edited')}`}
                </span>
                <span className="flex shrink-0 gap-1">
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

// --- Sharing section --------------------------------------------------------

function SharingSection({
  familyId,
  contract,
}: {
  familyId: string
  contract: Contract
}) {
  const { t } = useI18n()
  const queryClient = useQueryClient()
  const [email, setEmail] = useState('')
  const [errors, setErrors] = useState<string[]>([])

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

// --- Onboarding wizard ------------------------------------------------------

const WIZARD_STEPS: TranslationKey[] = [
  'wizard.step1',
  'wizard.step2',
  'wizard.step3',
  'wizard.step4',
  'wizard.step5',
]

function ContractWizard({
  familyId,
  nannies,
  onClose,
  onCreated,
}: {
  familyId: string
  nannies: Nanny[]
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
  const [terms, setTerms] = useState<TermsDraft>(EMPTY_TERMS)
  const [schedule, setSchedule] = useState<ScheduleDraft>(EMPTY_SCHEDULE)
  const [shareEmail, setShareEmail] = useState('')

  const mutation = useMutation({
    mutationFn: async () => {
      const input: ContractInput = {
        starting_date: startingDate,
        paid_leave_days: paidLeave ? Number(paidLeave) : undefined,
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
      if (shareEmail) {
        await createContractInvitation(familyId, contract.id, shareEmail)
      }
    },
    onSuccess: onCreated,
    onError: (err) => setErrors(extractErrorMessages(err, t('nanny.error'))),
  })

  const canLeaveStep1 =
    !!startingDate && (useExisting ? nannyId !== '' : !!firstName && !!lastName)

  const next = () => {
    setErrors([])
    if (step === 0 && !canLeaveStep1) {
      setErrors([t('wizard.step1Error')])
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
                <select
                  id="wizard-nanny"
                  className={selectClass}
                  value={nannyId}
                  onChange={(e) => setNannyId(e.target.value)}
                >
                  <option value="">—</option>
                  {nannies.map((n) => (
                    <option key={n.id} value={n.id}>
                      {n.first_name} {n.last_name}
                    </option>
                  ))}
                </select>
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

        {step === 4 && (
          <div className="flex flex-col gap-1">
            <Label htmlFor="wizard-share">{t('wizard.shareOptional')}</Label>
            <Input
              id="wizard-share"
              type="email"
              value={shareEmail}
              onChange={(e) => setShareEmail(e.target.value)}
            />
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

// A user can attach a family to a contract only when they own it, or created it
// and it is still unclaimed. Mirrors the backend's Family.can_manage.
function canManageFamily(family: Family): boolean {
  return family.role === 'owner' || (family.role === null && !family.is_claimed)
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
              <div className="flex min-w-0 flex-col gap-0.5">
                <span className="font-medium break-words text-foreground">
                  {invite.nanny_first_name} {invite.nanny_last_name}
                </span>
                <span className="text-sm text-muted-foreground">
                  {t('contract.inbox.subtitle')}
                </span>
              </div>
              {manageable.length === 0 ? (
                <span className="text-sm text-muted-foreground">
                  {t('contract.inbox.noFamily')}
                </span>
              ) : (
                <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
                  {manageable.length > 1 && (
                    <select
                      aria-label={t('contract.inbox.joinAs')}
                      className={selectClass}
                      value={familyId}
                      onChange={(e) =>
                        setJoinAs((prev) => ({
                          ...prev,
                          [invite.id]: e.target.value,
                        }))
                      }
                    >
                      {manageable.map((f) => (
                        <option key={f.id} value={f.id}>
                          {f.name}
                        </option>
                      ))}
                    </select>
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
        <select
          id="acting-family"
          className={selectClass}
          value={activeFamilyId ?? ''}
          onChange={(e) => {
            setFamilyId(e.target.value)
            setOpenId(null)
          }}
        >
          {families.map((f) => (
            <option key={f.id} value={f.id}>
              {f.name}
            </option>
          ))}
        </select>
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
                      <ConfirmButton
                        trigger={t('nanny.delete')}
                        title={t('nanny.delete')}
                        description={t('contract.confirmDelete')}
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
                      <SharingSection
                        familyId={activeFamilyId}
                        contract={contract}
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
