import { useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { AuthForm } from '../components/AuthForm'

export default function RegisterPage() {
  const { register } = useAuth()
  const navigate = useNavigate()

  return (
    <AuthForm
      variant="register"
      onSubmit={async (credentials) => {
        await register(credentials)
        navigate('/')
      }}
    />
  )
}
