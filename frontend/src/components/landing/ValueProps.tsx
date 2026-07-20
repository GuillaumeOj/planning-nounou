import {
  Feather,
  FileCheck2,
  Heart,
  ListChecks,
  type LucideIcon,
  Wallet,
} from 'lucide-react'
import { SectionEyebrow } from '@/src/components/landing/SectionEyebrow'
import { useI18n } from '@/src/i18n/I18nContext'
import type { TranslationKey } from '@/src/i18n/translations'

type Value = {
  icon: LucideIcon
  titleKey: TranslationKey
  bodyKey: TranslationKey
}

const VALUES: Value[] = [
  {
    icon: Feather,
    titleKey: 'landing.value.lessStress.title',
    bodyKey: 'landing.value.lessStress.body',
  },
  {
    icon: ListChecks,
    titleKey: 'landing.value.management.title',
    bodyKey: 'landing.value.management.body',
  },
  {
    icon: FileCheck2,
    titleKey: 'landing.value.declaration.title',
    bodyKey: 'landing.value.declaration.body',
  },
  {
    icon: Heart,
    titleKey: 'landing.value.human.title',
    bodyKey: 'landing.value.human.body',
  },
  {
    icon: Wallet,
    titleKey: 'landing.value.pay.title',
    bodyKey: 'landing.value.pay.body',
  },
]

// The "why", set apart from the feature cards by a warm band and a lighter,
// borderless treatment: an icon, a claim, a sentence. No cards here, so the two
// sections don't read as the same grid twice.
export function ValueProps() {
  const { t } = useI18n()

  return (
    <section className="border-y border-border bg-secondary/40">
      <div className="mx-auto w-full max-w-[1120px] px-4 py-16 sm:px-6 sm:py-20">
        <div className="mb-10 flex max-w-2xl flex-col gap-4">
          <SectionEyebrow>{t('landing.value.eyebrow')}</SectionEyebrow>
          <h2 className="font-heading text-3xl font-semibold tracking-tight sm:text-4xl">
            {t('landing.value.sectionTitle')}
          </h2>
        </div>
        <div className="grid grid-cols-1 gap-x-10 gap-y-10 sm:grid-cols-2 lg:grid-cols-3">
          {VALUES.map(({ icon: Icon, titleKey, bodyKey }) => (
            <div key={titleKey} className="flex gap-4">
              <Icon
                size={22}
                aria-hidden={true}
                className="mt-0.5 shrink-0 text-primary"
              />
              <div>
                <h3 className="font-heading text-lg font-medium">
                  {t(titleKey)}
                </h3>
                <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
                  {t(bodyKey)}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
