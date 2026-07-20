import {
  ArrowRight,
  Calculator,
  CalendarCheck,
  FileText,
  House,
  type LucideIcon,
  UsersRound,
} from 'lucide-react'
import { Link } from 'react-router-dom'
import { Section } from '@/src/components/landing/Section'
import { SectionEyebrow } from '@/src/components/landing/SectionEyebrow'
import { Card } from '@/src/components/ui/card'
import { useI18n } from '@/src/i18n/I18nContext'
import type { TranslationKey } from '@/src/i18n/translations'

type Teaser = {
  icon: LucideIcon
  titleKey: TranslationKey
  bodyKey: TranslationKey
}

// The five features the app offers today, in the order the landing tells its
// story: set the contract, share it, declare, handle the edge cases, all for
// in-home care.
const TEASERS: Teaser[] = [
  {
    icon: FileText,
    titleKey: 'landing.teaser.contracts.title',
    bodyKey: 'landing.teaser.contracts.body',
  },
  {
    icon: UsersRound,
    titleKey: 'landing.teaser.sharedCare.title',
    bodyKey: 'landing.teaser.sharedCare.body',
  },
  {
    icon: Calculator,
    titleKey: 'landing.teaser.declaration.title',
    bodyKey: 'landing.teaser.declaration.body',
  },
  {
    icon: CalendarCheck,
    titleKey: 'landing.teaser.holidays.title',
    bodyKey: 'landing.teaser.holidays.body',
  },
  {
    icon: House,
    titleKey: 'landing.teaser.inHome.title',
    bodyKey: 'landing.teaser.inHome.body',
  },
]

export function FeatureGrid() {
  const { t } = useI18n()

  return (
    <Section>
      <div className="flex max-w-2xl flex-col gap-4">
        <SectionEyebrow>{t('landing.features.eyebrow')}</SectionEyebrow>
        <h2 className="font-heading text-3xl font-semibold tracking-tight sm:text-4xl">
          {t('landing.features.sectionTitle')}
        </h2>
        <p className="text-lg text-muted-foreground">
          {t('landing.features.sectionSubtitle')}
        </p>
      </div>

      <ul className="mt-10 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {TEASERS.map(({ icon: Icon, titleKey, bodyKey }) => (
          <li key={titleKey}>
            <Card className="h-full gap-4 p-6">
              <span className="flex size-11 items-center justify-center rounded-xl bg-brand-emerald/10 text-brand-emerald">
                <Icon size={22} aria-hidden={true} />
              </span>
              <h3 className="font-heading text-lg font-medium">
                {t(titleKey)}
              </h3>
              <p className="text-sm leading-relaxed text-muted-foreground">
                {t(bodyKey)}
              </p>
            </Card>
          </li>
        ))}
      </ul>

      <Link
        to="/features"
        className="mt-8 inline-flex items-center gap-1.5 text-sm font-semibold text-primary underline-offset-4 hover:underline"
      >
        {t('landing.features.link')}
        <ArrowRight size={16} aria-hidden="true" />
      </Link>
    </Section>
  )
}
