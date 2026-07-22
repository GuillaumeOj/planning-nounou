import { useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '@/src/auth/AuthContext'
import { AuthForm } from '@/src/components/AuthForm'
import { resolveNext } from '@/src/lib/nextParam'

export default function LoginPage() {
  const { login } = useAuth()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()

  return (
    <AuthForm
      variant="login"
      onSubmit={async (credentials) => {
        await login(credentials)
        // Return to the page that sent the user here (e.g. a contract invite),
        // defaulting to the dashboard. resolveNext blocks off-site redirects.
        navigate(resolveNext(searchParams.get('next'), '/dashboard'))
      }}
    />
  )
}
