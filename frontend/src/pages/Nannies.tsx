import { useForm } from '@tanstack/react-form'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
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
import { useI18n } from '../i18n/I18nContext'
import type { Language } from '../i18n/translations'

// Display a stored ISO date (YYYY-MM-DD) in the language's convention:
// en → mm/dd/yyyy, fr → dd/mm/yyyy. Parsed by parts to avoid timezone shifts.
function formatDate(iso: string, lang: Language): string {
  const [year, month, day] = iso.split('-')
  return lang === 'fr' ? `${day}/${month}/${year}` : `${month}/${day}/${year}`
}

// Inverse of formatDate: parse a localized date string back to an ISO date, or
// null if it is not a real calendar date. Native <input type="date"> can't be
// localized (it follows the browser locale), so date entry uses text fields
// formatted per the app's language instead.
function parseLocalizedDate(input: string, lang: Language): string | null {
  const match = input.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  if (!match) return null
  const [, first, second, year] = match
  const day = lang === 'fr' ? first : second
  const month = lang === 'fr' ? second : first
  const iso = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`
  const date = new Date(`${iso}T00:00:00Z`)
  if (
    Number.isNaN(date.getTime()) ||
    date.getUTCMonth() + 1 !== Number(month) ||
    date.getUTCDate() !== Number(day)
  ) {
    return null
  }
  return iso
}

// The form holds dates as localized display strings (mm/dd/yyyy or dd/mm/yyyy);
// they are parsed to ISO on submit. An empty ending_date means "no end date".
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

function toFormValues(nanny: Nanny, lang: Language): NannyFormValues {
  return {
    first_name: nanny.first_name,
    last_name: nanny.last_name,
    starting_date: formatDate(nanny.starting_date, lang),
    ending_date: nanny.ending_date ? formatDate(nanny.ending_date, lang) : '',
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
      const startingDate = parseLocalizedDate(value.starting_date, lang)
      const endingRaw = value.ending_date.trim()
      const endingDate = endingRaw ? parseLocalizedDate(endingRaw, lang) : null
      if (!startingDate || (endingRaw && !endingDate)) {
        setErrors([t('nanny.invalidDate')])
        return
      }
      try {
        await onSubmit({
          first_name: value.first_name,
          last_name: value.last_name,
          starting_date: startingDate,
          ending_date: endingDate,
        })
        form.reset()
      } catch (err) {
        setErrors(extractErrorMessages(err, t('nanny.error')))
      }
    },
  })

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault()
        event.stopPropagation()
        form.handleSubmit()
      }}
    >
      <form.Field name="first_name">
        {(field) => (
          <label className="field">
            <span>{t('nanny.firstName')}</span>
            <input
              className="input"
              type="text"
              name={field.name}
              value={field.state.value}
              onBlur={field.handleBlur}
              onChange={(event) => field.handleChange(event.target.value)}
              autoComplete="off"
              required
            />
          </label>
        )}
      </form.Field>
      <form.Field name="last_name">
        {(field) => (
          <label className="field">
            <span>{t('nanny.lastName')}</span>
            <input
              className="input"
              type="text"
              name={field.name}
              value={field.state.value}
              onBlur={field.handleBlur}
              onChange={(event) => field.handleChange(event.target.value)}
              autoComplete="off"
              required
            />
          </label>
        )}
      </form.Field>
      <form.Field name="starting_date">
        {(field) => (
          <label className="field">
            <span>{t('nanny.startDate')}</span>
            <input
              className="input"
              type="text"
              inputMode="numeric"
              placeholder={t('nanny.dateFormat')}
              name={field.name}
              value={field.state.value}
              onBlur={field.handleBlur}
              onChange={(event) => field.handleChange(event.target.value)}
              required
            />
          </label>
        )}
      </form.Field>
      <form.Field name="ending_date">
        {(field) => (
          <label className="field">
            <span>{t('nanny.endDate')}</span>
            <input
              className="input"
              type="text"
              inputMode="numeric"
              placeholder={t('nanny.dateFormat')}
              name={field.name}
              value={field.state.value}
              onBlur={field.handleBlur}
              onChange={(event) => field.handleChange(event.target.value)}
            />
          </label>
        )}
      </form.Field>
      <FormErrors messages={errors} />
      <div className="form-actions">
        <form.Subscribe selector={(state) => state.isSubmitting}>
          {(isSubmitting) => (
            <button
              className="btn btn-primary"
              type="submit"
              disabled={isSubmitting}
            >
              {isSubmitting ? submittingLabel : submitLabel}
            </button>
          )}
        </form.Subscribe>
        {onCancel && (
          <button className="btn btn-ghost" type="button" onClick={onCancel}>
            {t('nanny.cancel')}
          </button>
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

  const handleDelete = (nanny: Nanny) => {
    if (window.confirm(t('nanny.confirmDelete'))) {
      deleteMutation.mutate(nanny.id)
    }
  }

  return (
    <main className="page">
      <h1>{t('nanny.title')}</h1>

      <div className="card">
        {isLoading ? (
          <p>{t('nanny.loading')}</p>
        ) : isError ? (
          <p className="alert" role="alert">
            {t('nanny.loadError')}
          </p>
        ) : nannies && nannies.length > 0 ? (
          <ul className="nanny-list">
            {nannies.map((nanny) => (
              <li key={nanny.id} className="nanny-row">
                <div className="nanny-info">
                  <span className="nanny-name">
                    {nanny.first_name} {nanny.last_name}
                  </span>
                  <span className="nanny-dates">
                    {formatDate(nanny.starting_date, lang)} →{' '}
                    {nanny.ending_date
                      ? formatDate(nanny.ending_date, lang)
                      : t('nanny.ongoing')}
                  </span>
                </div>
                <div className="nanny-actions">
                  <button
                    className="btn btn-ghost"
                    type="button"
                    onClick={() => setEditing(nanny)}
                  >
                    {t('nanny.edit')}
                  </button>
                  <button
                    className="btn btn-ghost"
                    type="button"
                    onClick={() => handleDelete(nanny)}
                  >
                    {t('nanny.delete')}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p>{t('nanny.empty')}</p>
        )}
      </div>

      <div className="card">
        <h2>{editing ? t('nanny.editTitle') : t('nanny.addTitle')}</h2>
        <NannyForm
          // Remount with fresh defaults when switching between add and edit.
          key={editing?.id ?? 'new'}
          initialValues={editing ? toFormValues(editing, lang) : EMPTY_VALUES}
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
      </div>
    </main>
  )
}
