import {
  Calculator,
  CalendarCheck,
  FileText,
  House,
  type LucideIcon,
  UsersRound,
} from 'lucide-react'
import { CheckList } from '@/src/components/landing/CheckList'
import { CtaSection } from '@/src/components/landing/CtaSection'
import { useSeoMeta } from '@/src/hooks/useSeoMeta'
import { useI18n } from '@/src/i18n/I18nContext'
import type { TranslationKey } from '@/src/i18n/translations'

type Section = {
  id: string
  icon: LucideIcon
  titleKey: TranslationKey
  bodyKey: TranslationKey
  bulletKeys: TranslationKey[]
}

// One section per feature, in the same order as the landing teasers. The ids
// make each feature directly linkable (e.g. /features#declaration).
const SECTIONS: Section[] = [
  {
    id: 'contrats',
    icon: FileText,
    titleKey: 'features.contracts.title',
    bodyKey: 'features.contracts.body',
    bulletKeys: [
      'features.contracts.b1',
      'features.contracts.b2',
      'features.contracts.b3',
      'features.contracts.b4',
    ],
  },
  {
    id: 'garde-partagee',
    icon: UsersRound,
    titleKey: 'features.sharedCare.title',
    bodyKey: 'features.sharedCare.body',
    bulletKeys: [
      'features.sharedCare.b1',
      'features.sharedCare.b2',
      'features.sharedCare.b3',
      'features.sharedCare.b4',
    ],
  },
  {
    id: 'declaration',
    icon: Calculator,
    titleKey: 'features.declaration.title',
    bodyKey: 'features.declaration.body',
    bulletKeys: [
      'features.declaration.b1',
      'features.declaration.b2',
      'features.declaration.b3',
      'features.declaration.b4',
    ],
  },
  {
    id: 'conges-feries',
    icon: CalendarCheck,
    titleKey: 'features.holidays.title',
    bodyKey: 'features.holidays.body',
    bulletKeys: [
      'features.holidays.b1',
      'features.holidays.b2',
      'features.holidays.b3',
      'features.holidays.b4',
    ],
  },
  {
    id: 'a-domicile',
    icon: House,
    titleKey: 'features.inHome.title',
    bodyKey: 'features.inHome.body',
    bulletKeys: [
      'features.inHome.b1',
      'features.inHome.b2',
      'features.inHome.b3',
      'features.inHome.b4',
    ],
  },
]

export default function Features() {
  const { t } = useI18n()
  useSeoMeta({
    title: t('seo.features.title'),
    description: t('seo.features.description'),
    canonical: '/features',
  })

  return (
    <>
      <header className="mx-auto w-full max-w-[1120px] px-4 py-16 sm:px-6 sm:py-20">
        <h1 className="max-w-3xl font-heading text-4xl font-semibold leading-tight tracking-tight text-balance sm:text-5xl">
          {t('features.page.title')}
        </h1>
        <p className="mt-5 max-w-2xl text-lg text-muted-foreground">
          {t('features.page.subtitle')}
        </p>
      </header>

      <div className="mx-auto flex w-full max-w-[1120px] flex-col gap-16 px-4 pb-8 sm:px-6 sm:gap-20">
        {SECTIONS.map(({ id, icon: Icon, titleKey, bodyKey, bulletKeys }) => (
          <section
            key={id}
            id={id}
            className="scroll-mt-20 border-t border-border pt-12"
          >
            {/* Icon + title head the section full width; the explanation and
                its bullet list sit side by side below, so the list lines up with
                the paragraph rather than the icon above it. */}
            <div className="flex items-center gap-4">
              <span className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-brand-emerald/10 text-brand-emerald">
                <Icon size={24} aria-hidden={true} />
              </span>
              <h2 className="font-heading text-2xl font-semibold tracking-tight sm:text-3xl">
                {t(titleKey)}
              </h2>
            </div>
            <div className="mt-6 grid grid-cols-1 gap-8 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
              <p className="text-base leading-relaxed text-muted-foreground">
                {t(bodyKey)}
              </p>
              <CheckList itemKeys={bulletKeys} />
            </div>
          </section>
        ))}
      </div>

      <CtaSection
        titleKey="features.cta.title"
        bodyKey="features.cta.body"
        buttonKey="features.cta.button"
      />
    </>
  )
}
