import { useForm } from '@tanstack/react-form'
import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { extractErrorMessages } from '@/src/api/errors'
import {
  acceptInvitation,
  declineInvitation,
  getInvitationPreview,
} from '@/src/api/family'
import { useAuth } from '@/src/auth/AuthContext'
import { FormErrors } from '@/src/components/FormErrors'
import { TextField } from '@/src/components/TextField'
import { Button } from '@/src/components/ui/button'
import { Card, CardContent } from '@/src/components/ui/card'
import { useI18n } from '@/src/i18n/I18nContext'
import { roleLabel } from '@/src/lib/roleLabel'

export default function InvitePage() {
  const { t } = useI18n()
  const { token = '' } = useParams()
  const { isAuthenticated } = useAuth()

  const { data, isLoading, isError } = useQuery({
    queryKey: ['invitation', token],
    queryFn: () => getInvitationPreview(token),
    retry: false,
  })

  return (
    <main className="flex flex-1 items-center justify-center p-4 sm:p-6">
      <Card className="w-full max-w-md">
        <CardContent className="flex flex-col gap-6">
          {isLoading ? (
            <p className="text-sm text-muted-foreground">
              {t('invite.loading')}
            </p>
          ) : isError || !data || data.status !== 'pending' ? (
            <>
              <p className="text-sm text-destructive" role="alert">
                {t('invite.invalid')}
              </p>
              <Link
                to="/family"
                className="text-sm text-primary hover:underline"
              >
                {t('invite.goToFamily')}
              </Link>
            </>
          ) : (
            <>
              <div className="flex flex-col gap-2">
                <h1 className="text-2xl font-semibold tracking-tight">
                  {t('invite.title')}
                </h1>
                <p className="text-sm text-muted-foreground">
                  {t('invite.intro')}{' '}
                  <strong className="text-foreground">
                    {data.family_name}
                  </strong>{' '}
                  {t('invite.as')} {roleLabel(t, data.role)}.
                </p>
              </div>
              {isAuthenticated ? (
                <RespondActions token={token} />
              ) : (
                <ClaimForm token={token} email={data.email} />
              )}
            </>
          )}
        </CardContent>
      </Card>
    </main>
  )
}

// Accept or decline as an already-authenticated user.
function RespondActions({ token }: { token: string }) {
  const { t } = useI18n()
  const navigate = useNavigate()
  const [errors, setErrors] = useState<string[]>([])
  const [done, setDone] = useState<'accepted' | 'declined' | null>(null)
  const [busy, setBusy] = useState<'accept' | 'decline' | null>(null)

  const accept = async () => {
    setErrors([])
    setBusy('accept')
    try {
      await acceptInvitation(token)
      setDone('accepted')
    } catch (err) {
      setErrors(extractErrorMessages(err, t('invite.error')))
    } finally {
      setBusy(null)
    }
  }

  const decline = async () => {
    setErrors([])
    setBusy('decline')
    try {
      await declineInvitation(token)
      setDone('declined')
    } catch (err) {
      setErrors(extractErrorMessages(err, t('invite.error')))
    } finally {
      setBusy(null)
    }
  }

  if (done === 'accepted') {
    return (
      <div className="flex flex-col gap-4">
        <p
          className="text-sm text-emerald-600 dark:text-emerald-400"
          role="status"
        >
          {t('invite.accepted')}
        </p>
        <Button type="button" onClick={() => navigate('/family')}>
          {t('invite.goToFamily')}
        </Button>
      </div>
    )
  }
  if (done === 'declined') {
    return (
      <p className="text-sm text-muted-foreground" role="status">
        {t('invite.declined')}
      </p>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <FormErrors messages={errors} />
      <div className="flex gap-2">
        <Button type="button" onClick={accept} disabled={busy !== null}>
          {busy === 'accept' ? t('invite.accepting') : t('invite.accept')}
        </Button>
        <Button
          variant="outline"
          type="button"
          onClick={decline}
          disabled={busy !== null}
        >
          {busy === 'decline' ? t('invite.declining') : t('invite.decline')}
        </Button>
      </div>
    </div>
  )
}

// Register a new account and claim the invitation in one step.
function ClaimForm({ token, email }: { token: string; email: string }) {
  const { t } = useI18n()
  const navigate = useNavigate()
  const { register } = useAuth()
  const [errors, setErrors] = useState<string[]>([])

  const form = useForm({
    defaultValues: { email, password: '' },
    onSubmit: async ({ value }) => {
      setErrors([])
      try {
        await register({ email: value.email, password: value.password }, token)
        navigate('/family')
      } catch (err) {
        setErrors(extractErrorMessages(err, t('invite.error')))
      }
    },
  })

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted-foreground">
        {t('invite.registerPrompt')}
      </p>
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
              id="invite-register-email"
              label={t('field.email')}
              type="email"
              autoComplete="email"
              required
            />
          )}
        </form.Field>
        <form.Field name="password">
          {(field) => (
            <TextField
              field={field}
              id="invite-register-password"
              label={t('field.password')}
              type="password"
              autoComplete="new-password"
              required
            />
          )}
        </form.Field>
        <FormErrors messages={errors} />
        <form.Subscribe selector={(state) => state.isSubmitting}>
          {(isSubmitting) => (
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? t('invite.registering') : t('invite.register')}
            </Button>
          )}
        </form.Subscribe>
      </form>
      <p className="text-sm text-muted-foreground">
        {t('invite.haveAccount')}{' '}
        <Link to="/login" className="text-primary hover:underline">
          {t('invite.login')}
        </Link>
      </p>
    </div>
  )
}
