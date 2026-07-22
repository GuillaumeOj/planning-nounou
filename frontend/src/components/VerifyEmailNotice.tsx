import { MailCheck } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuthUsersResendActivationCreateMutation } from '@/src/api'
import { extractErrorMessages } from '@/src/api/errors'
import { AuthCard } from '@/src/components/AuthCard'
import { FormErrors } from '@/src/components/FormErrors'
import { FormSuccess } from '@/src/components/FormSuccess'
import { Button } from '@/src/components/ui/button'
import { useI18n } from '@/src/i18n/I18nContext'

interface VerifyEmailNoticeProps {
  email: string
  // Render without the page/card chrome, for embedding inside another card
  // (e.g. the invitation claim flow).
  inline?: boolean
  // Where to send the user after they log in, carried through from registration
  // (e.g. a contract invite). Appended to the "back to login" link when set.
  next?: string
}

// Shown after registration (standalone or via an invite claim): the account is
// created but inactive until the user follows the activation link we emailed.
export function VerifyEmailNotice({
  email,
  inline,
  next,
}: VerifyEmailNoticeProps) {
  const { t } = useI18n()
  const [errors, setErrors] = useState<string[]>([])
  const [resent, setResent] = useState(false)
  const [busy, setBusy] = useState(false)
  const [resendActivation] = useAuthUsersResendActivationCreateMutation()
  const loginTo = next ? `/login?next=${encodeURIComponent(next)}` : '/login'

  const lead = (
    <>
      {t('verify.lead')} <strong className="text-foreground">{email}</strong>
    </>
  )

  const resend = async () => {
    setErrors([])
    setResent(false)
    setBusy(true)
    try {
      await resendActivation({ sendEmailResetRequest: { email } }).unwrap()
      setResent(true)
    } catch (err) {
      setErrors(extractErrorMessages(err, t('verify.resendError')))
    } finally {
      setBusy(false)
    }
  }

  // The action area, shared by both the standalone card and the inline embed.
  const actions = (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted-foreground">{t('verify.hint')}</p>
      <FormErrors messages={errors} />
      <FormSuccess>{resent && t('verify.resent')}</FormSuccess>
      <Button type="button" variant="outline" onClick={resend} disabled={busy}>
        {busy ? t('verify.resending') : t('verify.resend')}
      </Button>
      <p className="text-center text-sm text-muted-foreground">
        <Link
          className="font-medium text-primary underline-offset-4 hover:underline"
          to={loginTo}
        >
          {t('verify.backToLogin')}
        </Link>
      </p>
    </div>
  )

  if (inline) {
    return (
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold tracking-tight">
            {t('verify.title')}
          </h1>
          <p className="text-sm text-muted-foreground">{lead}</p>
        </div>
        {actions}
      </div>
    )
  }

  return (
    <AuthCard
      icon={<MailCheck size={28} />}
      title={t('verify.title')}
      description={lead}
    >
      {actions}
    </AuthCard>
  )
}
