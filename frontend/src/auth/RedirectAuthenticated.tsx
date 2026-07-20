import type { ReactNode } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '@/src/auth/AuthContext'
import { getAccessToken } from '@/src/auth/tokenStorage'

// The mirror of ProtectedRoute for public marketing pages: a signed-in visitor
// hitting the landing is sent to their dashboard rather than shown the pitch.
// There is no loop, since /dashboard is behind ProtectedRoute which sends
// signed-out visitors to /login.
export function RedirectAuthenticated({ children }: { children: ReactNode }) {
  const { isAuthenticated, isLoading } = useAuth()

  if (isLoading) {
    // Auth is still resolving. If a token is stored the visitor is probably
    // signed in and about to be redirected, so don't paint the whole marketing
    // page just to bounce it; render nothing until it resolves. With no token
    // it's an anonymous visitor — show the landing straight away.
    return getAccessToken() ? null : children
  }

  if (isAuthenticated) {
    return <Navigate to="/dashboard" replace />
  }

  return <>{children}</>
}
