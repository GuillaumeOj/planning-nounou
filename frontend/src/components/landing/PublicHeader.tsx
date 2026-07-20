import { Link } from 'react-router-dom'
import { BrandLockup } from '@/src/components/BrandLockup'
import { Button } from '@/src/components/ui/button'
import { useI18n } from '@/src/i18n/I18nContext'

// The public marketing header: brand lockup on the left, wayfinding + the two
// account actions on the right. Sticky and lightly translucent so the warm
// background reads through as the page scrolls under it. The language/theme
// controls live in the footer, not here, to keep the bar uncluttered.
export function PublicHeader() {
  const { t } = useI18n()

  return (
    <header className="sticky top-0 z-30 border-b border-border bg-background/85 backdrop-blur">
      <div className="mx-auto flex h-16 w-full max-w-[1120px] items-center gap-4 px-4 sm:px-6">
        <Link
          to="/"
          className="rounded-md focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          <BrandLockup className="text-base" />
        </Link>

        <nav
          aria-label={t('nav.primary')}
          className="ml-auto flex items-center gap-1 sm:gap-2"
        >
          <Button asChild variant="ghost" className="hidden sm:inline-flex">
            <Link to="/features">{t('landing.nav.features')}</Link>
          </Button>
          <Button asChild variant="ghost" className="hidden sm:inline-flex">
            <Link to="/pricing">{t('landing.nav.pricing')}</Link>
          </Button>
          {/* Login stays reachable on mobile; Features/Pricing collapse to the
              footer below the sm breakpoint. */}
          <Button asChild variant="ghost" size="sm">
            <Link to="/login">{t('landing.nav.login')}</Link>
          </Button>
          <Button asChild size="sm">
            <Link to="/register">{t('landing.nav.register')}</Link>
          </Button>
        </nav>
      </div>
    </header>
  )
}
