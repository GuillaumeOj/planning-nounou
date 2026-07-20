import type { ReactNode } from 'react'
import { Navigate, Outlet, Route, Routes } from 'react-router-dom'
import { ProtectedRoute } from '@/src/auth/ProtectedRoute'
import { RedirectAuthenticated } from '@/src/auth/RedirectAuthenticated'
import { PublicLayout } from '@/src/components/landing/PublicLayout'
import { NavBar } from '@/src/components/NavBar'
import { SettingsBar } from '@/src/components/SettingsBar'
import Declarations from '@/src/pages/Declarations'
import Family from '@/src/pages/Family'
import Features from '@/src/pages/Features'
import Home from '@/src/pages/Home'
import InvitePage from '@/src/pages/InvitePage'
import Landing from '@/src/pages/Landing'
import LegalNotice from '@/src/pages/LegalNotice'
import LoginPage from '@/src/pages/LoginPage'
import Nannies from '@/src/pages/Nannies'
import Planning from '@/src/pages/Planning'
import Pricing from '@/src/pages/Pricing'
import Privacy from '@/src/pages/Privacy'
import RegisterPage from '@/src/pages/RegisterPage'
import SettingsPage from '@/src/pages/SettingsPage'

// Auth pages have no navbar; the appearance controls live in a small top bar.
function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <SettingsBar />
      {children}
    </>
  )
}

// Authenticated shell. From md up the navbar is a sidebar beside the routed
// page; below that it collapses to a top bar and the page takes the full width.
function AppLayout() {
  return (
    <ProtectedRoute>
      <div className="flex min-h-0 flex-1 flex-col md:flex-row">
        <NavBar />
        {/* The routed page is capped at the brand guide's 1120px main width and
            centred in the space beside the sidebar; each page keeps its own
            padding. */}
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="mx-auto flex w-full max-w-[1120px] flex-1 flex-col">
            <Outlet />
          </div>
        </div>
      </div>
    </ProtectedRoute>
  )
}

function App() {
  return (
    <Routes>
      <Route
        path="/login"
        element={
          <AuthLayout>
            <LoginPage />
          </AuthLayout>
        }
      />
      <Route
        path="/register"
        element={
          <AuthLayout>
            <RegisterPage />
          </AuthLayout>
        }
      />
      {/* Invitation landing: works signed in (accept) or signed out (claim). */}
      <Route
        path="/invite/:token"
        element={
          <AuthLayout>
            <InvitePage />
          </AuthLayout>
        }
      />
      {/* Public marketing surface. The landing owns "/"; a signed-in visitor is
          sent on to their dashboard. The features page stays public for all. */}
      <Route element={<PublicLayout />}>
        <Route
          path="/"
          element={
            <RedirectAuthenticated>
              <Landing />
            </RedirectAuthenticated>
          }
        />
        <Route path="/features" element={<Features />} />
        <Route path="/pricing" element={<Pricing />} />
        <Route path="/privacy" element={<Privacy />} />
        <Route path="/legal" element={<LegalNotice />} />
      </Route>
      <Route element={<AppLayout />}>
        <Route path="/dashboard" element={<Home />} />
        <Route path="/planning" element={<Planning />} />
        <Route path="/declarations" element={<Declarations />} />
        <Route path="/nannies" element={<Nannies />} />
        {/* Days off became a Planning tab; keep the old address working. */}
        <Route path="/leaves" element={<Navigate to="/planning" replace />} />
        <Route path="/family" element={<Family />} />
        <Route path="/settings" element={<SettingsPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  )
}

export default App
