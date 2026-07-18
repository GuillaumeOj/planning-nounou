import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import type { Contract } from '@/src/api/contracts'
import { extractErrorMessages } from '@/src/api/errors'
import {
  createLeave,
  deleteLeave,
  type Leave,
  type LeaveInput,
  type LeavePortion,
  type LeaveType,
  leavesQueryOptions,
  updateLeave,
} from '@/src/api/leaves'
import { ConfirmButton } from '@/src/components/ConfirmButton'
import { DateField, formatDate } from '@/src/components/DateField'
import { FormErrors } from '@/src/components/FormErrors'
import { SectionCard } from '@/src/components/SectionCard'
import { Button } from '@/src/components/ui/button'
import { Input } from '@/src/components/ui/input'
import { Label } from '@/src/components/ui/label'
import { useI18n } from '@/src/i18n/I18nContext'
import type { Language, TranslationKey } from '@/src/i18n/translations'
import { overlapsMonth } from '@/src/lib/months'
import { selectClass } from '@/src/lib/utils'

interface LeaveDraft {
  leave_type: LeaveType
  start_date: string
  end_date: string
  portion: LeavePortion
  hours: string
  notes: string
}

const EMPTY_LEAVE: LeaveDraft = {
  leave_type: 'paid',
  start_date: '',
  end_date: '',
  portion: 'full_day',
  hours: '',
  notes: '',
}

const LEAVE_TYPE_KEYS: Record<LeaveType, TranslationKey> = {
  paid: 'leaves.type.paid',
  unpaid: 'leaves.type.unpaid',
  sickness: 'leaves.type.sickness',
}

const PORTION_KEYS: Record<LeavePortion, TranslationKey> = {
  full_day: 'leaves.portion.full_day',
  half_day: 'leaves.portion.half_day',
  hourly: 'leaves.portion.hourly',
}

function leaveToDraft(leave: Leave): LeaveDraft {
  return {
    leave_type: leave.leave_type,
    start_date: leave.start_date,
    end_date: leave.end_date,
    portion: leave.portion,
    hours: leave.hours ?? '',
    notes: leave.notes,
  }
}

function leaveDraftToInput(draft: LeaveDraft): LeaveInput {
  const hourly = draft.portion === 'hourly'
  return {
    leave_type: draft.leave_type,
    start_date: draft.start_date,
    end_date: draft.end_date,
    portion: draft.portion,
    hours: hourly ? draft.hours : null,
    notes: draft.notes || undefined,
  }
}

function LeaveFields({
  draft,
  onChange,
  lang,
}: {
  draft: LeaveDraft
  onChange: (patch: Partial<LeaveDraft>) => void
  lang: Language
}) {
  const { t } = useI18n()
  // Hourly leaves are only meaningful for unpaid leave (backend enforces it too).
  const portions: LeavePortion[] =
    draft.leave_type === 'unpaid'
      ? ['full_day', 'half_day', 'hourly']
      : ['full_day', 'half_day']

  const changeType = (leave_type: LeaveType) => {
    const patch: Partial<LeaveDraft> = { leave_type }
    if (leave_type !== 'unpaid' && draft.portion === 'hourly') {
      patch.portion = 'full_day'
      patch.hours = ''
    }
    onChange(patch)
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <Label htmlFor="leave-type">{t('leaves.type')}</Label>
        <select
          id="leave-type"
          className={selectClass}
          value={draft.leave_type}
          onChange={(e) => changeType(e.target.value as LeaveType)}
        >
          {(Object.keys(LEAVE_TYPE_KEYS) as LeaveType[]).map((type) => (
            <option key={type} value={type}>
              {t(LEAVE_TYPE_KEYS[type])}
            </option>
          ))}
        </select>
      </div>
      <DateField
        id="leave-start"
        label={t('leaves.startDate')}
        value={draft.start_date}
        onChange={(v) => onChange({ start_date: v })}
        lang={lang}
        required
      />
      <DateField
        id="leave-end"
        label={t('leaves.endDate')}
        value={draft.end_date}
        onChange={(v) => onChange({ end_date: v })}
        lang={lang}
        required
      />
      <div className="flex flex-col gap-1">
        <Label htmlFor="leave-portion">{t('leaves.portion')}</Label>
        <select
          id="leave-portion"
          className={selectClass}
          value={draft.portion}
          onChange={(e) =>
            onChange({ portion: e.target.value as LeavePortion })
          }
        >
          {portions.map((portion) => (
            <option key={portion} value={portion}>
              {t(PORTION_KEYS[portion])}
            </option>
          ))}
        </select>
      </div>
      {draft.portion === 'hourly' && (
        <div className="flex flex-col gap-1">
          <Label htmlFor="leave-hours">{t('leaves.hours')}</Label>
          <Input
            id="leave-hours"
            inputMode="decimal"
            value={draft.hours}
            onChange={(e) =>
              onChange({ hours: e.target.value.replace(',', '.') })
            }
          />
        </div>
      )}
      <div className="flex flex-col gap-1">
        <Label htmlFor="leave-notes">{t('leaves.notes')}</Label>
        <Input
          id="leave-notes"
          value={draft.notes}
          onChange={(e) => onChange({ notes: e.target.value })}
        />
      </div>
    </div>
  )
}

// A nanny's days off for one contract: add / edit / remove leave records. Used
// on the planning page, one card per shared contract, scoped to the visible
// month — a leave shows if any of it falls in that month.
export function LeavesSection({
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
  const [draft, setDraft] = useState<LeaveDraft>(EMPTY_LEAVE)
  const [editingId, setEditingId] = useState<string | 'new' | null>(null)
  const [errors, setErrors] = useState<string[]>([])

  const { data: leaves, isError } = useQuery(
    leavesQueryOptions(familyId, contract.id),
  )

  const invalidate = () =>
    queryClient.invalidateQueries({
      queryKey: ['contract-leaves', contract.id],
    })
  const close = () => {
    setEditingId(null)
    setErrors([])
  }

  const mutation = useMutation({
    mutationFn: () => {
      const input = leaveDraftToInput(draft)
      return editingId === 'new' || editingId === null
        ? createLeave(familyId, contract.id, input)
        : updateLeave(familyId, contract.id, editingId, input)
    },
    onSuccess: async () => {
      await invalidate()
      close()
    },
    onError: (err) => setErrors(extractErrorMessages(err, t('nanny.error'))),
  })
  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteLeave(familyId, contract.id, id),
    onSuccess: invalidate,
  })

  const open = (mode: string | 'new', initial: LeaveDraft) => {
    setDraft(initial)
    setEditingId(mode)
    setErrors([])
  }
  const submit = () => {
    if (!draft.start_date || !draft.end_date) {
      setErrors([t('leaves.datesRequired')])
      return
    }
    if (draft.portion === 'hourly' && !draft.hours) {
      setErrors([t('leaves.hoursRequired')])
      return
    }
    mutation.mutate()
  }

  const describe = (leave: Leave) => {
    const range =
      leave.start_date === leave.end_date
        ? formatDate(leave.start_date, lang)
        : `${formatDate(leave.start_date, lang)} → ${formatDate(leave.end_date, lang)}`
    const portion =
      leave.portion === 'hourly'
        ? `${leave.hours} ${t('leaves.hoursShort')}`
        : t(PORTION_KEYS[leave.portion])
    return `${range} · ${t(LEAVE_TYPE_KEYS[leave.leave_type])} · ${portion}`
  }

  // Only this month's leaves; a leave running across the boundary shows in both.
  const visible = (leaves ?? []).filter((leave) =>
    overlapsMonth(leave.start_date, leave.end_date, month),
  )

  return (
    <SectionCard
      title={`${contract.nanny.first_name} ${contract.nanny.last_name}`}
    >
      {editingId !== null ? (
        <div className="flex flex-col gap-4 rounded-md border p-3">
          <LeaveFields
            draft={draft}
            onChange={(p) => setDraft((d) => ({ ...d, ...p }))}
            lang={lang}
          />
          <FormErrors messages={errors} />
          <div className="flex gap-2">
            <Button
              type="button"
              onClick={submit}
              disabled={mutation.isPending}
            >
              {t('leaves.save')}
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
          onClick={() => open('new', EMPTY_LEAVE)}
        >
          {t('leaves.add')}
        </Button>
      )}

      {isError ? (
        // A failed load lists nothing; without this it reads as "no days off"
        // and a parent re-adds a leave that already exists.
        <p className="text-sm text-destructive">{t('leaves.loadError')}</p>
      ) : visible.length > 0 ? (
        <ul className="flex flex-col divide-y text-sm">
          {visible.map((leave) => (
            // describe() is a long sentence (dates, type, portion); beside two
            // non-shrinking buttons it would collapse to a few words per line.
            <li
              key={leave.id}
              className="flex flex-col items-start gap-1 py-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3"
            >
              <span className="min-w-0 text-muted-foreground">
                {describe(leave)}
              </span>
              <span className="flex shrink-0 gap-1">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => open(leave.id, leaveToDraft(leave))}
                >
                  {t('nanny.edit')}
                </Button>
                <ConfirmButton
                  trigger={t('nanny.delete')}
                  title={t('nanny.delete')}
                  description={t('leaves.confirmDelete')}
                  onConfirm={() => deleteMutation.mutate(leave.id)}
                />
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">
          {t('leaves.noneThisMonth')}
        </p>
      )}
    </SectionCard>
  )
}
