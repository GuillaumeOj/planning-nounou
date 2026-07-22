import { useState } from 'react'
import {
  type ContractRead,
  type LeaveRead,
  type LeaveRequest,
  type LeaveTypeEnum,
  type PortionEnum,
  useFamiliesContractsLeavesCreateMutation,
  useFamiliesContractsLeavesDestroyMutation,
  useFamiliesContractsLeavesListQuery,
  useFamiliesContractsLeavesPartialUpdateMutation,
} from '@/src/api'
import { extractErrorMessages } from '@/src/api/errors'
import { ConfirmButton } from '@/src/components/ConfirmButton'
import { DateField, formatDate } from '@/src/components/DateField'
import { FormErrors } from '@/src/components/FormErrors'
import { SectionCard } from '@/src/components/SectionCard'
import { Button } from '@/src/components/ui/button'
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
import { overlapsMonth } from '@/src/lib/months'

interface LeaveDraft {
  leave_type: LeaveTypeEnum
  start_date: string
  end_date: string
  portion: PortionEnum
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

const LEAVE_TYPE_KEYS: Record<LeaveTypeEnum, TranslationKey> = {
  paid: 'leaves.type.paid',
  unpaid: 'leaves.type.unpaid',
  sickness: 'leaves.type.sickness',
  maternity: 'leaves.type.maternity',
}

const PORTION_KEYS: Record<PortionEnum, TranslationKey> = {
  full_day: 'leaves.portion.full_day',
  half_day: 'leaves.portion.half_day',
  hourly: 'leaves.portion.hourly',
}

function leaveToDraft(leave: LeaveRead): LeaveDraft {
  return {
    leave_type: leave.leave_type,
    start_date: leave.start_date,
    end_date: leave.end_date,
    portion: leave.portion,
    hours: leave.hours ?? '',
    notes: leave.notes,
  }
}

function leaveDraftToInput(draft: LeaveDraft): LeaveRequest {
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
  const portions: PortionEnum[] =
    draft.leave_type === 'unpaid'
      ? ['full_day', 'half_day', 'hourly']
      : ['full_day', 'half_day']

  const changeType = (leave_type: LeaveTypeEnum) => {
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
        <Select
          value={draft.leave_type}
          onValueChange={(value) => changeType(value as LeaveTypeEnum)}
        >
          <SelectTrigger id="leave-type">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {(Object.keys(LEAVE_TYPE_KEYS) as LeaveTypeEnum[]).map((type) => (
              <SelectItem key={type} value={type}>
                {t(LEAVE_TYPE_KEYS[type])}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
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
        <Select
          value={draft.portion}
          onValueChange={(value) => onChange({ portion: value as PortionEnum })}
        >
          <SelectTrigger id="leave-portion">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {portions.map((portion) => (
              <SelectItem key={portion} value={portion}>
                {t(PORTION_KEYS[portion])}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
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
  contract: ContractRead
  month: string
}) {
  const { t, lang } = useI18n()
  const [draft, setDraft] = useState<LeaveDraft>(EMPTY_LEAVE)
  const [editingId, setEditingId] = useState<string | 'new' | null>(null)
  const [errors, setErrors] = useState<string[]>([])

  const { data: leaves, isError } = useFamiliesContractsLeavesListQuery({
    familyPk: familyId,
    contractPk: contract.id,
  })

  // Cache invalidation is handled by RTK Query tags (see api/index.ts): any leave
  // mutation invalidates the "families" tag, refetching this list automatically.
  const [createLeave, { isLoading: creating }] =
    useFamiliesContractsLeavesCreateMutation()
  const [updateLeave, { isLoading: updating }] =
    useFamiliesContractsLeavesPartialUpdateMutation()
  const [deleteLeave] = useFamiliesContractsLeavesDestroyMutation()
  const saving = creating || updating

  const close = () => {
    setEditingId(null)
    setErrors([])
  }

  const open = (mode: string | 'new', initial: LeaveDraft) => {
    setDraft(initial)
    setEditingId(mode)
    setErrors([])
  }
  const submit = async () => {
    if (!draft.start_date || !draft.end_date) {
      setErrors([t('leaves.datesRequired')])
      return
    }
    if (draft.portion === 'hourly' && !draft.hours) {
      setErrors([t('leaves.hoursRequired')])
      return
    }
    const input = leaveDraftToInput(draft)
    try {
      if (editingId === 'new' || editingId === null) {
        await createLeave({
          familyPk: familyId,
          contractPk: contract.id,
          leaveRequest: input,
        }).unwrap()
      } else {
        await updateLeave({
          familyPk: familyId,
          contractPk: contract.id,
          id: editingId,
          patchedLeaveRequest: input,
        }).unwrap()
      }
      close()
    } catch (err) {
      setErrors(extractErrorMessages(err, t('nanny.error')))
    }
  }

  const describe = (leave: LeaveRead) => {
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
            <Button type="button" onClick={submit} disabled={saving}>
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
                  onConfirm={() =>
                    void deleteLeave({
                      familyPk: familyId,
                      contractPk: contract.id,
                      id: leave.id,
                    })
                  }
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
