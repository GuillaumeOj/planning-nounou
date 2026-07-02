import { useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { AuthForm } from '../components/AuthForm'

export default function LoginPage() {
  const { login } = useAuth()
  const navigate = useNavigate()

  return (
    <AuthForm
      variant="login"
      onSubmit={async (credentials) => {
        await login(credentials)
        navigate('/')
      }}
    />
  )
}
