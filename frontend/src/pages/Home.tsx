import { useQuery } from '@tanstack/react-query'
import { getHealth } from '@/src/api/client'
import { useAuth } from '@/src/auth/AuthContext'
import { Badge } from '@/src/components/ui/badge'
import { Card, CardContent } from '@/src/components/ui/card'
import { useI18n } from '@/src/i18n/I18nContext'

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
    ? 'bg-muted text-muted-foreground'
    : isError
      ? 'bg-destructive/15 text-destructive'
      : 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'

  return (
    <main className="flex flex-1 flex-col gap-6 p-4 sm:p-10">
      <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
        {t('home.title')}
      </h1>
      <Card className="max-w-lg">
        <CardContent className="flex flex-col gap-3">
          <p className="break-words">
            {t('home.signedInAs')}{' '}
            <strong className="text-foreground">{user?.email}</strong>
          </p>
          <p className="flex flex-wrap items-center gap-2 text-muted-foreground">
            {t('home.backend')}{' '}
            <Badge className={`border-transparent ${badgeClass}`}>
              {backendStatus}
            </Badge>
          </p>
        </CardContent>
      </Card>
    </main>
  )
}
