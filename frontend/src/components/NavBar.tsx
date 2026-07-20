import { useQuery } from '@tanstack/react-query'
import {
  CalendarDays,
  ChevronUp,
  FileText,
  HomeIcon,
  Menu,
  Settings,
  Users,
  UsersRound,
  X,
} from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { getMyContractInvitations } from '@/src/api/contracts'
import { getMyInvitations } from '@/src/api/family'
import { useAuth } from '@/src/auth/AuthContext'
import { AppearanceControls } from '@/src/components/AppearanceControls'
import { BrandLockup } from '@/src/components/BrandLockup'
import { PersonAvatar } from '@/src/components/PersonAvatar'
import { Button } from '@/src/components/ui/button'
import { useI18n } from '@/src/i18n/I18nContext'
import { cn } from '@/src/lib/utils'

const linkClass = ({ isActive }: { isActive: boolean }) =>
  [
    'flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm transition-colors md:py-2',
    isActive
      ? 'bg-primary/10 text-primary'
      : 'text-muted-foreground hover:bg-muted hover:text-foreground',
  ].join(' ')

const badgeClass =
  'ml-auto flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-xs font-medium text-primary-foreground'

// Primary navigation. One <nav> serves both breakpoints: a static left sidebar
// from md up, and an off-canvas drawer below it, opened by the burger in the
// mobile top bar. Keeping it a single element (rather than one tree per
// breakpoint) means the links exist once in the DOM and in the a11y tree.
export function NavBar() {
  const { t } = useI18n()
  const { user, logout } = useAuth()
  const [menuOpen, setMenuOpen] = useState(false)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const userRef = useRef<HTMLDivElement>(null)
  const { pathname } = useLocation()

  // Surface invitations addressed to this user as a badge on the Family link.
  const { data: invitations } = useQuery({
    queryKey: ['my-invitations'],
    queryFn: getMyInvitations,
  })
  const pendingInvites = invitations?.length ?? 0

  // Likewise for shared-contract invitations, badged on the Nannies link.
  const { data: contractInvitations } = useQuery({
    queryKey: ['my-contract-invitations'],
    queryFn: getMyContractInvitations,
  })
  const pendingContractInvites = contractInvitations?.length ?? 0

  const displayName = user?.first_name || user?.email || ''

  // Following a link on mobile should reveal the page it led to, not leave the
  // drawer sitting over it. This covers programmatic navigation too, which an
  // onClick on the links would miss.
  // biome-ignore lint/correctness/useExhaustiveDependencies: pathname is what the effect watches for, not a value it reads
  useEffect(() => {
    setDrawerOpen(false)
  }, [pathname])

  // The drawer overlays the page on mobile; let it scroll on its own.
  useEffect(() => {
    if (!drawerOpen) return
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previous
    }
  }, [drawerOpen])

  // Escape dismisses whichever of the two is open; closing one already closed is
  // a no-op, so this needs no per-overlay listener.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      setMenuOpen(false)
      setDrawerOpen(false)
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [])

  // Close the account menu on an outside click.
  useEffect(() => {
    if (!menuOpen) return
    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node
      // The appearance Selects live in this menu but portal their dropdown to
      // <body>; clicking an option must not read as an outside click.
      if (
        target instanceof Element &&
        target.closest('[data-slot="select-content"]')
      ) {
        return
      }
      if (userRef.current && !userRef.current.contains(target)) {
        setMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', onPointerDown)
    return () => document.removeEventListener('mousedown', onPointerDown)
  }, [menuOpen])

  return (
    <>
      {/* Page header (brand guide p.9): 64px tall, sticky, 1px bottom border,
          no shadow, 16px horizontal padding on mobile. */}
      <header className="sticky top-0 z-30 flex h-16 items-center gap-2 border-b bg-background px-4 md:hidden">
        <Button
          variant="ghost"
          size="icon"
          aria-label={t('nav.openMenu')}
          aria-expanded={drawerOpen}
          aria-controls="primary-nav"
          onClick={() => setDrawerOpen(true)}
        >
          <Menu size={20} aria-hidden="true" />
        </Button>
        <BrandLockup className="text-base" />
      </header>

      {/* Backdrop: tapping beside the drawer dismisses it. Inert on desktop,
          where the nav is part of the layout rather than an overlay. */}
      {drawerOpen && (
        <button
          type="button"
          tabIndex={-1}
          aria-hidden="true"
          className="fixed inset-0 z-40 bg-foreground/40 md:hidden"
          onClick={() => setDrawerOpen(false)}
        />
      )}

      <nav
        id="primary-nav"
        className={cn(
          'fixed inset-y-0 left-0 z-50 flex w-72 shrink-0 flex-col gap-1 overflow-y-auto border-r bg-background p-3 transition-transform duration-200',
          // From md up the drawer machinery is inert: always in flow, always on screen.
          'md:static md:z-auto md:w-48 md:translate-x-0 md:visible md:transition-none lg:w-56',
          drawerOpen ? 'translate-x-0' : 'invisible -translate-x-full',
        )}
        aria-label={t('nav.primary')}
      >
        <div className="flex items-center gap-2.5 px-2.5 pt-2 pb-4">
          <BrandLockup iconSize={24} className="text-lg" />
          <Button
            variant="ghost"
            size="icon"
            className="ml-auto md:hidden"
            aria-label={t('nav.closeMenu')}
            onClick={() => setDrawerOpen(false)}
          >
            <X size={20} aria-hidden="true" />
          </Button>
        </div>
        <ul className="flex flex-col gap-1">
          <li>
            <NavLink to="/dashboard" end className={linkClass}>
              <HomeIcon size={18} aria-hidden="true" />
              {t('nav.home')}
            </NavLink>
          </li>
          <li>
            <NavLink to="/planning" className={linkClass}>
              <CalendarDays size={18} aria-hidden="true" />
              {t('nav.planning')}
            </NavLink>
          </li>
          <li>
            <NavLink to="/declarations" className={linkClass}>
              <FileText size={18} aria-hidden="true" />
              {t('nav.declarations')}
            </NavLink>
          </li>
          <li>
            <NavLink to="/nannies" className={linkClass}>
              <Users size={18} aria-hidden="true" />
              {t('nav.nannies')}
              {pendingContractInvites > 0 && (
                <span
                  role="status"
                  className={badgeClass}
                  aria-label={t('nav.nanniesPending')}
                >
                  {pendingContractInvites}
                </span>
              )}
            </NavLink>
          </li>
          <li>
            <NavLink to="/family" className={linkClass}>
              <UsersRound size={18} aria-hidden="true" />
              {t('nav.family')}
              {pendingInvites > 0 && (
                <span
                  role="status"
                  className={badgeClass}
                  aria-label={t('nav.familyPending')}
                >
                  {pendingInvites}
                </span>
              )}
            </NavLink>
          </li>
          <li>
            <NavLink to="/settings" className={linkClass}>
              <Settings size={18} aria-hidden="true" />
              {t('nav.settings')}
            </NavLink>
          </li>
        </ul>
        <div className="relative mt-auto" ref={userRef}>
          {menuOpen && (
            <div
              className="absolute right-0 bottom-[calc(100%+8px)] left-0 flex flex-col gap-2.5 rounded-xl border bg-popover p-3 shadow-md"
              role="menu"
            >
              <AppearanceControls />
              <Button
                variant="destructive"
                role="menuitem"
                className="w-full justify-center"
                onClick={logout}
              >
                {t('home.logout')}
              </Button>
            </div>
          )}
          <button
            type="button"
            className="flex w-full items-center justify-between gap-2 rounded-lg border px-3 py-2 text-sm text-foreground transition-colors hover:bg-muted"
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            aria-label={t('nav.account')}
            onClick={() => setMenuOpen((open) => !open)}
          >
            <span className="flex min-w-0 items-center gap-2">
              <PersonAvatar name={displayName} size="sm" />
              <span className="truncate">{displayName}</span>
            </span>
            <ChevronUp size={16} aria-hidden="true" />
          </button>
        </div>
      </nav>
    </>
  )
}
