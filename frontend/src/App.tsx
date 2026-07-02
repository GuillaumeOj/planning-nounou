import type { ReactNode } from 'react'
import { Navigate, Outlet, Route, Routes } from 'react-router-dom'
import { ProtectedRoute } from './auth/ProtectedRoute'
import { NavBar } from './components/NavBar'
import { SettingsBar } from './components/SettingsBar'
import Home from './pages/Home'
import LoginPage from './pages/LoginPage'
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
      <div className="app-shell">
        <NavBar />
        <div className="app-content">
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
      <Route element={<AppLayout />}>
        <Route path="/" element={<Home />} />
        <Route path="/settings" element={<SettingsPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export default App
