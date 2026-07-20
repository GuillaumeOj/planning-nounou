import { BetaBanner } from '@/src/components/BetaBanner'
import { CtaSection } from '@/src/components/landing/CtaSection'
import { FeatureGrid } from '@/src/components/landing/FeatureGrid'
import { Hero } from '@/src/components/landing/Hero'
import { HowItWorks } from '@/src/components/landing/HowItWorks'
import { ValueProps } from '@/src/components/landing/ValueProps'
import { useSeoMeta } from '@/src/hooks/useSeoMeta'
import { useI18n } from '@/src/i18n/I18nContext'

// The public landing: a summarized pitch. The beta notice sits up top so the
// honesty about the calculations is the first thing a visitor reads.
export default function Landing() {
  const { t } = useI18n()
  useSeoMeta({
    title: t('seo.landing.title'),
    description: t('seo.landing.description'),
    canonical: '/',
  })

  return (
    <>
      <div className="mx-auto w-full max-w-[1120px] px-4 pt-4 sm:px-6">
        <BetaBanner />
      </div>
      <Hero />
      <HowItWorks />
      <FeatureGrid />
      <ValueProps />
      <CtaSection
        titleKey="landing.cta.title"
        bodyKey="landing.cta.body"
        buttonKey="landing.cta.button"
      />
    </>
  )
}
