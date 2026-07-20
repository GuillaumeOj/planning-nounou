import { Link } from 'react-router-dom'
import { AppearanceControls } from '@/src/components/AppearanceControls'
import { BrandLockup } from '@/src/components/BrandLockup'
import { useI18n } from '@/src/i18n/I18nContext'
import type { TranslationKey } from '@/src/i18n/translations'
import { APP_NAME } from '@/src/lib/brand'

type FooterLink = { to: string; labelKey: TranslationKey }

const PRODUCT_LINKS: FooterLink[] = [
  { to: '/features', labelKey: 'landing.nav.features' },
  { to: '/pricing', labelKey: 'landing.nav.pricing' },
  { to: '/login', labelKey: 'landing.nav.login' },
  { to: '/register', labelKey: 'landing.nav.register' },
]

const LEGAL_LINKS: FooterLink[] = [
  { to: '/privacy', labelKey: 'landing.nav.privacy' },
  { to: '/legal', labelKey: 'landing.nav.legal' },
]

function FooterColumn({
  headingKey,
  links,
}: {
  headingKey: TranslationKey
  links: FooterLink[]
}) {
  const { t } = useI18n()
  return (
    <nav aria-label={t(headingKey)} className="flex flex-col gap-2 text-sm">
      <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {t(headingKey)}
      </h2>
      {links.map((link) => (
        <Link
          key={link.to}
          to={link.to}
          className="text-muted-foreground transition-colors hover:text-foreground"
        >
          {t(link.labelKey)}
        </Link>
      ))}
    </nav>
  )
}

// The public footer: brand + tagline, the language/theme controls (their only
// home now that the header is clear of them), and wayfinding split into product
// and legal columns. The year is computed rather than baked into a translation.
export function PublicFooter() {
  const { t } = useI18n()
  const year = new Date().getFullYear()

  return (
    <footer className="mt-auto border-t border-border bg-secondary/40">
      <div className="mx-auto grid w-full max-w-[1120px] grid-cols-1 gap-10 px-4 py-10 sm:px-6 md:grid-cols-[minmax(0,1fr)_auto_auto]">
        <div className="flex max-w-sm flex-col gap-3">
          <BrandLockup showBeta={false} />
          <p className="text-sm text-muted-foreground">
            {t('landing.footer.tagline')}
          </p>
          <div className="flex items-center gap-2 pt-1">
            <AppearanceControls />
          </div>
        </div>

        <FooterColumn
          headingKey="landing.footer.product"
          links={PRODUCT_LINKS}
        />
        <FooterColumn headingKey="landing.footer.legal" links={LEGAL_LINKS} />
      </div>

      <div className="border-t border-border/70">
        <p className="mx-auto w-full max-w-[1120px] px-4 py-4 text-xs text-muted-foreground sm:px-6">
          © {year} {APP_NAME}. {t('landing.footer.rights')}
        </p>
      </div>
    </footer>
  )
}
