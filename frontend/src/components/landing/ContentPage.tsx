import { useSeoMeta } from '@/src/hooks/useSeoMeta'
import { useI18n } from '@/src/i18n/I18nContext'
import type { TranslationKey } from '@/src/i18n/translations'

export type ContentSection = {
  titleKey: TranslationKey
  bodyKey: TranslationKey
}

// A plain prose layout shared by the legal and privacy pages: a title, a lead,
// and a run of titled paragraphs. Kept narrow for comfortable reading.
export function ContentPage({
  titleKey,
  leadKey,
  sections,
  seoTitleKey,
  seoDescriptionKey,
  canonical,
}: {
  titleKey: TranslationKey
  leadKey: TranslationKey
  sections: ContentSection[]
  seoTitleKey: TranslationKey
  seoDescriptionKey: TranslationKey
  canonical: string
}) {
  const { t } = useI18n()
  useSeoMeta({
    title: t(seoTitleKey),
    description: t(seoDescriptionKey),
    canonical,
  })

  return (
    <article className="mx-auto w-full max-w-3xl px-4 py-16 sm:px-6 sm:py-20">
      <h1 className="font-heading text-4xl font-semibold tracking-tight sm:text-5xl">
        {t(titleKey)}
      </h1>
      <p className="mt-5 text-lg text-muted-foreground">{t(leadKey)}</p>
      <p className="mt-3 text-sm text-muted-foreground">
        {t('legal.lastUpdated')}
      </p>

      <div className="mt-12 flex flex-col gap-10">
        {sections.map((section) => (
          <section key={section.titleKey}>
            <h2 className="font-heading text-xl font-medium">
              {t(section.titleKey)}
            </h2>
            <p className="mt-3 leading-relaxed text-muted-foreground">
              {t(section.bodyKey)}
            </p>
          </section>
        ))}
      </div>
    </article>
  )
}
