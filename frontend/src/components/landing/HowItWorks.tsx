import { Section } from '@/src/components/landing/Section'
import { SectionEyebrow } from '@/src/components/landing/SectionEyebrow'
import { useI18n } from '@/src/i18n/I18nContext'
import type { TranslationKey } from '@/src/i18n/translations'

type Step = { titleKey: TranslationKey; bodyKey: TranslationKey }

// A real three-step sequence — set the contract, follow the month, get each
// declaration — so the numbering encodes order the reader actually needs,
// rather than decorating the section.
const STEPS: Step[] = [
  { titleKey: 'landing.how.step1.title', bodyKey: 'landing.how.step1.body' },
  { titleKey: 'landing.how.step2.title', bodyKey: 'landing.how.step2.body' },
  { titleKey: 'landing.how.step3.title', bodyKey: 'landing.how.step3.body' },
]

export function HowItWorks() {
  const { t } = useI18n()

  return (
    <Section>
      <div className="flex flex-col gap-4">
        <SectionEyebrow>{t('landing.how.eyebrow')}</SectionEyebrow>
        <h2 className="font-heading text-3xl font-semibold tracking-tight sm:text-4xl">
          {t('landing.how.title')}
        </h2>
      </div>
      <ol className="mt-10 grid grid-cols-1 gap-8 md:grid-cols-3">
        {STEPS.map((step, index) => (
          <li key={step.titleKey} className="relative flex flex-col gap-3">
            {/* Connector to the next step, drawn only between cards on wide
                screens so the three read as one ordered flow. */}
            {index < STEPS.length - 1 && (
              <span
                aria-hidden="true"
                className="absolute top-5 left-14 hidden h-px w-[calc(100%-2.5rem)] bg-border md:block"
              />
            )}
            <span
              aria-hidden="true"
              className="flex size-10 items-center justify-center rounded-full bg-brand-emerald/10 font-heading text-lg font-semibold text-brand-emerald"
            >
              {index + 1}
            </span>
            <h3 className="font-heading text-xl font-medium">
              {t(step.titleKey)}
            </h3>
            <p className="text-sm leading-relaxed text-muted-foreground">
              {t(step.bodyKey)}
            </p>
          </li>
        ))}
      </ol>
    </Section>
  )
}
