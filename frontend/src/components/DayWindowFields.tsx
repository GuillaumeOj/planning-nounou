import { useState } from 'react'
import { Modal } from '@/src/components/Modal'
import { TimeField } from '@/src/components/TimeField'
import { Button } from '@/src/components/ui/button'
import { Checkbox } from '@/src/components/ui/checkbox'
import { Label } from '@/src/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/src/components/ui/select'
import { useI18n } from '@/src/i18n/I18nContext'
import type { Language } from '@/src/i18n/translations'
import {
  type DayWindow,
  duplicateDayBlocks,
  sortByDay,
  WEEKDAY_KEYS,
} from '@/src/lib/weekdays'

// What a new row opens as: a neutral working day the caller narrows.
const DEFAULT_WINDOW = { weekday: 0, start_time: '09:00', end_time: '17:00' }

// A Monday→Sunday list of day/from/to rows, with a copy-day affordance.
//
// Two things edit day windows and mean different things by them — the nanny's
// schedule blocks say when she works, a child's presence windows say when a
// child is there for it — but the editing is identical, down to the reason the
// copy exists: a week is up to seven rows of mostly the same times, and typing
// them out is how one of them ends up wrong. Only the labels and the field ids
// differ, so those are props and the rest is written once.
export function DayWindowFields({
  windows,
  onChange,
  lang,
  idPrefix,
  addLabel,
  removeLabel,
}: {
  windows: DayWindow[]
  onChange: (windows: DayWindow[]) => void
  lang: Language
  idPrefix: string
  addLabel: string
  removeLabel: string
}) {
  const { t } = useI18n()
  // The day being copied from (its "Copy day" button was clicked), or null.
  const [copyFrom, setCopyFrom] = useState<number | null>(null)
  const [copyTo, setCopyTo] = useState<number[]>([])

  // Keep rows ordered by weekday so the editor always reads Monday→Sunday.
  const setWindows = (next: DayWindow[]) => onChange(sortByDay(next))
  const addWindow = () => setWindows([...windows, { ...DEFAULT_WINDOW }])
  const removeWindow = (index: number) =>
    setWindows(windows.filter((_, i) => i !== index))
  const updateWindow = (index: number, patch: Partial<DayWindow>) =>
    setWindows(windows.map((w, i) => (i === index ? { ...w, ...patch } : w)))

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
      setWindows(duplicateDayBlocks(windows, copyFrom, copyTo))
    setCopyFrom(null)
  }

  return (
    <div className="flex flex-col gap-3">
      {windows.map((window, index) => (
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
            <Label htmlFor={`${idPrefix}-day-${index}`}>
              {t('schedule.day')}
            </Label>
            <Select
              value={String(window.weekday)}
              onValueChange={(value) =>
                updateWindow(index, { weekday: Number(value) })
              }
            >
              <SelectTrigger id={`${idPrefix}-day-${index}`}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {WEEKDAY_KEYS.map((key, day) => (
                  <SelectItem key={key} value={String(day)}>
                    {t(key)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <TimeField
            id={`${idPrefix}-start-${index}`}
            label={t('schedule.from')}
            value={window.start_time}
            onChange={(v) => updateWindow(index, { start_time: v })}
            lang={lang}
          />
          <TimeField
            id={`${idPrefix}-end-${index}`}
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
              onClick={() => openCopy(window.weekday)}
            >
              {t('schedule.copyDay')}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => removeWindow(index)}
            >
              {removeLabel}
            </Button>
          </div>
        </div>
      ))}

      <Button
        type="button"
        variant="outline"
        onClick={addWindow}
        className="self-start"
      >
        {addLabel}
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
                  <Checkbox
                    checked={copyTo.includes(day)}
                    onCheckedChange={() => toggleCopyTo(day)}
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
