import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { listChildren } from '@/src/api/children'
import type { Contract } from '@/src/api/contracts'
import {
  type ContractChild,
  type ContractChildWindow,
  createContractChild,
  deleteContractChild,
  getContractChildren,
  updateContractChild,
} from '@/src/api/declarations'
import { extractErrorMessages } from '@/src/api/errors'
import { ConfirmButton } from '@/src/components/ConfirmButton'
import { FormErrors } from '@/src/components/FormErrors'
import { SectionCard } from '@/src/components/SectionCard'
import { TimeField, toDisplayTime } from '@/src/components/TimeField'
import { Button } from '@/src/components/ui/button'
import { Label } from '@/src/components/ui/label'
import { useI18n } from '@/src/i18n/I18nContext'
import type { Language, TranslationKey } from '@/src/i18n/translations'
import { selectClass } from '@/src/lib/utils'
import {
  type DayWindow,
  duplicateDayBlocks,
  WEEKDAY_KEYS,
} from '@/src/lib/weekdays'

// The API hands back 'HH:MM:SS'; the fields speak 'HH:MM'.
const hhmm = (time: string) => time.slice(0, 5)

// What a new window opens as. The nanny's own day is the natural span, but her
// schedule varies by day and version, so a neutral working day is the honest
// default — the parent narrows it.
const DEFAULT_WINDOW = { start_time: '09:00', end_time: '17:00' }

interface ChildDraft {
  child: string
  windows: DayWindow[]
}

const EMPTY_CHILD: ChildDraft = { child: '', windows: [] }

function entryToDraft(entry: ContractChild): ChildDraft {
  return {
    child: entry.child,
    windows: entry.windows.map((w) => ({
      weekday: w.weekday,
      start_time: hhmm(w.start_time),
      end_time: hhmm(w.end_time),
    })),
  }
}

// Windows sorted Monday→Sunday, so the editor and the summary always read in
// day order however they were added.
const sortByDay = (windows: DayWindow[]) =>
  [...windows].sort((a, b) => a.weekday - b.weekday)

// Says a child's presence in one line. The empty case is the common one and the
// one worth spelling out: no windows does NOT mean "never", it means "whenever
// the nanny works" — a parent reading "—" would assume the opposite.
function describePresence(
  windows: ContractChildWindow[],
  t: (key: TranslationKey) => string,
  lang: Language,
): string {
  if (windows.length === 0) return ''
  return sortByDay(
    windows.map((w) => ({
      weekday: w.weekday,
      start_time: hhmm(w.start_time),
      end_time: hhmm(w.end_time),
    })),
  )
    .map(
      (w) =>
        `${t(WEEKDAY_KEYS[w.weekday])} ${toDisplayTime(w.start_time, lang)}–${toDisplayTime(w.end_time, lang)}`,
    )
    .join(' · ')
}

// The windows editor. Mirrors the schedule block editor next door, down to the
// day-copy: a child away on Wednesday is four windows, and typing the same times
// four times is how a parent gets one of them wrong.
function WindowFields({
  windows,
  onChange,
  lang,
}: {
  windows: DayWindow[]
  onChange: (windows: DayWindow[]) => void
  lang: Language
}) {
  const { t } = useI18n()
  const [copyFrom, setCopyFrom] = useState<number | null>(null)
  const [copyTo, setCopyTo] = useState<number[]>([])

  const setWindows = (next: DayWindow[]) => onChange(sortByDay(next))
  const addWindow = () =>
    setWindows([...windows, { weekday: 0, ...DEFAULT_WINDOW }])
  const removeWindow = (index: number) =>
    setWindows(windows.filter((_, i) => i !== index))
  const updateWindow = (index: number, patch: Partial<DayWindow>) =>
    setWindows(windows.map((w, i) => (i === index ? { ...w, ...patch } : w)))

  const toggleCopyTo = (day: number) =>
    setCopyTo((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day],
    )
  const applyCopy = () => {
    if (copyFrom !== null)
      setWindows(duplicateDayBlocks(windows, copyFrom, copyTo))
    setCopyFrom(null)
  }

  return (
    <div className="flex flex-col gap-3">
      {windows.map((window, index) => (
        <div
          // biome-ignore lint/suspicious/noArrayIndexKey: draft rows have no id
          key={index}
          className="grid grid-cols-2 items-end gap-2 sm:flex sm:flex-wrap"
        >
          <div className="col-span-2 flex flex-col gap-1">
            <Label htmlFor={`window-day-${index}`}>{t('schedule.day')}</Label>
            <select
              id={`window-day-${index}`}
              className={selectClass}
              value={window.weekday}
              onChange={(e) =>
                updateWindow(index, { weekday: Number(e.target.value) })
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
            id={`window-start-${index}`}
            label={t('schedule.from')}
            value={window.start_time}
            onChange={(v) => updateWindow(index, { start_time: v })}
            lang={lang}
          />
          <TimeField
            id={`window-end-${index}`}
            label={t('schedule.to')}
            value={window.end_time}
            onChange={(v) => updateWindow(index, { end_time: v })}
            lang={lang}
          />
          <div className="col-span-2 flex gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                setCopyFrom(window.weekday)
                setCopyTo([])
              }}
            >
              {t('schedule.copyDay')}
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => removeWindow(index)}
            >
              {t('nanny.delete')}
            </Button>
          </div>
        </div>
      ))}

      {copyFrom !== null && (
        <div className="flex flex-col gap-2 rounded-md border p-3">
          <p className="text-sm">
            {t('schedule.copyTo')} {t(WEEKDAY_KEYS[copyFrom])}
          </p>
          <div className="flex flex-wrap gap-2">
            {WEEKDAY_KEYS.map((key, day) =>
              day === copyFrom ? null : (
                <label key={key} className="flex items-center gap-1.5 text-sm">
                  <input
                    type="checkbox"
                    checked={copyTo.includes(day)}
                    onChange={() => toggleCopyTo(day)}
                  />
                  {t(key)}
                </label>
              ),
            )}
          </div>
          <div className="flex gap-2">
            <Button type="button" size="sm" onClick={applyCopy}>
              {t('confirm.apply')}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setCopyFrom(null)}
            >
              {t('common.cancel')}
            </Button>
          </div>
        </div>
      )}

      <Button
        type="button"
        variant="outline"
        size="sm"
        className="self-start"
        onClick={addWindow}
      >
        {t('contractChild.addWindow')}
      </Button>
    </div>
  )
}

function ChildFields({
  draft,
  onChange,
  lang,
  childOptions,
  lockChild,
}: {
  draft: ChildDraft
  onChange: (patch: Partial<ChildDraft>) => void
  lang: Language
  childOptions: { id: string; name: string }[]
  lockChild: boolean
}) {
  const { t } = useI18n()
  // Windows empty means "there whenever the nanny works", which is both the
  // common case and the one a parent should not have to describe day by day.
  const whole = draft.windows.length === 0

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <Label htmlFor="contract-child">{t('contractChild.child')}</Label>
        <select
          id="contract-child"
          className={selectClass}
          value={draft.child}
          disabled={lockChild}
          onChange={(e) => onChange({ child: e.target.value })}
        >
          <option value="">{t('contractChild.pickChild')}</option>
          {childOptions.map((child) => (
            <option key={child.id} value={child.id}>
              {child.name}
            </option>
          ))}
        </select>
      </div>

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 text-sm font-medium">
          {t('contractChild.presence')}
        </legend>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="radio"
            name="presence-mode"
            checked={whole}
            onChange={() => onChange({ windows: [] })}
          />
          {t('contractChild.wholeTime')}
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="radio"
            name="presence-mode"
            checked={!whole}
            onChange={() =>
              onChange({ windows: [{ weekday: 0, ...DEFAULT_WINDOW }] })
            }
          />
          {t('contractChild.someDays')}
        </label>
        <p className="text-xs text-muted-foreground">
          {t('contractChild.someDaysHint')}
        </p>
      </fieldset>

      {!whole && (
        <WindowFields
          windows={draft.windows}
          onChange={(windows) => onChange({ windows })}
          lang={lang}
        />
      )}
    </div>
  )
}

// The children a contract covers, and when each is there. This is what the pay
// split divides by: without it a shared contract has nothing to split, and the
// declaration says so (`split_without_children`).
export function ContractChildrenSection({
  familyId,
  contract,
}: {
  familyId: string
  contract: Contract
}) {
  const { t, lang } = useI18n()
  const queryClient = useQueryClient()
  const [draft, setDraft] = useState<ChildDraft>(EMPTY_CHILD)
  const [editingId, setEditingId] = useState<string | 'new' | null>(null)
  const [errors, setErrors] = useState<string[]>([])

  const { data: entries } = useQuery({
    queryKey: ['contract-children', contract.id],
    queryFn: () => getContractChildren(familyId, contract.id),
  })

  // Only this family's own children can be put on the contract; the other
  // family puts its own on from its side.
  const { data: children } = useQuery({
    queryKey: ['children', familyId],
    queryFn: () => listChildren(familyId),
  })

  const invalidate = () =>
    Promise.all([
      queryClient.invalidateQueries({
        queryKey: ['contract-children', contract.id],
      }),
      // The split — and so every figure on the declaration — moves with this.
      queryClient.invalidateQueries({ queryKey: ['declarations'] }),
    ])
  const close = () => {
    setEditingId(null)
    setErrors([])
  }

  const mutation = useMutation({
    mutationFn: () => {
      const input = { child: draft.child, windows: draft.windows }
      return editingId === 'new' || editingId === null
        ? createContractChild(familyId, contract.id, input)
        : updateContractChild(familyId, contract.id, editingId, input)
    },
    onSuccess: async () => {
      await invalidate()
      close()
    },
    onError: (err) => setErrors(extractErrorMessages(err, t('nanny.error'))),
  })
  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteContractChild(familyId, contract.id, id),
    onSuccess: invalidate,
  })

  const open = (mode: string | 'new', initial: ChildDraft) => {
    setDraft(initial)
    setEditingId(mode)
    setErrors([])
  }
  const submit = () => {
    if (!draft.child) {
      setErrors([t('contractChild.childRequired')])
      return
    }
    mutation.mutate()
  }

  // A child already on the contract is not a candidate to add again — but the
  // one being edited has to stay in its own picker.
  const taken = new Set(
    (entries ?? []).filter((e) => e.id !== editingId).map((e) => e.child),
  )
  const childOptions = (children ?? [])
    .filter((c) => !taken.has(c.id))
    .map((c) => ({ id: c.id, name: c.first_name }))

  return (
    <SectionCard
      title={t('contractChild.title')}
      description={t('contractChild.description')}
    >
      {editingId !== null ? (
        <div className="flex flex-col gap-4 rounded-md border p-3">
          <ChildFields
            draft={draft}
            onChange={(p) => setDraft((d) => ({ ...d, ...p }))}
            lang={lang}
            childOptions={childOptions}
            lockChild={editingId !== 'new'}
          />
          <FormErrors messages={errors} />
          <div className="flex gap-2">
            <Button
              type="button"
              onClick={submit}
              disabled={mutation.isPending}
            >
              {t('contractChild.save')}
            </Button>
            <Button type="button" variant="outline" onClick={close}>
              {t('common.cancel')}
            </Button>
          </div>
        </div>
      ) : children && children.length === 0 ? (
        // Nothing to put on the contract: say so rather than offer a form whose
        // only required field has no options.
        <p className="text-sm text-muted-foreground">
          {t('contractChild.noChildren')}
        </p>
      ) : (
        <Button
          type="button"
          variant="outline"
          className="self-start"
          disabled={childOptions.length === 0}
          onClick={() => open('new', EMPTY_CHILD)}
        >
          {t('contractChild.add')}
        </Button>
      )}

      {entries && entries.length > 0 ? (
        <ul className="flex flex-col divide-y text-sm">
          {entries.map((entry) => {
            // The other family's children are on the contract too — they are
            // half of what the split divides — but they are not ours to edit.
            const isOwn = entry.family_id === familyId
            const presence = describePresence(entry.windows, t, lang)
            return (
              <li
                key={entry.id}
                className="flex flex-col items-start gap-1 py-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3"
              >
                <span className="flex min-w-0 flex-col">
                  <span className="font-medium">{entry.first_name}</span>
                  <span className="text-muted-foreground">
                    {presence || t('contractChild.wholeTime')}
                  </span>
                </span>
                {isOwn && (
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
                      description={t('contractChild.confirmDelete')}
                      onConfirm={() => deleteMutation.mutate(entry.id)}
                    />
                  </span>
                )}
              </li>
            )
          })}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">
          {t('contractChild.none')}
        </p>
      )}
    </SectionCard>
  )
}
