import { useQuery } from '@tanstack/react-query'
import {
  Baby,
  ChevronUp,
  HomeIcon,
  Settings,
  Users,
  UsersRound,
} from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { NavLink } from 'react-router-dom'
import { getMyContractInvitations } from '../api/contracts'
import { getMyInvitations } from '../api/family'
import { useAuth } from '../auth/AuthContext'
import { useI18n } from '../i18n/I18nContext'
import { AppearanceControls } from './AppearanceControls'
import { Button } from './ui/button'

const linkClass = ({ isActive }: { isActive: boolean }) =>
  [
    'flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors',
    isActive
      ? 'bg-primary/10 text-primary'
      : 'text-muted-foreground hover:bg-muted hover:text-foreground',
  ].join(' ')

// Left sidebar shown on authenticated views: primary navigation plus an account
// menu (appearance controls + logout) anchored to the bottom.
export function NavBar() {
  const { t } = useI18n()
  const { user, logout } = useAuth()
  const [menuOpen, setMenuOpen] = useState(false)
  const userRef = useRef<HTMLDivElement>(null)

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

  // Close the account menu on an outside click or Escape.
  useEffect(() => {
    if (!menuOpen) return
    const onPointerDown = (event: MouseEvent) => {
      if (userRef.current && !userRef.current.contains(event.target as Node)) {
        setMenuOpen(false)
      }
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMenuOpen(false)
    }
    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [menuOpen])

  return (
    <nav
      className="flex w-56 shrink-0 flex-col gap-1 border-r bg-background p-3 max-[1024px]:w-48"
      aria-label={t('nav.primary')}
    >
      <div className="flex items-center gap-2.5 px-2.5 pt-2 pb-4 font-heading text-lg font-semibold text-foreground">
        <Baby size={24} aria-hidden="true" />
        <span>Nounou</span>
      </div>
      <ul className="flex flex-col gap-1">
        <li>
          <NavLink to="/" end className={linkClass}>
            <HomeIcon size={18} aria-hidden="true" />
            {t('nav.home')}
          </NavLink>
        </li>
        <li>
          <NavLink to="/nannies" className={linkClass}>
            <Users size={18} aria-hidden="true" />
            {t('nav.nannies')}
            {pendingContractInvites > 0 && (
              <span
                role="status"
                className="ml-auto flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-xs font-medium text-primary-foreground"
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
                className="ml-auto flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-xs font-medium text-primary-foreground"
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
          <span className="truncate">{displayName}</span>
          <ChevronUp size={16} aria-hidden="true" />
        </button>
      </div>
    </nav>
  )
}
