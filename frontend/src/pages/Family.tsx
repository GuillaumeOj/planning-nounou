import { useForm } from '@tanstack/react-form'
import { TriangleAlert } from 'lucide-react'
import { useState } from 'react'
import {
  type ChildRead,
  type FamilyRead,
  type RoleEnum,
  useFamiliesChildrenCreateMutation,
  useFamiliesChildrenDestroyMutation,
  useFamiliesChildrenListQuery,
  useFamiliesChildrenPartialUpdateMutation,
  useFamiliesCreateMutation,
  useFamiliesDestroyMutation,
  useFamiliesInvitationsCreateMutation,
  useFamiliesInvitationsDestroyMutation,
  useFamiliesInvitationsListQuery,
  useFamiliesLeaveCreateMutation,
  useFamiliesListQuery,
  useFamiliesMembersDestroyMutation,
  useFamiliesMembersListQuery,
  useFamiliesPartialUpdateMutation,
  useInvitationsAcceptCreateMutation,
  useInvitationsDeclineCreateMutation,
  useInvitationsListQuery,
} from '@/src/api'
import { extractErrorMessages } from '@/src/api/errors'
import { useAuth } from '@/src/auth/AuthContext'
import { ConfirmButton } from '@/src/components/ConfirmButton'
import { FormErrors } from '@/src/components/FormErrors'
import { Modal } from '@/src/components/Modal'
import { PersonAvatar } from '@/src/components/PersonAvatar'
import { SectionCard } from '@/src/components/SectionCard'
import { TextField } from '@/src/components/TextField'
import { Badge, StatusBadge } from '@/src/components/ui/badge'
import { Button } from '@/src/components/ui/button'
import { Card, CardContent } from '@/src/components/ui/card'
import { Checkbox } from '@/src/components/ui/checkbox'
import { Input } from '@/src/components/ui/input'
import { Label } from '@/src/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/src/components/ui/select'
import { useI18n } from '@/src/i18n/I18nContext'
import { canManageFamily } from '@/src/lib/family'
import { roleLabel } from '@/src/lib/roleLabel'

export default function FamilyPage() {
  const { t } = useI18n()
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)

  const { data: families, isLoading, isError } = useFamiliesListQuery()

  const selected = families?.find((f) => f.id === selectedId) ?? null

  return (
    <main className="flex flex-1 flex-col gap-6 p-4 sm:p-10">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
          {t('family.title')}
        </h1>
        <Button type="button" onClick={() => setCreating(true)}>
          {t('family.create')}
        </Button>
      </div>

      <PendingInvitationsSection />

      <Card className="max-w-2xl">
        <CardContent>
          {isLoading ? (
            <p className="text-sm text-muted-foreground">
              {t('family.loading')}
            </p>
          ) : isError ? (
            <p className="text-sm text-destructive" role="alert">
              {t('family.loadError')}
            </p>
          ) : families && families.length > 0 ? (
            <ul className="flex flex-col divide-y">
              {families.map((family) => (
                <FamilyRow
                  key={family.id}
                  family={family}
                  selected={family.id === selectedId}
                  onSelect={() => setSelectedId(family.id)}
                />
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">{t('family.empty')}</p>
          )}
        </CardContent>
      </Card>

      {selected && (
        <FamilyDetail
          key={selected.id}
          family={selected}
          onGone={() => setSelectedId(null)}
        />
      )}

      {creating && (
        <CreateFamilyDialog
          onClose={() => setCreating(false)}
          onCreated={(family) => {
            setSelectedId(family.id)
            setCreating(false)
          }}
        />
      )}
    </main>
  )
}

// Invitations addressed to the logged-in user — the way an existing account
// discovers a family they've been invited to claim/join. Cache invalidation is
// handled by RTK Query tags: accepting also refetches the "families" tag (see
// api/index.ts), declining refetches the "invitations" tag.
function PendingInvitationsSection() {
  const { t } = useI18n()

  const { data: invitations } = useInvitationsListQuery()

  const [acceptInvite, { isLoading: accepting }] =
    useInvitationsAcceptCreateMutation()
  const [declineInvite, { isLoading: declining }] =
    useInvitationsDeclineCreateMutation()

  if (!invitations || invitations.length === 0) return null
  const busy = accepting || declining

  return (
    <SectionCard title={t('family.inbox.title')} className="max-w-2xl">
      <ul className="flex flex-col divide-y">
        {invitations.map((invite) => (
          <li
            key={invite.id}
            className="flex flex-col items-start gap-2 py-3 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between sm:gap-3"
          >
            <div className="flex min-w-0 flex-col gap-1">
              <span className="font-medium break-words text-foreground">
                {invite.family_name}
              </span>
              <Badge variant="secondary" className="w-fit">
                {roleLabel(t, invite.role)}
              </Badge>
            </div>
            <div className="flex gap-2">
              <Button
                type="button"
                size="sm"
                disabled={busy}
                onClick={() => void acceptInvite({ token: invite.token })}
              >
                {t('invite.accept')}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={busy}
                onClick={() => void declineInvite({ token: invite.token })}
              >
                {t('invite.decline')}
              </Button>
            </div>
          </li>
        ))}
      </ul>
    </SectionCard>
  )
}

function FamilyRow({
  family,
  selected,
  onSelect,
}: {
  family: FamilyRead
  selected: boolean
  onSelect: () => void
}) {
  const { t } = useI18n()
  return (
    <li className="flex flex-col items-start gap-2 py-3 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
      <div className="flex min-w-0 flex-col gap-1">
        <span className="font-medium break-words text-foreground">
          {family.name}
        </span>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="secondary">{roleLabel(t, family.role)}</Badge>
          {family.is_claimed ? (
            <Badge variant="outline">{t('family.claimed')}</Badge>
          ) : (
            <StatusBadge icon={TriangleAlert} variant="destructive">
              {t('family.unclaimed')}
            </StatusBadge>
          )}
        </div>
      </div>
      <Button
        type="button"
        variant={selected ? 'secondary' : 'ghost'}
        size="sm"
        aria-pressed={selected}
        onClick={onSelect}
      >
        {t('family.manage')}
      </Button>
    </li>
  )
}

function CreateFamilyDialog({
  onClose,
  onCreated,
}: {
  onClose: () => void
  onCreated: (family: FamilyRead) => void
}) {
  const { t } = useI18n()
  const [errors, setErrors] = useState<string[]>([])
  const [forSomeoneElse, setForSomeoneElse] = useState(false)
  const [createFamily] = useFamiliesCreateMutation()

  const form = useForm({
    defaultValues: { name: '' },
    onSubmit: async ({ value }) => {
      setErrors([])
      try {
        const family = await createFamily({
          familyRequest: { name: value.name, claim: !forSomeoneElse },
        }).unwrap()
        onCreated(family)
      } catch (err) {
        setErrors(extractErrorMessages(err, t('family.createError')))
      }
    },
  })

  return (
    <Modal title={t('family.createTitle')} onClose={onClose}>
      <form
        className="flex flex-col gap-4"
        onSubmit={(event) => {
          event.preventDefault()
          event.stopPropagation()
          form.handleSubmit()
        }}
      >
        <form.Field name="name">
          {(field) => (
            <TextField
              field={field}
              id="family-name"
              label={t('family.name')}
              required
            />
          )}
        </form.Field>
        <label className="flex items-start gap-2 text-sm">
          <Checkbox
            className="mt-1"
            checked={forSomeoneElse}
            onCheckedChange={(checked) => setForSomeoneElse(checked === true)}
          />
          <span className="flex flex-col gap-0.5">
            <span className="text-foreground">
              {t('family.forSomeoneElse')}
            </span>
            <span className="text-muted-foreground">
              {t('family.forSomeoneElseHint')}
            </span>
          </span>
        </label>
        <FormErrors messages={errors} />
        <div className="flex justify-end gap-2">
          <Button variant="outline" type="button" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <form.Subscribe selector={(state) => state.isSubmitting}>
            {(isSubmitting) => (
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? t('family.creating') : t('family.create')}
              </Button>
            )}
          </form.Subscribe>
        </div>
      </form>
    </Modal>
  )
}

function FamilyDetail({
  family,
  onGone,
}: {
  family: FamilyRead
  onGone: () => void
}) {
  const { t } = useI18n()
  const [errors, setErrors] = useState<string[]>([])
  const [renaming, setRenaming] = useState(false)

  const [deleteFamily] = useFamiliesDestroyMutation()
  const [leaveFamily] = useFamiliesLeaveCreateMutation()

  const remove = async () => {
    setErrors([])
    try {
      await deleteFamily({ id: family.id }).unwrap()
      onGone()
    } catch (err) {
      setErrors(extractErrorMessages(err, t('family.actionError')))
    }
  }
  const leave = async () => {
    setErrors([])
    try {
      await leaveFamily({ id: family.id }).unwrap()
      onGone()
    } catch (err) {
      setErrors(extractErrorMessages(err, t('family.actionError')))
    }
  }

  const manage = canManageFamily(family)
  const isMember = family.role !== null

  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <SectionCard title={family.name}>
        <div className="flex flex-wrap items-center gap-2">
          {manage && (
            <Button
              variant="outline"
              size="sm"
              type="button"
              onClick={() => setRenaming(true)}
            >
              {t('family.rename')}
            </Button>
          )}
          {isMember && (
            <ConfirmButton
              trigger={t('family.leave')}
              title={t('family.leave')}
              description={t('family.leaveConfirm')}
              onConfirm={leave}
            />
          )}
          {manage && (
            <ConfirmButton
              trigger={t('family.delete')}
              title={t('family.delete')}
              description={t('family.deleteConfirm')}
              onConfirm={remove}
            />
          )}
        </div>
        <FormErrors messages={errors} />
      </SectionCard>

      <ChildrenPanel familyId={family.id} />
      <MembersPanel family={family} />
      {manage && <InvitationsPanel family={family} />}

      {renaming && (
        <RenameFamilyDialog
          family={family}
          onClose={() => setRenaming(false)}
        />
      )}
    </div>
  )
}

function RenameFamilyDialog({
  family,
  onClose,
}: {
  family: FamilyRead
  onClose: () => void
}) {
  const { t } = useI18n()
  const [errors, setErrors] = useState<string[]>([])
  const [updateFamily] = useFamiliesPartialUpdateMutation()

  const form = useForm({
    defaultValues: { name: family.name },
    onSubmit: async ({ value }) => {
      setErrors([])
      try {
        await updateFamily({
          id: family.id,
          patchedFamilyRequest: { name: value.name },
        }).unwrap()
        onClose()
      } catch (err) {
        setErrors(extractErrorMessages(err, t('family.renameError')))
      }
    },
  })

  return (
    <Modal title={t('family.renameTitle')} onClose={onClose}>
      <form
        className="flex flex-col gap-4"
        onSubmit={(event) => {
          event.preventDefault()
          event.stopPropagation()
          form.handleSubmit()
        }}
      >
        <form.Field name="name">
          {(field) => (
            <TextField
              field={field}
              id="rename-family-name"
              label={t('family.name')}
              required
            />
          )}
        </form.Field>
        <FormErrors messages={errors} />
        <div className="flex justify-end gap-2">
          <Button variant="outline" type="button" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <form.Subscribe selector={(state) => state.isSubmitting}>
            {(isSubmitting) => (
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? t('family.saving') : t('family.save')}
              </Button>
            )}
          </form.Subscribe>
        </div>
      </form>
    </Modal>
  )
}

function ChildrenPanel({ familyId }: { familyId: string }) {
  const { t } = useI18n()
  const [errors, setErrors] = useState<string[]>([])

  const {
    data: children,
    isLoading,
    isError,
  } = useFamiliesChildrenListQuery({ familyPk: familyId })

  const [createChild] = useFamiliesChildrenCreateMutation()
  const [updateChild] = useFamiliesChildrenPartialUpdateMutation()
  const [deleteChild] = useFamiliesChildrenDestroyMutation()

  const onError = (err: unknown) =>
    setErrors(extractErrorMessages(err, t('family.children.error')))

  const rename = async (id: string, firstName: string) => {
    setErrors([])
    try {
      await updateChild({
        familyPk: familyId,
        id,
        patchedChildRequest: { first_name: firstName },
      }).unwrap()
    } catch (err) {
      onError(err)
    }
  }
  const remove = async (id: string) => {
    setErrors([])
    try {
      await deleteChild({ familyPk: familyId, id }).unwrap()
    } catch (err) {
      onError(err)
    }
  }

  const addForm = useForm({
    defaultValues: { first_name: '' },
    onSubmit: async ({ value }) => {
      setErrors([])
      try {
        await createChild({
          familyPk: familyId,
          childRequest: { first_name: value.first_name },
        }).unwrap()
        addForm.reset()
      } catch (err) {
        onError(err)
      }
    },
  })

  return (
    <SectionCard
      title={t('family.children.title')}
      description={t('family.children.description')}
    >
      {isLoading && (
        <p className="text-sm text-muted-foreground">
          {t('family.children.loading')}
        </p>
      )}
      {isError && (
        <p className="text-sm text-destructive">{t('family.children.error')}</p>
      )}
      {children && children.length === 0 && (
        <p className="text-sm text-muted-foreground">
          {t('family.children.empty')}
        </p>
      )}
      <ul className="flex flex-col gap-3">
        {children?.map((child) => (
          <ChildRow
            key={child.id}
            child={child}
            onRename={(firstName) => rename(child.id, firstName)}
            onDelete={() => remove(child.id)}
          />
        ))}
      </ul>
      <FormErrors messages={errors} />
      <form
        className="flex flex-col gap-4 border-t pt-4"
        onSubmit={(event) => {
          event.preventDefault()
          event.stopPropagation()
          addForm.handleSubmit()
        }}
      >
        <addForm.Field name="first_name">
          {(field) => (
            <TextField
              field={field}
              id="child-first-name"
              label={t('family.children.firstName')}
              required
            />
          )}
        </addForm.Field>
        <addForm.Subscribe selector={(state) => state.isSubmitting}>
          {(isSubmitting) => (
            <Button
              type="submit"
              className="self-start"
              disabled={isSubmitting}
            >
              {isSubmitting
                ? t('family.children.adding')
                : t('family.children.add')}
            </Button>
          )}
        </addForm.Subscribe>
      </form>
    </SectionCard>
  )
}

function ChildRow({
  child,
  onRename,
  onDelete,
}: {
  child: ChildRead
  onRename: (firstName: string) => void
  onDelete: () => void
}) {
  const { t } = useI18n()
  const [name, setName] = useState(child.first_name)

  // The two buttons never shrink, so on a phone the name field gets its own
  // line rather than being squeezed into what they leave behind.
  return (
    <li className="flex flex-col gap-2 sm:flex-row sm:items-center">
      <Input
        className="w-full sm:flex-1"
        value={name}
        aria-label={t('family.children.firstName')}
        onChange={(event) => setName(event.target.value)}
      />
      <div className="flex gap-2">
        <Button
          variant="outline"
          type="button"
          onClick={() => onRename(name)}
          disabled={name.trim() === '' || name === child.first_name}
        >
          {t('family.children.save')}
        </Button>
        <Button variant="destructive" type="button" onClick={onDelete}>
          {t('family.children.delete')}
        </Button>
      </div>
    </li>
  )
}

function MembersPanel({ family }: { family: FamilyRead }) {
  const { t } = useI18n()
  const { user } = useAuth()

  const {
    data: members,
    isLoading,
    isError,
  } = useFamiliesMembersListQuery({ familyPk: family.id })

  const [removeMember] = useFamiliesMembersDestroyMutation()

  const manage = canManageFamily(family)

  return (
    <SectionCard title={t('family.members.title')}>
      {isLoading && (
        <p className="text-sm text-muted-foreground">
          {t('family.members.loading')}
        </p>
      )}
      {isError && (
        <p className="text-sm text-destructive" role="alert">
          {t('family.members.error')}
        </p>
      )}
      {members && members.length === 0 && (
        <p className="text-sm text-muted-foreground">
          {t('family.members.unclaimed')}
        </p>
      )}
      <ul className="flex flex-col divide-y">
        {members?.map((member) => {
          const isSelf = member.user === user?.id
          const displayName =
            [member.first_name, member.last_name].filter(Boolean).join(' ') ||
            member.email
          return (
            <li
              key={member.id}
              className="flex flex-col items-start gap-2 py-3 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between sm:gap-3"
            >
              <div className="flex min-w-0 items-center gap-3">
                <PersonAvatar name={displayName} />
                <div className="flex min-w-0 flex-col gap-1">
                  <span className="font-medium break-words text-foreground">
                    {displayName}{' '}
                    {isSelf && (
                      <span className="text-sm text-muted-foreground">
                        {t('family.members.you')}
                      </span>
                    )}
                  </span>
                  {/* An address has no break opportunities of its own, so it
                      would otherwise push the row wider than the card. */}
                  <span className="text-sm break-all text-muted-foreground">
                    {member.email}
                  </span>
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <Badge variant="secondary">{roleLabel(t, member.role)}</Badge>
                {manage && !isSelf && (
                  <ConfirmButton
                    trigger={t('family.members.remove')}
                    title={t('family.members.remove')}
                    description={t('family.members.removeConfirm')}
                    onConfirm={() =>
                      void removeMember({ familyPk: family.id, id: member.id })
                    }
                  />
                )}
              </div>
            </li>
          )
        })}
      </ul>
    </SectionCard>
  )
}

function InvitationsPanel({ family }: { family: FamilyRead }) {
  const { t } = useI18n()
  const [errors, setErrors] = useState<string[]>([])
  const [role, setRole] = useState<RoleEnum>('member')

  const {
    data: invitations,
    isLoading,
    isError,
  } = useFamiliesInvitationsListQuery({ familyPk: family.id })

  const [createInvitation] = useFamiliesInvitationsCreateMutation()
  const [revokeInvitation] = useFamiliesInvitationsDestroyMutation()

  const inviteForm = useForm({
    defaultValues: { email: '' },
    onSubmit: async ({ value }) => {
      setErrors([])
      try {
        await createInvitation({
          familyPk: family.id,
          invitationRequest: { email: value.email, role },
        }).unwrap()
        inviteForm.reset()
        setRole('member')
      } catch (err) {
        setErrors(extractErrorMessages(err, t('family.invites.createError')))
      }
    },
  })

  const pending = invitations?.filter((invite) => invite.status === 'pending')

  return (
    <SectionCard title={t('family.invites.title')}>
      {isLoading && (
        <p className="text-sm text-muted-foreground">
          {t('family.invites.loading')}
        </p>
      )}
      {isError && (
        <p className="text-sm text-destructive" role="alert">
          {t('family.invites.error')}
        </p>
      )}
      {pending && pending.length === 0 && (
        <p className="text-sm text-muted-foreground">
          {t('family.invites.empty')}
        </p>
      )}
      <ul className="flex flex-col gap-4">
        {pending?.map((invite) => (
          <li key={invite.id} className="flex flex-col gap-2 border-b pb-4">
            <div className="flex flex-col items-start gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
              <div className="flex min-w-0 flex-col gap-1">
                <span className="font-medium break-all text-foreground">
                  {invite.email}
                </span>
                <Badge variant="secondary" className="w-fit">
                  {roleLabel(t, invite.role ?? null)}
                </Badge>
              </div>
              <Button
                variant="destructive"
                size="sm"
                type="button"
                onClick={() =>
                  void revokeInvitation({ familyPk: family.id, id: invite.id })
                }
              >
                {t('family.invites.revoke')}
              </Button>
            </div>
            <InviteLink token={invite.token} />
          </li>
        ))}
      </ul>
      <form
        className="flex flex-col gap-4 border-t pt-4"
        onSubmit={(event) => {
          event.preventDefault()
          event.stopPropagation()
          inviteForm.handleSubmit()
        }}
      >
        <inviteForm.Field name="email">
          {(field) => (
            <TextField
              field={field}
              id="invite-email"
              label={t('family.invites.email')}
              type="email"
              autoComplete="off"
              required
            />
          )}
        </inviteForm.Field>
        <div className="flex flex-col gap-2">
          <Label htmlFor="invite-role">{t('family.invites.role')}</Label>
          <Select
            value={role}
            onValueChange={(value) => setRole(value as RoleEnum)}
          >
            <SelectTrigger id="invite-role">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="member">{t('family.roleMember')}</SelectItem>
              <SelectItem value="owner">{t('family.roleOwner')}</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <FormErrors messages={errors} />
        <inviteForm.Subscribe selector={(state) => state.isSubmitting}>
          {(isSubmitting) => (
            <Button
              type="submit"
              className="self-start"
              disabled={isSubmitting}
            >
              {isSubmitting
                ? t('family.invites.sending')
                : t('family.invites.send')}
            </Button>
          )}
        </inviteForm.Subscribe>
      </form>
    </SectionCard>
  )
}

function InviteLink({ token }: { token: string }) {
  const { t } = useI18n()
  const [copied, setCopied] = useState(false)
  const url = `${window.location.origin}/invite/${token}`

  const copy = async () => {
    try {
      await navigator.clipboard?.writeText(url)
      setCopied(true)
    } catch {
      // Clipboard may be unavailable; the URL is still shown for manual copy.
    }
  }

  return (
    <div className="flex flex-col gap-1">
      <span className="text-sm text-muted-foreground">
        {t('family.invites.linkHint')}
      </span>
      <div className="flex gap-2">
        <Input readOnly value={url} aria-label={t('family.invites.linkHint')} />
        <Button variant="outline" type="button" onClick={copy}>
          {copied ? t('common.copied') : t('common.copy')}
        </Button>
      </div>
    </div>
  )
}
