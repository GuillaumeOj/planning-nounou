import { Navigate, Outlet, Route, Routes } from 'react-router-dom'
import { ProtectedRoute } from '@/src/auth/ProtectedRoute'
import { RedirectAuthenticated } from '@/src/auth/RedirectAuthenticated'
import { PublicLayout } from '@/src/components/landing/PublicLayout'
import { NavBar } from '@/src/components/NavBar'
import { SettingsBar } from '@/src/components/SettingsBar'
import ActivatePage from '@/src/pages/ActivatePage'
import ContractInvitePage from '@/src/pages/ContractInvitePage'
import Declarations from '@/src/pages/Declarations'
import Family from '@/src/pages/Family'
import Features from '@/src/pages/Features'
import ForgotPasswordPage from '@/src/pages/ForgotPasswordPage'
import HelpArticle from '@/src/pages/HelpArticle'
import HelpCenter from '@/src/pages/HelpCenter'
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
import ResetPasswordPage from '@/src/pages/ResetPasswordPage'
import SettingsPage from '@/src/pages/SettingsPage'
import Simulation from '@/src/pages/Simulation'

// Auth pages have no navbar; the appearance controls live in a small top bar.
// A layout route (like AppLayout) so each auth page renders through the shared
// SettingsBar without hand-wrapping.
function AuthLayout() {
  return (
    <>
      <SettingsBar />
      <Outlet />
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
      {/* Auth pages (no navbar, just the appearance controls). */}
      <Route element={<AuthLayout />}>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        {/* Password reset request + confirmation (links come from the reset email). */}
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />
        <Route
          path="/reset-password/:uid/:token"
          element={<ResetPasswordPage />}
        />
        {/* Email verification landing (link comes from the activation email). */}
        <Route path="/activate/:uid/:token" element={<ActivatePage />} />
        {/* Invitation landing: works signed in (accept) or signed out (claim). */}
        <Route path="/invite/:token" element={<InvitePage />} />
        {/* Contract-share invitation landing. Signed out, it funnels the invitee
            through auth (?next=) before they attach one of their families. */}
        <Route
          path="/contract-invite/:token"
          element={<ContractInvitePage />}
        />
      </Route>
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
        {/* Help center: a crawlable index and one page per article. Public so
            the guides serve SEO; the same URLs are reached from the dashboard. */}
        <Route path="/help" element={<HelpCenter />} />
        <Route path="/help/:slug" element={<HelpArticle />} />
        <Route path="/privacy" element={<Privacy />} />
        <Route path="/legal" element={<LegalNotice />} />
      </Route>
      <Route element={<AppLayout />}>
        <Route path="/dashboard" element={<Home />} />
        <Route path="/simulation" element={<Simulation />} />
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
