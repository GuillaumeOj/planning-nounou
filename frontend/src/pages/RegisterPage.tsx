import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useAuth } from '@/src/auth/AuthContext'
import { AuthForm } from '@/src/components/AuthForm'
import { VerifyEmailNotice } from '@/src/components/VerifyEmailNotice'
import { resolveNext } from '@/src/lib/nextParam'

export default function RegisterPage() {
  const { register } = useAuth()
  const [searchParams] = useSearchParams()
  // After a successful signup the account is inactive: show the "check your
  // email" step instead of navigating into the app.
  const [registeredEmail, setRegisteredEmail] = useState<string | null>(null)

  if (registeredEmail) {
    // Carry any post-auth target (e.g. a contract invite) through the verify
    // step so the "back to login" link returns the user there once they log in.
    const next = resolveNext(searchParams.get('next'), '')
    return (
      <VerifyEmailNotice email={registeredEmail} next={next || undefined} />
    )
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
