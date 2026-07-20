import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/src/auth/AuthContext'
import { AuthForm } from '@/src/components/AuthForm'

export default function LoginPage() {
  const { login } = useAuth()
  const navigate = useNavigate()

  return (
    <AuthForm
      variant="login"
      onSubmit={async (credentials) => {
        await login(credentials)
        navigate('/dashboard')
      }}
    />
  )
}
