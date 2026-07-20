import { Link } from 'react-router-dom'
import { Section } from '@/src/components/landing/Section'
import { Button } from '@/src/components/ui/button'
import { useI18n } from '@/src/i18n/I18nContext'
import type { TranslationKey } from '@/src/i18n/translations'

// The closing invitation, shared by the landing and the features page with
// their own copy. A warm coral-tinted band so the final "create an account"
// stands apart from the calmer sections above it.
export function CtaSection({
  titleKey,
  bodyKey,
  buttonKey,
}: {
  titleKey: TranslationKey
  bodyKey: TranslationKey
  buttonKey: TranslationKey
}) {
  const { t } = useI18n()

  return (
    <Section>
      <div className="flex flex-col items-start gap-6 rounded-2xl border border-primary/20 bg-primary/5 px-6 py-12 sm:px-12">
        <div className="max-w-2xl">
          <h2 className="font-heading text-3xl font-semibold tracking-tight sm:text-4xl">
            {t(titleKey)}
          </h2>
          <p className="mt-4 text-lg text-muted-foreground">{t(bodyKey)}</p>
        </div>
        <Button asChild size="lg">
          <Link to="/register">{t(buttonKey)}</Link>
        </Button>
      </div>
    </Section>
  )
}
