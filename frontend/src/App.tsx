import type { ReactNode } from 'react'
import { Navigate, Outlet, Route, Routes } from 'react-router-dom'
import { ProtectedRoute } from '@/src/auth/ProtectedRoute'
import { NavBar } from '@/src/components/NavBar'
import { SettingsBar } from '@/src/components/SettingsBar'
import Family from '@/src/pages/Family'
import Home from '@/src/pages/Home'
import InvitePage from '@/src/pages/InvitePage'
import Leaves from '@/src/pages/Leaves'
import LoginPage from '@/src/pages/LoginPage'
import Nannies from '@/src/pages/Nannies'
import Planning from '@/src/pages/Planning'
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
        <div className="flex min-w-0 flex-1 flex-col">
          <Outlet />
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
      <Route element={<AppLayout />}>
        <Route path="/" element={<Home />} />
        <Route path="/planning" element={<Planning />} />
        <Route path="/nannies" element={<Nannies />} />
        <Route path="/leaves" element={<Leaves />} />
        <Route path="/family" element={<Family />} />
        <Route path="/settings" element={<SettingsPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export default App
