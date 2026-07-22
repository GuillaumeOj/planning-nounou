import { useForm } from '@tanstack/react-form'
import { KeyRound } from 'lucide-react'
import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useAuthUsersResetPasswordConfirmCreateMutation } from '@/src/api'
import { extractErrorMessages } from '@/src/api/errors'
import { AuthCard } from '@/src/components/AuthCard'
import { FormErrors } from '@/src/components/FormErrors'
import { FormSuccess } from '@/src/components/FormSuccess'
import { TextField } from '@/src/components/TextField'
import { Button } from '@/src/components/ui/button'
import { useI18n } from '@/src/i18n/I18nContext'

// Landing for the reset link in the email: /reset-password/:uid/:token
export default function ResetPasswordPage() {
  const { t } = useI18n()
  const { uid = '', token = '' } = useParams()
  const [errors, setErrors] = useState<string[]>([])
  const [done, setDone] = useState(false)
  const [confirmPasswordReset] =
    useAuthUsersResetPasswordConfirmCreateMutation()

  const form = useForm({
    defaultValues: { new_password: '' },
    onSubmit: async ({ value }) => {
      setErrors([])
      try {
        await confirmPasswordReset({
          passwordResetConfirmRequest: {
            uid,
            token,
            new_password: value.new_password,
          },
        }).unwrap()
        setDone(true)
      } catch (err) {
        setErrors(extractErrorMessages(err, t('reset.error')))
      }
    },
  })

  return (
    <AuthCard
      icon={<KeyRound size={28} />}
      title={t('reset.title')}
      description={t('reset.subtitle')}
      footer={
        <Link
          className="text-sm font-medium text-primary underline-offset-4 hover:underline"
          to="/login"
        >
          {t('reset.toLogin')}
        </Link>
      }
    >
      {done ? (
        <FormSuccess>{t('reset.done')}</FormSuccess>
      ) : (
        <form
          className="flex flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault()
            event.stopPropagation()
            form.handleSubmit()
          }}
        >
          <form.Field name="new_password">
            {(field) => (
              <TextField
                field={field}
                id={field.name}
                label={t('reset.password')}
                type="password"
                placeholder={t('field.newPasswordPlaceholder')}
                autoComplete="new-password"
                required
              />
            )}
          </form.Field>
          <FormErrors messages={errors} />
          <form.Subscribe selector={(state) => state.isSubmitting}>
            {(isSubmitting) => (
              <Button type="submit" className="w-full" disabled={isSubmitting}>
                {isSubmitting ? t('reset.submitting') : t('reset.submit')}
              </Button>
            )}
          </form.Subscribe>
        </form>
      )}
    </AuthCard>
  )
}
