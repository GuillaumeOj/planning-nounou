import type { ReactNode } from 'react'
import { Navigate, Outlet, Route, Routes } from 'react-router-dom'
import { ProtectedRoute } from './auth/ProtectedRoute'
import { NavBar } from './components/NavBar'
import { SettingsBar } from './components/SettingsBar'
import Family from './pages/Family'
import Home from './pages/Home'
import InvitePage from './pages/InvitePage'
import LoginPage from './pages/LoginPage'
import Nannies from './pages/Nannies'
import Planning from './pages/Planning'
import RegisterPage from './pages/RegisterPage'
import SettingsPage from './pages/SettingsPage'

// Auth pages have no navbar; the appearance controls live in a small top bar.
function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <SettingsBar />
      {children}
    </>
  )
}

// Authenticated shell: left navbar beside the routed page content.
function AppLayout() {
  return (
    <ProtectedRoute>
      <div className="flex min-h-0 flex-1 items-stretch">
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
        <Route path="/family" element={<Family />} />
        <Route path="/settings" element={<SettingsPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export default App
