import { format, isValid, parse, parseISO } from 'date-fns'
import { CalendarIcon } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Button } from '@/src/components/ui/button'
import { Calendar } from '@/src/components/ui/calendar'
import { Input } from '@/src/components/ui/input'
import { Label } from '@/src/components/ui/label'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/src/components/ui/popover'
import { useI18n } from '@/src/i18n/I18nContext'
import type { Language } from '@/src/i18n/translations'
import { localeFor } from '@/src/lib/utils'

// An ISO date (yyyy-MM-dd) rendered in the app locale's short format.
export function formatDate(iso: string, lang: Language): string {
  return format(parseISO(iso), 'P', { locale: localeFor(lang) })
}

// Parse a locale-formatted date string back to ISO (yyyy-MM-dd), or '' if invalid.
function parseLocalizedDate(input: string, lang: Language): string {
  const parsed = parse(input.trim(), 'P', new Date(), {
    locale: localeFor(lang),
  })
  return isValid(parsed) ? format(parsed, 'yyyy-MM-dd') : ''
}

// A date input pairing a locale-parsed text field with a calendar popover. The
// value is stored as ISO (yyyy-MM-dd); the localized text is shown to the user.
export function DateField({
  id,
  label,
  value,
  onChange,
  lang,
  required,
}: {
  id: string
  label: string
  value: string
  onChange: (iso: string) => void
  lang: Language
  required?: boolean
}) {
  const { t } = useI18n()
  const [open, setOpen] = useState(false)
  const [text, setText] = useState(() => (value ? formatDate(value, lang) : ''))
  const toIso = (raw: string) =>
    raw.trim() ? parseLocalizedDate(raw, lang) : ''
  const shownIso = toIso(text)
  useEffect(() => {
    if (value !== shownIso) setText(value ? formatDate(value, lang) : '')
  }, [value, shownIso, lang])

  const handleSelect = (date?: Date) => {
    if (date) onChange(format(date, 'yyyy-MM-dd'))
    setOpen(false)
  }
  const selected = value ? parseISO(value) : undefined

  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={id}>{label}</Label>
      <div className="flex gap-2">
        <Input
          id={id}
          name={id}
          inputMode="numeric"
          placeholder={t('nanny.dateFormat')}
          value={text}
          required={required}
          onChange={(event) => {
            setText(event.target.value)
            onChange(toIso(event.target.value))
          }}
        />
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Button
              type="button"
              variant="outline"
              size="icon"
              aria-label={t('nanny.pickDate')}
            >
              <CalendarIcon />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <Calendar
              mode="single"
              locale={localeFor(lang)}
              selected={selected}
              defaultMonth={selected}
              onSelect={handleSelect}
              autoFocus
            />
          </PopoverContent>
        </Popover>
      </div>
    </div>
  )
}
