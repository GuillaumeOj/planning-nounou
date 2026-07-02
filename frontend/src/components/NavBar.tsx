import { Baby, ChevronUp, HomeIcon, Settings } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { NavLink } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { useI18n } from '../i18n/I18nContext'
import { AppearanceControls } from './AppearanceControls'

const linkClass = ({ isActive }: { isActive: boolean }) =>
  isActive ? 'nav-link active' : 'nav-link'

// Left sidebar shown on authenticated views: primary navigation plus an account
// menu (appearance controls + logout) anchored to the bottom.
export function NavBar() {
  const { t } = useI18n()
  const { user, logout } = useAuth()
  const [menuOpen, setMenuOpen] = useState(false)
  const userRef = useRef<HTMLDivElement>(null)

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
    <nav className="navbar" aria-label={t('nav.primary')}>
      <div className="navbar-brand">
        <Baby size={24} aria-hidden="true" />
        <span>Nounou</span>
      </div>
      <ul className="navbar-links">
        <li>
          <NavLink to="/" end className={linkClass}>
            <HomeIcon size={18} aria-hidden="true" />
            {t('nav.home')}
          </NavLink>
        </li>
        <li>
          <NavLink to="/settings" className={linkClass}>
            <Settings size={18} aria-hidden="true" />
            {t('nav.settings')}
          </NavLink>
        </li>
      </ul>
      <div className="navbar-user" ref={userRef}>
        {menuOpen && (
          <div className="navbar-menu" role="menu">
            <AppearanceControls />
            <button
              className="btn btn-ghost navbar-logout"
              type="button"
              role="menuitem"
              onClick={logout}
            >
              {t('home.logout')}
            </button>
          </div>
        )}
        <button
          className="navbar-user-button"
          type="button"
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          aria-label={t('nav.account')}
          onClick={() => setMenuOpen((open) => !open)}
        >
          <span className="navbar-user-name">{displayName}</span>
          <ChevronUp size={16} aria-hidden="true" />
        </button>
      </div>
    </nav>
  )
}
