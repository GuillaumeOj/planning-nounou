import { Info } from 'lucide-react'
import { Link } from 'react-router-dom'
import { CheckList } from '@/src/components/landing/CheckList'
import { Section } from '@/src/components/landing/Section'
import { Button } from '@/src/components/ui/button'
import { Card } from '@/src/components/ui/card'
import { useSeoMeta } from '@/src/hooks/useSeoMeta'
import { useI18n } from '@/src/i18n/I18nContext'
import type { TranslationKey } from '@/src/i18n/translations'

const INCLUDED: TranslationKey[] = [
  'pricing.plan.b1',
  'pricing.plan.b2',
  'pricing.plan.b3',
  'pricing.plan.b4',
  'pricing.plan.b5',
]

export default function Pricing() {
  const { t } = useI18n()
  useSeoMeta({
    title: t('seo.pricing.title'),
    description: t('seo.pricing.description'),
    canonical: '/pricing',
  })

  return (
    <Section>
      <div className="max-w-2xl">
        <h1 className="font-heading text-4xl font-semibold tracking-tight sm:text-5xl">
          {t('pricing.page.title')}
        </h1>
        <p className="mt-5 text-lg text-muted-foreground">
          {t('pricing.page.subtitle')}
        </p>
      </div>

      <Card className="mt-10 max-w-lg gap-6 p-8">
        <div className="flex flex-col gap-1">
          <span className="text-sm font-semibold uppercase tracking-wide text-brand-emerald">
            {t('pricing.plan.name')}
          </span>
          <div className="flex items-baseline gap-2">
            <span className="font-heading text-4xl font-semibold">
              {t('pricing.plan.price')}
            </span>
            <span className="text-sm text-muted-foreground">
              {t('pricing.plan.period')}
            </span>
          </div>
          <p className="mt-2 text-sm text-muted-foreground">
            {t('pricing.plan.description')}
          </p>
        </div>

        <CheckList itemKeys={INCLUDED} />

        <Button asChild size="lg" className="w-full">
          <Link to="/register">{t('pricing.cta.button')}</Link>
        </Button>
      </Card>

      <div className="mt-8 flex max-w-lg items-start gap-3 rounded-lg border border-border bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
        <Info size={18} aria-hidden="true" className="mt-0.5 shrink-0" />
        <p className="leading-relaxed">{t('pricing.note')}</p>
      </div>
    </Section>
  )
}
