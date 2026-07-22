import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import {
  useContractInvitationsAcceptCreateMutation,
  useContractInvitationsDeclineCreateMutation,
  useContractInvitationsRetrieveQuery,
  useFamiliesListQuery,
} from '@/src/api'
import { extractErrorMessages } from '@/src/api/errors'
import { useAuth } from '@/src/auth/AuthContext'
import { FormErrors } from '@/src/components/FormErrors'
import { Button } from '@/src/components/ui/button'
import { Card, CardContent } from '@/src/components/ui/card'
import { RadioGroup, RadioGroupItem } from '@/src/components/ui/radio-group'
import { useI18n } from '@/src/i18n/I18nContext'
import { canManageFamily } from '@/src/lib/family'

// Landing page for a contract-share invitation link (the email points here). Public,
// so it renders for a signed-out invitee too: they see who invited them, then get
// funnelled through login/register (carrying ?next=) before choosing which of their
// families to attach — the accept call needs a family, so it always requires auth.
export default function ContractInvitePage() {
  const { t } = useI18n()
  const { token = '' } = useParams()
  const { isAuthenticated } = useAuth()

  const { data, isLoading, isError } = useContractInvitationsRetrieveQuery({
    token,
  })

  const nannyName = data
    ? `${data.nanny_first_name} ${data.nanny_last_name}`.trim()
    : ''

  return (
    <main className="flex flex-1 items-center justify-center p-4 sm:p-6">
      <Card className="w-full max-w-md">
        <CardContent className="flex flex-col gap-6">
          {isLoading ? (
            <p className="text-sm text-muted-foreground">
              {t('contractInvite.loading')}
            </p>
          ) : isError || !data || data.status !== 'pending' ? (
            <>
              <p className="text-sm text-destructive" role="alert">
                {t('contractInvite.invalid')}
              </p>
              <Link
                to="/nannies"
                className="text-sm text-primary hover:underline"
              >
                {t('contractInvite.goToNannies')}
              </Link>
            </>
          ) : (
            <>
              <div className="flex flex-col gap-2">
                <h1 className="text-2xl font-semibold tracking-tight">
                  {t('contractInvite.title')}
                </h1>
                <p className="text-sm text-muted-foreground">
                  {t('contractInvite.intro')}{' '}
                  <strong className="text-foreground">{nannyName}</strong>.
                </p>
              </div>
              {isAuthenticated ? (
                <RespondActions token={token} />
              ) : (
                <SignInPrompt token={token} />
              )}
            </>
          )}
        </CardContent>
      </Card>
    </main>
  )
}

// Signed-out branch: send the invitee to register or log in, carrying the invite as
// ?next= so they come back here to finish once authenticated.
function SignInPrompt({ token }: { token: string }) {
  const { t } = useI18n()
  const next = encodeURIComponent(`/contract-invite/${token}`)

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted-foreground">
        {t('contractInvite.authPrompt')}
      </p>
      <div className="flex flex-col gap-2">
        <Button asChild>
          <Link to={`/register?next=${next}`}>
            {t('contractInvite.register')}
          </Link>
        </Button>
        <Button variant="outline" asChild>
          <Link to={`/login?next=${next}`}>{t('contractInvite.login')}</Link>
        </Button>
      </div>
    </div>
  )
}

// Signed-in branch: pick one of the families the user manages, then accept (attaching
// it to the contract) or decline.
function RespondActions({ token }: { token: string }) {
  const { t } = useI18n()
  const navigate = useNavigate()
  const [errors, setErrors] = useState<string[]>([])
  const [chosen, setChosen] = useState('')
  const [done, setDone] = useState<'accepted' | 'declined' | null>(null)
  const [busy, setBusy] = useState<'accept' | 'decline' | null>(null)
  const [acceptContractInvitation] =
    useContractInvitationsAcceptCreateMutation()
  const [declineContractInvitation] =
    useContractInvitationsDeclineCreateMutation()

  const {
    data: families,
    isLoading,
    isError: familiesError,
  } = useFamiliesListQuery()
  // Only families the user owns (or an unclaimed one they created) can be attached.
  const manageable = (families ?? []).filter(canManageFamily)
  // Default to the first manageable family until the user picks another.
  const familyId = chosen || manageable[0]?.id || ''

  const accept = async () => {
    setErrors([])
    setBusy('accept')
    try {
      // The attached family now shares the contract; RTK Query tags refetch the
      // affected family-scoped and contract-invitation queries automatically.
      await acceptContractInvitation({
        token,
        acceptContractInvitationRequestRequest: { family_id: familyId },
      }).unwrap()
      setDone('accepted')
    } catch (err) {
      setErrors(extractErrorMessages(err, t('contractInvite.error')))
    } finally {
      setBusy(null)
    }
  }

  const decline = async () => {
    setErrors([])
    setBusy('decline')
    try {
      await declineContractInvitation({ token }).unwrap()
      setDone('declined')
    } catch (err) {
      setErrors(extractErrorMessages(err, t('contractInvite.error')))
    } finally {
      setBusy(null)
    }
  }

  if (done === 'accepted') {
    return (
      <div className="flex flex-col gap-4">
        <p
          className="text-sm text-emerald-600 dark:text-emerald-400"
          role="status"
        >
          {t('contractInvite.accepted')}
        </p>
        <Button type="button" onClick={() => navigate('/nannies')}>
          {t('contractInvite.goToNannies')}
        </Button>
      </div>
    )
  }
  if (done === 'declined') {
    return (
      <p className="text-sm text-muted-foreground" role="status">
        {t('contractInvite.declined')}
      </p>
    )
  }

  if (isLoading) {
    return (
      <p className="text-sm text-muted-foreground">
        {t('contractInvite.loadingFamilies')}
      </p>
    )
  }

  // A fetch failure must not masquerade as "you have no family" (which would wrongly
  // push the user to create a duplicate) — surface it as an error instead.
  if (familiesError) {
    return (
      <p className="text-sm text-destructive" role="alert">
        {t('contractInvite.error')}
      </p>
    )
  }

  // A contract must attach to a family, so a user without one has to create it first.
  if (manageable.length === 0) {
    return (
      <div className="flex flex-col gap-4">
        <p className="text-sm text-muted-foreground">
          {t('contractInvite.noFamily')}
        </p>
        <Button type="button" onClick={() => navigate('/family')}>
          {t('contractInvite.createFamily')}
        </Button>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <FormErrors messages={errors} />
      {manageable.length > 1 ? (
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 text-sm font-medium">
            {t('contractInvite.chooseFamily')}
          </legend>
          <RadioGroup value={familyId} onValueChange={setChosen}>
            {manageable.map((family) => (
              <label
                key={family.id}
                className="flex items-center gap-2 text-sm"
              >
                <RadioGroupItem value={family.id} />
                {family.name}
              </label>
            ))}
          </RadioGroup>
        </fieldset>
      ) : (
        <p className="text-sm text-muted-foreground">
          {t('contractInvite.attachTo')}{' '}
          <strong className="text-foreground">{manageable[0].name}</strong>.
        </p>
      )}
      <div className="flex gap-2">
        <Button
          type="button"
          onClick={accept}
          disabled={busy !== null || !familyId}
        >
          {busy === 'accept'
            ? t('contractInvite.accepting')
            : t('contractInvite.accept')}
        </Button>
        <Button
          variant="outline"
          type="button"
          onClick={decline}
          disabled={busy !== null}
        >
          {busy === 'decline'
            ? t('contractInvite.declining')
            : t('contractInvite.decline')}
        </Button>
      </div>
    </div>
  )
}
