import { useForm } from '@tanstack/react-form'
import { Baby } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import type { Credentials } from '../api/auth'
import { extractErrorMessages } from '../api/errors'
import { useI18n } from '../i18n/I18nContext'
import type { TranslationKey } from '../i18n/translations'
import { FormErrors } from './FormErrors'
import { Button } from './ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from './ui/card'
import { Input } from './ui/input'
import { Label } from './ui/label'

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
    <main className="flex flex-1 items-center justify-center p-6">
      <Card className="w-full max-w-sm">
        <CardHeader className="items-center text-center">
          <div
            className="mx-auto mb-2 flex size-13 items-center justify-center rounded-2xl bg-primary/10 text-primary ring-1 ring-primary/20"
            aria-hidden="true"
          >
            <Baby size={28} />
          </div>
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
                <div className="flex flex-col gap-2">
                  <Label htmlFor={field.name}>{t('field.email')}</Label>
                  <Input
                    id={field.name}
                    type="email"
                    name={field.name}
                    value={field.state.value}
                    onBlur={field.handleBlur}
                    onChange={(event) => field.handleChange(event.target.value)}
                    placeholder={t('field.emailPlaceholder')}
                    autoComplete="email"
                    required
                  />
                </div>
              )}
            </form.Field>
            <form.Field name="password">
              {(field) => (
                <div className="flex flex-col gap-2">
                  <Label htmlFor={field.name}>{t('field.password')}</Label>
                  <Input
                    id={field.name}
                    type="password"
                    name={field.name}
                    value={field.state.value}
                    onBlur={field.handleBlur}
                    onChange={(event) => field.handleChange(event.target.value)}
                    placeholder={passwordPlaceholder}
                    autoComplete={passwordAutoComplete}
                    required
                  />
                </div>
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
