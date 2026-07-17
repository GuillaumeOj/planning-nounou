import { format, isValid, parse } from 'date-fns'
import { useEffect, useState } from 'react'
import { Input } from '@/src/components/ui/input'
import { Label } from '@/src/components/ui/label'
import type { Language } from '@/src/i18n/translations'
import { localeFor } from '@/src/lib/utils'

// The value is always stored as 24h "HH:mm"; it is displayed and typed in the
// app language's convention — English 12h AM/PM, French 24h.
const displayToken = (lang: Language) => (lang === 'fr' ? 'HH:mm' : 'h:mm a')
const placeholderFor = (lang: Language) => (lang === 'fr' ? '14:30' : '2:30 PM')

export function toStoredTime(text: string, lang: Language): string {
  const trimmed = text.trim()
  if (!trimmed) return ''
  const parsed = parse(trimmed, displayToken(lang), new Date(), {
    locale: localeFor(lang),
  })
  return isValid(parsed) ? format(parsed, 'HH:mm') : ''
}

// "08:00:00" -> "08:00". The API serializes times with seconds; every field and
// every input payload in the app speaks HH:MM.
export function hhmm(time: string): string {
  return time.slice(0, 5)
}

export function toDisplayTime(value: string, lang: Language): string {
  if (!value) return ''
  const parsed = parse(value, 'HH:mm', new Date())
  return isValid(parsed)
    ? format(parsed, displayToken(lang), { locale: localeFor(lang) })
    : ''
}

export function TimeField({
  id,
  label,
  value,
  onChange,
  lang,
}: {
  id: string
  label: string
  value: string
  onChange: (stored: string) => void
  lang: Language
}) {
  const [text, setText] = useState(() => toDisplayTime(value, lang))
  const shown = toStoredTime(text, lang)

  useEffect(() => {
    if (value !== shown) setText(toDisplayTime(value, lang))
  }, [value, shown, lang])

  return (
    <div className="flex flex-col gap-1">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        name={id}
        placeholder={placeholderFor(lang)}
        value={text}
        onChange={(event) => {
          setText(event.target.value)
          onChange(toStoredTime(event.target.value, lang))
        }}
      />
    </div>
  )
}
