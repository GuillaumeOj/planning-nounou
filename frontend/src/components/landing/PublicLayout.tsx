import { Outlet } from 'react-router-dom'
import { PublicFooter } from '@/src/components/landing/PublicFooter'
import { PublicHeader } from '@/src/components/landing/PublicHeader'

// The shell for the public marketing routes ("/" and "/features"): a shared
// header and footer around the routed page. Kept outside ProtectedRoute so
// anonymous visitors can read it.
export function PublicLayout() {
  return (
    <div className="flex min-h-svh flex-col overflow-x-clip bg-background text-foreground">
      <PublicHeader />
      <main className="flex-1">
        <Outlet />
      </main>
      <PublicFooter />
    </div>
  )
}
