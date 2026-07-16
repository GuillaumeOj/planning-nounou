import { useForm } from '@tanstack/react-form'
import { useCallback, useState } from 'react'
import { changeEmail, changePassword, updateProfile } from '@/src/api/auth'
import { extractErrorMessages } from '@/src/api/errors'
import { useAuth } from '@/src/auth/AuthContext'
import { FormErrors } from '@/src/components/FormErrors'
import { Modal } from '@/src/components/Modal'
import { SectionCard } from '@/src/components/SectionCard'
import { TextField } from '@/src/components/TextField'
import { Button } from '@/src/components/ui/button'
import { Input } from '@/src/components/ui/input'
import { Label } from '@/src/components/ui/label'
import { useI18n } from '@/src/i18n/I18nContext'
import type { TranslationKey } from '@/src/i18n/translations'

export default function SettingsPage() {
  const { t } = useI18n()

  return (
    <main className="flex flex-1 flex-col gap-6 p-4 sm:p-10">
      <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
        {t('settings.title')}
      </h1>
      <div className="flex w-full max-w-xl flex-col gap-6">
        <ProfileSection />
        <EmailSection />
        <PasswordSection />
      </div>
    </main>
  )
}

// A form section that shows errors on failure and a success line on success.
function useSectionStatus() {
  const [errors, setErrors] = useState<string[]>([])
  const [success, setSuccess] = useState(false)
  return { errors, setErrors, success, setSuccess }
}

function SuccessNote({ messageKey }: { messageKey: TranslationKey }) {
  const { t } = useI18n()
  return (
    <p className="text-sm text-emerald-600 dark:text-emerald-400" role="status">
      {t(messageKey)}
    </p>
  )
}

function ProfileSection() {
  const { t } = useI18n()
  const { user, refreshUser } = useAuth()
  const { errors, setErrors, success, setSuccess } = useSectionStatus()

  const form = useForm({
    defaultValues: {
      first_name: user?.first_name ?? '',
      last_name: user?.last_name ?? '',
    },
    onSubmit: async ({ value }) => {
      setErrors([])
      setSuccess(false)
      try {
        await refreshUser(await updateProfile(value))
        setSuccess(true)
      } catch (err) {
        setErrors(extractErrorMessages(err, t('settings.profile.error')))
      }
    },
  })

  return (
    <SectionCard
      title={t('settings.profile.title')}
      description={t('settings.profile.description')}
    >
      <form
        className="flex flex-col gap-4"
        onSubmit={(event) => {
          event.preventDefault()
          event.stopPropagation()
          form.handleSubmit()
        }}
      >
        <form.Field name="first_name">
          {(field) => (
            <TextField
              field={field}
              id="profile-first-name"
              label={t('settings.profile.firstName')}
              autoComplete="given-name"
            />
          )}
        </form.Field>
        <form.Field name="last_name">
          {(field) => (
            <TextField
              field={field}
              id="profile-last-name"
              label={t('settings.profile.lastName')}
              autoComplete="family-name"
            />
          )}
        </form.Field>
        <FormErrors messages={errors} />
        {success && <SuccessNote messageKey="settings.profile.saved" />}
        <form.Subscribe selector={(state) => state.isSubmitting}>
          {(isSubmitting) => (
            <Button
              type="submit"
              className="self-start"
              disabled={isSubmitting}
            >
              {isSubmitting
                ? t('settings.profile.saving')
                : t('settings.profile.save')}
            </Button>
          )}
        </form.Subscribe>
      </form>
    </SectionCard>
  )
}

function EmailSection() {
  const { t } = useI18n()
  const { user, refreshUser } = useAuth()
  const { errors, setErrors, success, setSuccess } = useSectionStatus()
  const [newEmail, setNewEmail] = useState('')
  const [password, setPassword] = useState('')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  const openDialog = (event: React.FormEvent) => {
    event.preventDefault()
    setErrors([])
    setSuccess(false)
    setPassword('')
    setDialogOpen(true)
  }

  const closeDialog = useCallback(() => setDialogOpen(false), [])

  const confirm = async (event: React.FormEvent) => {
    event.preventDefault()
    setErrors([])
    setSubmitting(true)
    try {
      await refreshUser(
        await changeEmail({ current_password: password, email: newEmail }),
      )
      setDialogOpen(false)
      setNewEmail('')
      setPassword('')
      setSuccess(true)
    } catch (err) {
      setErrors(extractErrorMessages(err, t('settings.email.error')))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <SectionCard title={t('settings.email.title')}>
      <p className="text-sm text-muted-foreground">{user?.email}</p>
      <form className="flex flex-col gap-4" onSubmit={openDialog}>
        <div className="flex flex-col gap-2">
          <Label htmlFor="new-email">{t('settings.email.new')}</Label>
          <Input
            id="new-email"
            type="email"
            value={newEmail}
            onChange={(event) => setNewEmail(event.target.value)}
            autoComplete="email"
            required
          />
        </div>
        {success && <SuccessNote messageKey="settings.email.saved" />}
        <Button type="submit" className="self-start">
          {t('settings.email.save')}
        </Button>
      </form>
      {dialogOpen && (
        <Modal title={t('settings.email.dialogTitle')} onClose={closeDialog}>
          <p className="text-sm text-muted-foreground">
            {t('settings.email.dialogHint')}
          </p>
          <form className="flex flex-col gap-4" onSubmit={confirm}>
            <div className="flex flex-col gap-2">
              <Label htmlFor="confirm-password">
                {t('settings.currentPassword')}
              </Label>
              <Input
                id="confirm-password"
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                autoComplete="current-password"
                required
              />
            </div>
            <FormErrors messages={errors} />
            <div className="flex justify-end gap-2">
              <Button variant="outline" type="button" onClick={closeDialog}>
                {t('common.cancel')}
              </Button>
              <Button type="submit" disabled={submitting}>
                {submitting
                  ? t('settings.email.saving')
                  : t('settings.email.confirm')}
              </Button>
            </div>
          </form>
        </Modal>
      )}
    </SectionCard>
  )
}

function PasswordSection() {
  const { t } = useI18n()
  const { errors, setErrors, success, setSuccess } = useSectionStatus()

  const form = useForm({
    defaultValues: { current_password: '', new_password: '' },
    onSubmit: async ({ value }) => {
      setErrors([])
      setSuccess(false)
      try {
        await changePassword(value)
        setSuccess(true)
        form.reset()
      } catch (err) {
        setErrors(extractErrorMessages(err, t('settings.password.error')))
      }
    },
  })

  return (
    <SectionCard title={t('settings.password.title')}>
      <form
        className="flex flex-col gap-4"
        onSubmit={(event) => {
          event.preventDefault()
          event.stopPropagation()
          form.handleSubmit()
        }}
      >
        <form.Field name="current_password">
          {(field) => (
            <TextField
              field={field}
              id="current-password"
              label={t('settings.currentPassword')}
              type="password"
              autoComplete="current-password"
              required
            />
          )}
        </form.Field>
        <form.Field name="new_password">
          {(field) => (
            <TextField
              field={field}
              id="new-password"
              label={t('settings.password.new')}
              type="password"
              autoComplete="new-password"
              required
            />
          )}
        </form.Field>
        <FormErrors messages={errors} />
        {success && <SuccessNote messageKey="settings.password.saved" />}
        <form.Subscribe selector={(state) => state.isSubmitting}>
          {(isSubmitting) => (
            <Button
              type="submit"
              className="self-start"
              disabled={isSubmitting}
            >
              {isSubmitting
                ? t('settings.password.saving')
                : t('settings.password.save')}
            </Button>
          )}
        </form.Subscribe>
      </form>
    </SectionCard>
  )
}
