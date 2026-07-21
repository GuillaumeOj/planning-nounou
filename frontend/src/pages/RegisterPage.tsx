import { useState } from 'react'
import { useAuth } from '@/src/auth/AuthContext'
import { AuthForm } from '@/src/components/AuthForm'
import { VerifyEmailNotice } from '@/src/components/VerifyEmailNotice'

export default function RegisterPage() {
  const { register } = useAuth()
  // After a successful signup the account is inactive: show the "check your
  // email" step instead of navigating into the app.
  const [registeredEmail, setRegisteredEmail] = useState<string | null>(null)

  if (registeredEmail) {
    return <VerifyEmailNotice email={registeredEmail} />
  }

  return (
    <AuthForm
      variant="register"
      onSubmit={async (credentials) => {
        await register(credentials)
        setRegisteredEmail(credentials.email)
      }}
    />
  )
}
