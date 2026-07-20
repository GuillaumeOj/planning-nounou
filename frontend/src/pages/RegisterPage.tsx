import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/src/auth/AuthContext'
import { AuthForm } from '@/src/components/AuthForm'

export default function RegisterPage() {
  const { register } = useAuth()
  const navigate = useNavigate()

  return (
    <AuthForm
      variant="register"
      onSubmit={async (credentials) => {
        await register(credentials)
        navigate('/dashboard')
      }}
    />
  )
}
