import { useForm } from '@tanstack/react-form'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { format, isValid, parse, parseISO } from 'date-fns'
import { enUS, fr } from 'date-fns/locale'
import { CalendarIcon } from 'lucide-react'
import { useEffect, useState } from 'react'
import { extractErrorMessages } from '../api/errors'
import {
  createNanny,
  deleteNanny,
  getNannies,
  type Nanny,
  type NannyInput,
  updateNanny,
} from '../api/nannies'
import { FormErrors } from '../components/FormErrors'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '../components/ui/alert-dialog'
import { Button } from '../components/ui/button'
import { Calendar } from '../components/ui/calendar'
import { Card, CardContent } from '../components/ui/card'
import { Input } from '../components/ui/input'
import { Label } from '../components/ui/label'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '../components/ui/popover'
import { useI18n } from '../i18n/I18nContext'
import type { Language } from '../i18n/translations'

function localeFor(lang: Language) {
  return lang === 'fr' ? fr : enUS
}

// Display a stored ISO date (YYYY-MM-DD) in the language's convention via the
// date-fns "P" token: en → mm/dd/yyyy, fr → dd/mm/yyyy.
function formatDate(iso: string, lang: Language): string {
  return format(parseISO(iso), 'P', { locale: localeFor(lang) })
}

// Parse a localized date string back to an ISO date, or '' if it is not a real
// date in the language's convention.
function parseLocalizedDate(input: string, lang: Language): string {
  const parsed = parse(input.trim(), 'P', new Date(), {
    locale: localeFor(lang),
  })
  return isValid(parsed) ? format(parsed, 'yyyy-MM-dd') : ''
}

// A localized date field: a text input (typed in the app language) paired with a
// calendar popover. The form value is always kept as an ISO date (or '').
function DateField({
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
  const locale = localeFor(lang)
  const [open, setOpen] = useState(false)
  const [text, setText] = useState(() => (value ? formatDate(value, lang) : ''))

  const shownIso = text.trim() ? parseLocalizedDate(text, lang) : ''
  // Sync the displayed text when the ISO value changes from outside typing
  // (edit prefill, a calendar pick, or a post-submit reset), but leave partial
  // typing alone (when the field's ISO already matches what is shown).
  useEffect(() => {
    if (value !== shownIso) {
      setText(value ? formatDate(value, lang) : '')
    }
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
            onChange(
              event.target.value.trim()
                ? parseLocalizedDate(event.target.value, lang)
                : '',
            )
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
              locale={locale}
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

// The form holds dates as ISO strings ('' means unset / no end date).
interface NannyFormValues {
  first_name: string
  last_name: string
  starting_date: string
  ending_date: string
}

const EMPTY_VALUES: NannyFormValues = {
  first_name: '',
  last_name: '',
  starting_date: '',
  ending_date: '',
}

function toFormValues(nanny: Nanny): NannyFormValues {
  return {
    first_name: nanny.first_name,
    last_name: nanny.last_name,
    starting_date: nanny.starting_date,
    ending_date: nanny.ending_date ?? '',
  }
}

interface NannyFormProps {
  initialValues: NannyFormValues
  submitLabel: string
  submittingLabel: string
  onSubmit: (input: NannyInput) => Promise<void>
  onCancel?: () => void
}

function NannyForm({
  initialValues,
  submitLabel,
  submittingLabel,
  onSubmit,
  onCancel,
}: NannyFormProps) {
  const { t, lang } = useI18n()
  const [errors, setErrors] = useState<string[]>([])

  const form = useForm({
    defaultValues: initialValues,
    onSubmit: async ({ value }) => {
      setErrors([])
      if (!value.starting_date) {
        setErrors([t('nanny.invalidDate')])
        return
      }
      try {
        await onSubmit({
          first_name: value.first_name,
          last_name: value.last_name,
          starting_date: value.starting_date,
          ending_date: value.ending_date || null,
        })
        form.reset()
      } catch (err) {
        setErrors(extractErrorMessages(err, t('nanny.error')))
      }
    },
  })

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault()
        event.stopPropagation()
        form.handleSubmit()
      }}
    >
      <form.Field name="first_name">
        {(field) => (
          <div className="flex flex-col gap-2">
            <Label htmlFor="nanny-first-name">{t('nanny.firstName')}</Label>
            <Input
              id="nanny-first-name"
              name={field.name}
              value={field.state.value}
              onBlur={field.handleBlur}
              onChange={(event) => field.handleChange(event.target.value)}
              autoComplete="off"
              required
            />
          </div>
        )}
      </form.Field>
      <form.Field name="last_name">
        {(field) => (
          <div className="flex flex-col gap-2">
            <Label htmlFor="nanny-last-name">{t('nanny.lastName')}</Label>
            <Input
              id="nanny-last-name"
              name={field.name}
              value={field.state.value}
              onBlur={field.handleBlur}
              onChange={(event) => field.handleChange(event.target.value)}
              autoComplete="off"
              required
            />
          </div>
        )}
      </form.Field>
      <form.Field name="starting_date">
        {(field) => (
          <DateField
            id="nanny-starting-date"
            label={t('nanny.startDate')}
            value={field.state.value}
            onChange={field.handleChange}
            lang={lang}
            required
          />
        )}
      </form.Field>
      <form.Field name="ending_date">
        {(field) => (
          <DateField
            id="nanny-ending-date"
            label={t('nanny.endDate')}
            value={field.state.value}
            onChange={field.handleChange}
            lang={lang}
          />
        )}
      </form.Field>
      <FormErrors messages={errors} />
      <div className="flex gap-2">
        <form.Subscribe selector={(state) => state.isSubmitting}>
          {(isSubmitting) => (
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? submittingLabel : submitLabel}
            </Button>
          )}
        </form.Subscribe>
        {onCancel && (
          <Button variant="outline" type="button" onClick={onCancel}>
            {t('nanny.cancel')}
          </Button>
        )}
      </div>
    </form>
  )
}

export default function Nannies() {
  const { t, lang } = useI18n()
  const queryClient = useQueryClient()
  const [editing, setEditing] = useState<Nanny | null>(null)

  const {
    data: nannies,
    isLoading,
    isError,
  } = useQuery({ queryKey: ['nannies'], queryFn: getNannies })

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: ['nannies'] })

  const createMutation = useMutation({
    mutationFn: (input: NannyInput) => createNanny(input),
    onSuccess: invalidate,
  })
  const updateMutation = useMutation({
    mutationFn: ({ id, input }: { id: number; input: NannyInput }) =>
      updateNanny(id, input),
    onSuccess: () => {
      invalidate()
      setEditing(null)
    },
  })
  const deleteMutation = useMutation({
    mutationFn: (id: number) => deleteNanny(id),
    onSuccess: invalidate,
  })

  return (
    <main className="flex flex-1 flex-col gap-6 p-6 sm:p-10">
      <h1 className="text-3xl font-semibold tracking-tight">
        {t('nanny.title')}
      </h1>

      <Card className="max-w-xl">
        <CardContent>
          {isLoading ? (
            <p className="text-sm text-muted-foreground">
              {t('nanny.loading')}
            </p>
          ) : isError ? (
            <p className="text-sm text-destructive" role="alert">
              {t('nanny.loadError')}
            </p>
          ) : nannies && nannies.length > 0 ? (
            <ul className="flex flex-col divide-y">
              {nannies.map((nanny) => (
                <li
                  key={nanny.id}
                  className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0"
                >
                  <div className="flex flex-col gap-0.5">
                    <span className="font-medium text-foreground">
                      {nanny.first_name} {nanny.last_name}
                    </span>
                    <span className="text-sm text-muted-foreground">
                      {formatDate(nanny.starting_date, lang)} →{' '}
                      {nanny.ending_date
                        ? formatDate(nanny.ending_date, lang)
                        : t('nanny.ongoing')}
                    </span>
                  </div>
                  <div className="flex gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      type="button"
                      onClick={() => setEditing(nanny)}
                    >
                      {t('nanny.edit')}
                    </Button>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button
                          variant="ghost"
                          size="sm"
                          type="button"
                          className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                        >
                          {t('nanny.delete')}
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>
                            {t('nanny.delete')}
                          </AlertDialogTitle>
                          <AlertDialogDescription>
                            {t('nanny.confirmDelete')}
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>
                            {t('nanny.cancel')}
                          </AlertDialogCancel>
                          <AlertDialogAction
                            className="bg-destructive text-white hover:bg-destructive/90"
                            onClick={() => deleteMutation.mutate(nanny.id)}
                          >
                            {t('nanny.delete')}
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">{t('nanny.empty')}</p>
          )}
        </CardContent>
      </Card>

      <Card className="max-w-xl">
        <CardContent className="flex flex-col gap-4">
          <h2 className="font-heading text-lg font-medium">
            {editing ? t('nanny.editTitle') : t('nanny.addTitle')}
          </h2>
          <NannyForm
            // Remount with fresh defaults when switching between add and edit.
            key={editing?.id ?? 'new'}
            initialValues={editing ? toFormValues(editing) : EMPTY_VALUES}
            submitLabel={editing ? t('nanny.save') : t('nanny.add')}
            submittingLabel={editing ? t('nanny.saving') : t('nanny.adding')}
            onCancel={editing ? () => setEditing(null) : undefined}
            onSubmit={async (input) => {
              if (editing) {
                await updateMutation.mutateAsync({ id: editing.id, input })
              } else {
                await createMutation.mutateAsync(input)
              }
            }}
          />
        </CardContent>
      </Card>
    </main>
  )
}
