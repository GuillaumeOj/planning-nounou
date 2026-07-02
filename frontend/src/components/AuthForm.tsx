import { useForm } from '@tanstack/react-form'
import { Baby } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import type { Credentials } from '../api/auth'
import { extractErrorMessages } from '../api/errors'
import { useI18n } from '../i18n/I18nContext'
import type { TranslationKey } from '../i18n/translations'
import { FormErrors } from './FormErrors'

interface AuthFormProps {
  variant: 'login' | 'register'
  // Performs the auth action and any post-success navigation; throwing surfaces
  // the error as a list under the form.
  onSubmit: (credentials: Credentials) => Promise<void>
}

// Shared login/register card. The two flows differ only in copy, the password
// autocomplete/placeholder, and the alternate-link target — all derived from
// `variant` here so there is a single form implementation.
export function AuthForm({ variant, onSubmit }: AuthFormProps) {
  const { t } = useI18n()
  const [errors, setErrors] = useState<string[]>([])

  const tk = (suffix: string) => t(`${variant}.${suffix}` as TranslationKey)
  const isRegister = variant === 'register'
  const altTo = isRegister ? '/login' : '/register'
  const passwordAutoComplete = isRegister ? 'new-password' : 'current-password'
  const passwordPlaceholder = t(
    isRegister ? 'field.newPasswordPlaceholder' : 'field.passwordPlaceholder',
  )

  const form = useForm({
    defaultValues: { email: '', password: '' },
    onSubmit: async ({ value }) => {
      setErrors([])
      try {
        await onSubmit(value)
      } catch (err) {
        setErrors(extractErrorMessages(err, tk('error')))
      }
    },
  })

  return (
    <main className="auth">
      <div className="auth-card">
        <div className="brand" aria-hidden="true">
          <Baby size={28} />
        </div>
        <h1>{tk('title')}</h1>
        <p className="auth-sub">{tk('subtitle')}</p>
        <form
          onSubmit={(event) => {
            event.preventDefault()
            event.stopPropagation()
            form.handleSubmit()
          }}
        >
          <form.Field name="email">
            {(field) => (
              <label className="field">
                <span>{t('field.email')}</span>
                <input
                  className="input"
                  type="email"
                  name={field.name}
                  value={field.state.value}
                  onBlur={field.handleBlur}
                  onChange={(event) => field.handleChange(event.target.value)}
                  placeholder={t('field.emailPlaceholder')}
                  autoComplete="email"
                  required
                />
              </label>
            )}
          </form.Field>
          <form.Field name="password">
            {(field) => (
              <label className="field">
                <span>{t('field.password')}</span>
                <input
                  className="input"
                  type="password"
                  name={field.name}
                  value={field.state.value}
                  onBlur={field.handleBlur}
                  onChange={(event) => field.handleChange(event.target.value)}
                  placeholder={passwordPlaceholder}
                  autoComplete={passwordAutoComplete}
                  required
                />
              </label>
            )}
          </form.Field>
          <FormErrors messages={errors} />
          <form.Subscribe selector={(state) => state.isSubmitting}>
            {(isSubmitting) => (
              <button
                className="btn btn-primary"
                type="submit"
                disabled={isSubmitting}
              >
                {isSubmitting ? tk('submitting') : tk('submit')}
              </button>
            )}
          </form.Subscribe>
        </form>
        <p className="auth-alt">
          {tk('altPrompt')} <Link to={altTo}>{tk('altLink')}</Link>
        </p>
      </div>
    </main>
  )
}
