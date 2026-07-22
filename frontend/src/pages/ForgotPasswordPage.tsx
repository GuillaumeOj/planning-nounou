import { useForm } from '@tanstack/react-form'
import { KeyRound } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuthUsersResetPasswordCreateMutation } from '@/src/api'
import { extractErrorMessages } from '@/src/api/errors'
import { AuthCard } from '@/src/components/AuthCard'
import { FormErrors } from '@/src/components/FormErrors'
import { FormSuccess } from '@/src/components/FormSuccess'
import { TextField } from '@/src/components/TextField'
import { Button } from '@/src/components/ui/button'
import { useI18n } from '@/src/i18n/I18nContext'

export default function ForgotPasswordPage() {
  const { t } = useI18n()
  const [errors, setErrors] = useState<string[]>([])
  const [sent, setSent] = useState(false)
  const [requestPasswordReset] = useAuthUsersResetPasswordCreateMutation()

  const form = useForm({
    defaultValues: { email: '' },
    onSubmit: async ({ value }) => {
      setErrors([])
      try {
        await requestPasswordReset({
          sendEmailResetRequest: { email: value.email },
        }).unwrap()
        // Always report success — the API never reveals whether the email exists.
        setSent(true)
      } catch (err) {
        setErrors(extractErrorMessages(err, t('forgot.error')))
      }
    },
  })

  return (
    <AuthCard
      icon={<KeyRound size={28} />}
      title={t('forgot.title')}
      description={t('forgot.subtitle')}
      footer={
        <Link
          className="text-sm font-medium text-primary underline-offset-4 hover:underline"
          to="/login"
        >
          {t('forgot.backToLogin')}
        </Link>
      }
    >
      {sent ? (
        <FormSuccess>{t('forgot.sent')}</FormSuccess>
      ) : (
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
          <FormErrors messages={errors} />
          <form.Subscribe selector={(state) => state.isSubmitting}>
            {(isSubmitting) => (
              <Button type="submit" className="w-full" disabled={isSubmitting}>
                {isSubmitting ? t('forgot.submitting') : t('forgot.submit')}
              </Button>
            )}
          </form.Subscribe>
        </form>
      )}
    </AuthCard>
  )
}
