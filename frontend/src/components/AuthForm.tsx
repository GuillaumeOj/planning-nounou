import { useForm } from '@tanstack/react-form'
import { Baby } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import type { Credentials } from '@/src/api/auth'
import { extractErrorMessages } from '@/src/api/errors'
import { FormErrors } from '@/src/components/FormErrors'
import { TextField } from '@/src/components/TextField'
import { Button } from '@/src/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/src/components/ui/card'
import { useI18n } from '@/src/i18n/I18nContext'
import type { TranslationKey } from '@/src/i18n/translations'
import { APP_NAME } from '@/src/lib/brand'

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
    <main className="flex flex-1 items-center justify-center p-4 sm:p-6">
      <Card className="w-full max-w-sm">
        <CardHeader className="items-center text-center">
          <div
            className="mx-auto mb-2 flex size-13 items-center justify-center rounded-2xl bg-brand-emerald/10 text-brand-emerald ring-1 ring-brand-emerald/20"
            aria-hidden="true"
          >
            <Baby size={28} />
          </div>
          <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            {APP_NAME}
          </p>
          <CardTitle className="text-2xl">{tk('title')}</CardTitle>
          <CardDescription>{tk('subtitle')}</CardDescription>
        </CardHeader>
        <CardContent>
          <form
            className="flex flex-col gap-4"
            onSubmit={(event) => {
              event.preventDefault()
              event.stopPropagation()
              form.handleSubmit()
            }}
          >
            <form.Field name="email">
              {(field) => (
                <TextField
                  field={field}
                  id={field.name}
                  label={t('field.email')}
                  type="email"
                  placeholder={t('field.emailPlaceholder')}
                  autoComplete="email"
                  required
                />
              )}
            </form.Field>
            <form.Field name="password">
              {(field) => (
                <TextField
                  field={field}
                  id={field.name}
                  label={t('field.password')}
                  type="password"
                  placeholder={passwordPlaceholder}
                  autoComplete={passwordAutoComplete}
                  required
                />
              )}
            </form.Field>
            <FormErrors messages={errors} />
            <form.Subscribe selector={(state) => state.isSubmitting}>
              {(isSubmitting) => (
                <Button
                  type="submit"
                  className="w-full"
                  disabled={isSubmitting}
                >
                  {isSubmitting ? tk('submitting') : tk('submit')}
                </Button>
              )}
            </form.Subscribe>
          </form>
        </CardContent>
        <CardFooter className="justify-center">
          <p className="text-sm text-muted-foreground">
            {tk('altPrompt')}{' '}
            <Link
              className="font-medium text-primary underline-offset-4 hover:underline"
              to={altTo}
            >
              {tk('altLink')}
            </Link>
          </p>
        </CardFooter>
      </Card>
    </main>
  )
}
