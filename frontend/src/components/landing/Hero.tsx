import { ArrowRight, Sparkles } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Button } from '@/src/components/ui/button'
import { useI18n } from '@/src/i18n/I18nContext'

// The thesis of the page: the pitch in one warm sentence. A soft emerald/coral
// wash sits behind the type — the only decorative flourish on the page — while
// the headline is carried by the display face at a confident size.
export function Hero() {
  const { t } = useI18n()

  return (
    <section className="relative">
      {/* Ambient wash — decorative only, hidden from assistive tech. The glows
          are allowed to bleed past the hero into the corners; PublicLayout clips
          horizontal overflow so this never adds a scrollbar. */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-0">
        <div className="absolute -top-28 -right-24 h-80 w-80 rounded-full bg-brand-emerald/15 blur-3xl" />
        <div className="absolute -bottom-36 -left-24 h-80 w-80 rounded-full bg-primary/15 blur-3xl" />
      </div>

      <div className="relative mx-auto w-full max-w-[1120px] px-4 py-20 sm:px-6 sm:py-28">
        <p className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-brand-emerald">
          <Sparkles size={16} aria-hidden="true" />
          {t('landing.footer.tagline')}
        </p>
        <h1 className="mt-4 max-w-3xl font-heading text-4xl font-semibold leading-[1.08] tracking-tight text-balance sm:text-5xl md:text-6xl">
          {t('landing.hero.title')}
        </h1>
        <p className="mt-6 max-w-2xl text-lg leading-relaxed text-muted-foreground">
          {t('landing.hero.subtitle')}
        </p>
        <div className="mt-9 flex flex-col gap-3 sm:flex-row sm:items-center">
          <Button asChild size="lg">
            <Link to="/register">
              {t('landing.hero.ctaPrimary')}
              <ArrowRight aria-hidden="true" />
            </Link>
          </Button>
          <Button asChild size="lg" variant="outline">
            <Link to="/features">{t('landing.hero.ctaSecondary')}</Link>
          </Button>
        </div>
      </div>
    </section>
  )
}
