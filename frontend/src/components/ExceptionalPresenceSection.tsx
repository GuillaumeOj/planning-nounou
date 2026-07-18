import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import type { Contract } from '@/src/api/contracts'
import {
  createExceptionalPresence,
  deleteExceptionalPresence,
  type ExceptionalPresence,
  type ExceptionalPresenceInput,
  exceptionalPresencesQueryOptions,
  getContractChildren,
  updateExceptionalPresence,
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
import type { Language } from '@/src/i18n/translations'
import { inMonth } from '@/src/lib/months'
import { selectClass } from '@/src/lib/utils'

interface PresenceDraft {
  child: string
  date: string
  start_time: string
  end_time: string
  notes: string
}

const EMPTY_PRESENCE: PresenceDraft = {
  child: '',
  date: '',
  start_time: '',
  end_time: '',
  notes: '',
}

function entryToDraft(entry: ExceptionalPresence): PresenceDraft {
  return {
    child: entry.child,
    date: entry.date,
    start_time: hhmm(entry.start_time),
    end_time: hhmm(entry.end_time),
    notes: entry.notes,
  }
}

function presenceDraftToInput(draft: PresenceDraft): ExceptionalPresenceInput {
  return {
    child: draft.child,
    date: draft.date,
    start_time: draft.start_time,
    end_time: draft.end_time,
    notes: draft.notes || undefined,
  }
}

function PresenceFields({
  draft,
  onChange,
  lang,
  childOptions,
}: {
  draft: PresenceDraft
  onChange: (patch: Partial<PresenceDraft>) => void
  lang: Language
  childOptions: { id: string; name: string }[]
}) {
  const { t } = useI18n()

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <Label htmlFor="presence-child">
          {t('exceptional.presence.child')}
        </Label>
        <select
          id="presence-child"
          className={selectClass}
          value={draft.child}
          onChange={(e) => onChange({ child: e.target.value })}
        >
          <option value="">{t('exceptional.presence.pickChild')}</option>
          {childOptions.map((child) => (
            <option key={child.id} value={child.id}>
              {child.name}
            </option>
          ))}
        </select>
      </div>
      <DateField
        id="presence-date"
        label={t('exceptional.presence.date')}
        value={draft.date}
        onChange={(v) => onChange({ date: v })}
        lang={lang}
        required
      />
      <TimeField
        id="presence-start-time"
        label={t('exceptional.startTime')}
        value={draft.start_time}
        onChange={(v) => onChange({ start_time: v })}
        lang={lang}
      />
      <TimeField
        id="presence-end-time"
        label={t('exceptional.endTime')}
        value={draft.end_time}
        onChange={(v) => onChange({ end_time: v })}
        lang={lang}
      />
      <div className="flex flex-col gap-1">
        <Label htmlFor="presence-notes">{t('exceptional.notes')}</Label>
        <Input
          id="presence-notes"
          value={draft.notes}
          onChange={(e) => onChange({ notes: e.target.value })}
        />
      </div>
    </div>
  )
}

// A child there outside their usual window, for one contract. The nanny works no
// longer for it — she is already there for the others — so the month's total
// does not move; only the split between the families does.
export function ExceptionalPresenceSection({
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
  const [draft, setDraft] = useState<PresenceDraft>(EMPTY_PRESENCE)
  const [editingId, setEditingId] = useState<string | 'new' | null>(null)
  const [errors, setErrors] = useState<string[]>([])

  const { data: entries, isError } = useQuery(
    exceptionalPresencesQueryOptions(familyId, contract.id),
  )

  // The contract's children are the only ones that can be exceptionally present
  // on it, so they are the whole of the picker.
  const { data: contractChildren } = useQuery({
    queryKey: ['contract-children', contract.id],
    queryFn: () => getContractChildren(familyId, contract.id),
  })
  // The picker submits the *child*, not the ContractChild that carries them:
  // that is the id the presence endpoint stores.
  const childOptions = (contractChildren ?? []).map((c) => ({
    id: c.child,
    name: c.first_name,
  }))

  const invalidate = () =>
    queryClient.invalidateQueries({
      queryKey: ['exceptional-presences', contract.id],
    })
  const close = () => {
    setEditingId(null)
    setErrors([])
  }

  const mutation = useMutation({
    mutationFn: () => {
      const input = presenceDraftToInput(draft)
      return editingId === 'new' || editingId === null
        ? createExceptionalPresence(familyId, contract.id, input)
        : updateExceptionalPresence(familyId, contract.id, editingId, input)
    },
    onSuccess: async () => {
      await invalidate()
      close()
    },
    onError: (err) => setErrors(extractErrorMessages(err, t('nanny.error'))),
  })
  const deleteMutation = useMutation({
    mutationFn: (id: string) =>
      deleteExceptionalPresence(familyId, contract.id, id),
    onSuccess: invalidate,
  })

  const open = (mode: string | 'new', initial: PresenceDraft) => {
    setDraft(initial)
    setEditingId(mode)
    setErrors([])
  }
  const submit = () => {
    if (!draft.child) {
      setErrors([t('exceptional.presence.childRequired')])
      return
    }
    if (!draft.date) {
      setErrors([t('exceptional.presence.dateRequired')])
      return
    }
    if (!draft.start_time || !draft.end_time) {
      setErrors([t('exceptional.timesRequired')])
      return
    }
    mutation.mutate()
  }

  const describe = (entry: ExceptionalPresence) =>
    `${formatDate(entry.date, lang)} · ${entry.first_name} · ${toDisplayTime(hhmm(entry.start_time), lang)} → ${toDisplayTime(hhmm(entry.end_time), lang)}`

  // Only this month's exceptional presences.
  const visible = (entries ?? []).filter((entry) => inMonth(entry.date, month))

  return (
    <SectionCard
      title={`${contract.nanny.first_name} ${contract.nanny.last_name}`}
    >
      {editingId !== null ? (
        <div className="flex flex-col gap-4 rounded-md border p-3">
          <PresenceFields
            draft={draft}
            onChange={(p) => setDraft((d) => ({ ...d, ...p }))}
            lang={lang}
            childOptions={childOptions}
          />
          <FormErrors messages={errors} />
          <div className="flex gap-2">
            <Button
              type="button"
              onClick={submit}
              disabled={mutation.isPending}
            >
              {t('exceptional.presence.save')}
            </Button>
            <Button type="button" variant="outline" onClick={close}>
              {t('common.cancel')}
            </Button>
          </div>
        </div>
      ) : contractChildren && contractChildren.length === 0 ? (
        // Nothing to be present: say so rather than offer a form whose only
        // required field has no options.
        <p className="text-sm text-muted-foreground">
          {t('exceptional.presence.noChildren')}
        </p>
      ) : (
        <Button
          type="button"
          variant="outline"
          className="self-start"
          onClick={() => open('new', EMPTY_PRESENCE)}
        >
          {t('exceptional.presence.add')}
        </Button>
      )}

      {isError ? (
        // A failed load lists nothing; without this it reads as "none this
        // month" and invites a duplicate entry.
        <p className="text-sm text-destructive">{t('exceptional.loadError')}</p>
      ) : visible.length > 0 ? (
        <ul className="flex flex-col divide-y text-sm">
          {visible.map((entry) => (
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
                  description={t('exceptional.presence.confirmDelete')}
                  onConfirm={() => deleteMutation.mutate(entry.id)}
                />
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">
          {t('exceptional.presence.noneThisMonth')}
        </p>
      )}
    </SectionCard>
  )
}
