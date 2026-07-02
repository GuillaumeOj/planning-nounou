import { useForm } from '@tanstack/react-form'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback, useState } from 'react'
import { changeEmail, changePassword, updateProfile } from '../api/auth'
import {
  type Child,
  createChild,
  deleteChild,
  listChildren,
  updateChild,
} from '../api/children'
import { extractErrorMessages } from '../api/errors'
import { useAuth } from '../auth/AuthContext'
import { FormErrors } from '../components/FormErrors'
import { Modal } from '../components/Modal'
import { useI18n } from '../i18n/I18nContext'
import type { TranslationKey } from '../i18n/translations'

type Tab = 'informations' | 'children'

export default function SettingsPage() {
  const { t } = useI18n()
  const [tab, setTab] = useState<Tab>('informations')

  return (
    <main className="page settings-page">
      <h1>{t('settings.title')}</h1>
      <div className="tabs" role="tablist" aria-label={t('settings.title')}>
        <TabButton tab="informations" active={tab} onSelect={setTab}>
          {t('settings.tabs.informations')}
        </TabButton>
        <TabButton tab="children" active={tab} onSelect={setTab}>
          {t('settings.tabs.children')}
        </TabButton>
      </div>
      {tab === 'informations' ? (
        <div role="tabpanel" className="tab-panel">
          <ProfileSection />
          <EmailSection />
          <PasswordSection />
        </div>
      ) : (
        <div role="tabpanel" className="tab-panel">
          <ChildrenSection />
        </div>
      )}
    </main>
  )
}

function TabButton({
  tab,
  active,
  onSelect,
  children,
}: {
  tab: Tab
  active: Tab
  onSelect: (tab: Tab) => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active === tab}
      className={active === tab ? 'tab active' : 'tab'}
      onClick={() => onSelect(tab)}
    >
      {children}
    </button>
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
    <p className="settings-success" role="status">
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
    <section className="card">
      <h2>{t('settings.profile.title')}</h2>
      <p className="settings-current">{t('settings.profile.description')}</p>
      <form
        onSubmit={(event) => {
          event.preventDefault()
          event.stopPropagation()
          form.handleSubmit()
        }}
      >
        <form.Field name="first_name">
          {(field) => (
            <label className="field">
              <span>{t('settings.profile.firstName')}</span>
              <input
                className="input"
                name={field.name}
                value={field.state.value}
                onBlur={field.handleBlur}
                onChange={(event) => field.handleChange(event.target.value)}
                autoComplete="given-name"
              />
            </label>
          )}
        </form.Field>
        <form.Field name="last_name">
          {(field) => (
            <label className="field">
              <span>{t('settings.profile.lastName')}</span>
              <input
                className="input"
                name={field.name}
                value={field.state.value}
                onBlur={field.handleBlur}
                onChange={(event) => field.handleChange(event.target.value)}
                autoComplete="family-name"
              />
            </label>
          )}
        </form.Field>
        <FormErrors messages={errors} />
        {success && <SuccessNote messageKey="settings.profile.saved" />}
        <form.Subscribe selector={(state) => state.isSubmitting}>
          {(isSubmitting) => (
            <button
              className="btn btn-primary"
              type="submit"
              disabled={isSubmitting}
            >
              {isSubmitting
                ? t('settings.profile.saving')
                : t('settings.profile.save')}
            </button>
          )}
        </form.Subscribe>
      </form>
    </section>
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
    <section className="card">
      <h2>{t('settings.email.title')}</h2>
      <p className="settings-current">{user?.email}</p>
      <form onSubmit={openDialog}>
        <label className="field">
          <span>{t('settings.email.new')}</span>
          <input
            className="input"
            type="email"
            value={newEmail}
            onChange={(event) => setNewEmail(event.target.value)}
            autoComplete="email"
            required
          />
        </label>
        {success && <SuccessNote messageKey="settings.email.saved" />}
        <button className="btn btn-primary" type="submit">
          {t('settings.email.save')}
        </button>
      </form>
      {dialogOpen && (
        <Modal title={t('settings.email.dialogTitle')} onClose={closeDialog}>
          <p className="settings-current">{t('settings.email.dialogHint')}</p>
          <form onSubmit={confirm}>
            <label className="field">
              <span>{t('settings.currentPassword')}</span>
              <input
                className="input"
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                autoComplete="current-password"
                required
              />
            </label>
            <FormErrors messages={errors} />
            <div className="modal-actions">
              <button
                className="btn btn-ghost"
                type="button"
                onClick={closeDialog}
              >
                {t('common.cancel')}
              </button>
              <button
                className="btn btn-primary"
                type="submit"
                disabled={submitting}
              >
                {submitting
                  ? t('settings.email.saving')
                  : t('settings.email.confirm')}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </section>
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
    <section className="card">
      <h2>{t('settings.password.title')}</h2>
      <form
        onSubmit={(event) => {
          event.preventDefault()
          event.stopPropagation()
          form.handleSubmit()
        }}
      >
        <form.Field name="current_password">
          {(field) => (
            <label className="field">
              <span>{t('settings.currentPassword')}</span>
              <input
                className="input"
                type="password"
                name={field.name}
                value={field.state.value}
                onBlur={field.handleBlur}
                onChange={(event) => field.handleChange(event.target.value)}
                autoComplete="current-password"
                required
              />
            </label>
          )}
        </form.Field>
        <form.Field name="new_password">
          {(field) => (
            <label className="field">
              <span>{t('settings.password.new')}</span>
              <input
                className="input"
                type="password"
                name={field.name}
                value={field.state.value}
                onBlur={field.handleBlur}
                onChange={(event) => field.handleChange(event.target.value)}
                autoComplete="new-password"
                required
              />
            </label>
          )}
        </form.Field>
        <FormErrors messages={errors} />
        {success && <SuccessNote messageKey="settings.password.saved" />}
        <form.Subscribe selector={(state) => state.isSubmitting}>
          {(isSubmitting) => (
            <button
              className="btn btn-primary"
              type="submit"
              disabled={isSubmitting}
            >
              {isSubmitting
                ? t('settings.password.saving')
                : t('settings.password.save')}
            </button>
          )}
        </form.Subscribe>
      </form>
    </section>
  )
}

function ChildrenSection() {
  const { t } = useI18n()
  const queryClient = useQueryClient()
  const [errors, setErrors] = useState<string[]>([])

  const {
    data: children,
    isLoading,
    isError,
  } = useQuery({ queryKey: ['children'], queryFn: listChildren })

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: ['children'] })
  const onError = (err: unknown) =>
    setErrors(extractErrorMessages(err, t('settings.children.error')))

  const addMutation = useMutation({
    mutationFn: (firstName: string) => createChild(firstName),
    onSuccess: invalidate,
    onError,
  })
  const renameMutation = useMutation({
    mutationFn: ({ id, firstName }: { id: number; firstName: string }) =>
      updateChild(id, firstName),
    onSuccess: invalidate,
    onError,
  })
  const deleteMutation = useMutation({
    mutationFn: (id: number) => deleteChild(id),
    onSuccess: invalidate,
    onError,
  })

  const addForm = useForm({
    defaultValues: { first_name: '' },
    onSubmit: async ({ value }) => {
      setErrors([])
      try {
        await addMutation.mutateAsync(value.first_name)
        addForm.reset()
      } catch {
        // The error is surfaced by the mutation's onError handler.
      }
    },
  })

  return (
    <section className="card">
      <h2>{t('settings.children.title')}</h2>
      <p className="settings-current">{t('settings.children.description')}</p>
      {isLoading && <p>{t('settings.children.loading')}</p>}
      {isError && <p className="alert">{t('settings.children.error')}</p>}
      {children && children.length === 0 && (
        <p className="settings-current">{t('settings.children.empty')}</p>
      )}
      <ul className="children-list">
        {children?.map((child) => (
          <ChildRow
            key={child.id}
            child={child}
            onRename={(firstName) =>
              renameMutation.mutate({ id: child.id, firstName })
            }
            onDelete={() => deleteMutation.mutate(child.id)}
          />
        ))}
      </ul>
      <FormErrors messages={errors} />
      <form
        className="children-add"
        onSubmit={(event) => {
          event.preventDefault()
          event.stopPropagation()
          addForm.handleSubmit()
        }}
      >
        <addForm.Field name="first_name">
          {(field) => (
            <label className="field">
              <span>{t('settings.children.firstName')}</span>
              <input
                className="input"
                name={field.name}
                value={field.state.value}
                onBlur={field.handleBlur}
                onChange={(event) => field.handleChange(event.target.value)}
                required
              />
            </label>
          )}
        </addForm.Field>
        <addForm.Subscribe selector={(state) => state.isSubmitting}>
          {(isSubmitting) => (
            <button
              className="btn btn-primary"
              type="submit"
              disabled={isSubmitting}
            >
              {isSubmitting
                ? t('settings.children.adding')
                : t('settings.children.add')}
            </button>
          )}
        </addForm.Subscribe>
      </form>
    </section>
  )
}

function ChildRow({
  child,
  onRename,
  onDelete,
}: {
  child: Child
  onRename: (firstName: string) => void
  onDelete: () => void
}) {
  const { t } = useI18n()
  const [name, setName] = useState(child.first_name)

  return (
    <li className="child-row">
      <input
        className="input"
        value={name}
        aria-label={t('settings.children.firstName')}
        onChange={(event) => setName(event.target.value)}
      />
      <button
        className="btn btn-ghost"
        type="button"
        onClick={() => onRename(name)}
        disabled={name.trim() === '' || name === child.first_name}
      >
        {t('settings.children.save')}
      </button>
      <button className="btn btn-ghost" type="button" onClick={onDelete}>
        {t('settings.children.delete')}
      </button>
    </li>
  )
}
