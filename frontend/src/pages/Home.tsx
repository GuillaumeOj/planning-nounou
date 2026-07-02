import { useQuery } from '@tanstack/react-query'
import { getHealth } from '../api/client'
import { useAuth } from '../auth/AuthContext'
import { useI18n } from '../i18n/I18nContext'

export default function Home() {
  const { user } = useAuth()
  const { t } = useI18n()
  const { data, isLoading, isError } = useQuery({
    queryKey: ['health'],
    queryFn: getHealth,
  })

  const backendStatus = isLoading
    ? t('status.checking')
    : isError
      ? t('status.unreachable')
      : (data?.status ?? t('status.unknown'))
  const badgeClass = isLoading
    ? 'badge-idle'
    : isError
      ? 'badge-bad'
      : 'badge-ok'

  return (
    <main className="page">
      <h1>{t('home.title')}</h1>
      <div className="card">
        <p>
          {t('home.signedInAs')} <strong>{user?.email}</strong>
        </p>
        <p className="status-row">
          {t('home.backend')}{' '}
          <span className={`badge ${badgeClass}`}>{backendStatus}</span>
        </p>
      </div>
    </main>
  )
}
