import { MailCheck } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useAuthUsersActivationCreateMutation } from '@/src/api'
import { AuthCard } from '@/src/components/AuthCard'
import { useI18n } from '@/src/i18n/I18nContext'
import type { TranslationKey } from '@/src/i18n/translations'

type Status = 'verifying' | 'success' | 'error'

// Message copy, colour, and ARIA role for each state — kept together so the
// three never drift apart.
const STATUS: Record<
  Status,
  { key: TranslationKey; className: string; role: 'status' | 'alert' }
> = {
  verifying: {
    key: 'activate.verifying',
    className: 'text-muted-foreground',
    role: 'status',
  },
  success: {
    key: 'activate.success',
    className: 'text-emerald-600 dark:text-emerald-400',
    role: 'status',
  },
  error: {
    key: 'activate.error',
    className: 'text-destructive',
    role: 'alert',
  },
}

// Landing for the activation link in the email: /activate/:uid/:token.
// Confirms the email once on mount, then points the user to log in.
export default function ActivatePage() {
  const { t } = useI18n()
  const { uid = '', token = '' } = useParams()
  const [status, setStatus] = useState<Status>('verifying')
  // Guard against a double-invoke in React StrictMode (dev): only activate once.
  const started = useRef(false)
  const [activate] = useAuthUsersActivationCreateMutation()

  useEffect(() => {
    if (started.current) return
    started.current = true
    activate({ activationRequest: { uid, token } })
      .unwrap()
      .then(() => setStatus('success'))
      .catch(() => setStatus('error'))
  }, [uid, token, activate])

  const view = STATUS[status]

  return (
    <AuthCard icon={<MailCheck size={28} />} title={t('verify.title')}>
      <div className="flex flex-col gap-4 text-center">
        <p className={`text-sm ${view.className}`} role={view.role}>
          {t(view.key)}
        </p>
        {status !== 'verifying' && (
          <Link
            className="font-medium text-primary underline-offset-4 hover:underline"
            to="/login"
          >
            {t('activate.toLogin')}
          </Link>
        )}
      </div>
    </AuthCard>
  )
}
