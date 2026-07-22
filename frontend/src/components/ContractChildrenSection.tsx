import { useCallback, useEffect, useState } from 'react'
import {
  type ChildRead,
  type ContractChildRead,
  type ContractChildRequest,
  type ContractChildWindowRead,
  type ContractChildWindowRequest,
  type ContractRead,
  type FamilyRead,
  useFamiliesChildrenListQuery,
  useFamiliesContractsChildrenCreateMutation,
  useFamiliesContractsChildrenDestroyMutation,
  useFamiliesContractsChildrenListQuery,
  useFamiliesContractsChildrenPartialUpdateMutation,
} from '@/src/api'
import { extractErrorMessages } from '@/src/api/errors'
import { ConfirmButton } from '@/src/components/ConfirmButton'
import { DayWindowFields } from '@/src/components/DayWindowFields'
import { FormErrors } from '@/src/components/FormErrors'
import { SectionCard } from '@/src/components/SectionCard'
import { formatTimeRange, hhmm } from '@/src/components/TimeField'
import { Button } from '@/src/components/ui/button'
import { Label } from '@/src/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/src/components/ui/radio-group'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/src/components/ui/select'
import { useI18n } from '@/src/i18n/I18nContext'
import type { Language, TranslationKey } from '@/src/i18n/translations'
import { canManageFamily } from '@/src/lib/family'
import { type DayWindow, sortByDay, WEEKDAY_KEYS } from '@/src/lib/weekdays'

// A family the acting user may manage: one they own, or one they created and
// nobody has claimed yet (copied from the old api/family.ts). Mirrors the
// backend's Family.can_manage — a write routed through such a family is
// authorised, and stops being so the instant the family is claimed.
// What a new window opens as. The nanny's own day is the natural span, but her
// schedule varies by day and version, so a neutral working day is the honest
// default — the parent narrows it.
const DEFAULT_WINDOW = { weekday: 0, start_time: '09:00', end_time: '17:00' }

interface ChildDraft {
  child: string
  windows: DayWindow[]
}

const EMPTY_CHILD: ChildDraft = { child: '', windows: [] }

function entryToDraft(entry: ContractChildRead): ChildDraft {
  return {
    child: entry.child,
    windows: entry.windows.map((w) => ({
      weekday: w.weekday,
      start_time: hhmm(w.start_time),
      end_time: hhmm(w.end_time),
    })),
  }
}

// Says a child's presence in one line, including the empty case — no windows
// does NOT mean "never", it means "whenever the nanny works", and a reader given
// a blank would assume the opposite. ContractChildWindow is already a DayWindow
// bar an optional id, so the server rows sort as they arrive.
function describePresence(
  windows: ContractChildWindowRead[],
  t: (key: TranslationKey) => string,
  lang: Language,
): string {
  if (windows.length === 0) return t('contractChild.wholeTime')
  return sortByDay(windows)
    .map(
      (w) =>
        `${t(WEEKDAY_KEYS[w.weekday])} ${formatTimeRange(w.start_time, w.end_time, lang)}`,
    )
    .join(' · ')
}

function ChildFields({
  draft,
  onChange,
  lang,
  childOptions,
  lockChild,
}: {
  draft: ChildDraft
  onChange: (patch: Partial<ChildDraft>) => void
  lang: Language
  childOptions: { id: string; name: string }[]
  lockChild: boolean
}) {
  const { t } = useI18n()
  // Windows empty means "there whenever the nanny works", which is both the
  // common case and the one a parent should not have to describe day by day.
  const whole = draft.windows.length === 0

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <Label htmlFor="contract-child">{t('contractChild.child')}</Label>
        <Select
          value={draft.child}
          disabled={lockChild}
          onValueChange={(value) => onChange({ child: value })}
        >
          <SelectTrigger id="contract-child">
            <SelectValue placeholder={t('contractChild.pickChild')} />
          </SelectTrigger>
          <SelectContent>
            {childOptions.map((child) => (
              <SelectItem key={child.id} value={child.id}>
                {child.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 text-sm font-medium">
          {t('contractChild.presence')}
        </legend>
        <RadioGroup
          value={whole ? 'whole' : 'windows'}
          onValueChange={(value) =>
            onChange({
              windows: value === 'whole' ? [] : [{ ...DEFAULT_WINDOW }],
            })
          }
        >
          <label className="flex items-center gap-2 text-sm">
            <RadioGroupItem value="whole" />
            {t('contractChild.wholeTime')}
          </label>
          <label className="flex items-center gap-2 text-sm">
            <RadioGroupItem value="windows" />
            {t('contractChild.someDays')}
          </label>
        </RadioGroup>
        <p className="text-xs text-muted-foreground">
          {t('contractChild.someDaysHint')}
        </p>
      </fieldset>

      {!whole && (
        <DayWindowFields
          windows={draft.windows}
          onChange={(windows) => onChange({ windows })}
          lang={lang}
          idPrefix="window"
          addLabel={t('contractChild.addWindow')}
          removeLabel={t('schedule.removeBlock')}
        />
      )}
    </div>
  )
}

// RTK Query has no `useQueries`, so one loader per manageable family fetches
// that family's children and reports them back up. The parent aggregates them
// into the picker options and the create-target routing — the children are
// needed as a single combined list, not rendered per family.
function FamilyChildrenLoader({
  familyId,
  onLoaded,
}: {
  familyId: string
  onLoaded: (familyId: string, children: ChildRead[]) => void
}) {
  const { data, isSuccess } = useFamiliesChildrenListQuery({
    familyPk: familyId,
  })
  useEffect(() => {
    if (isSuccess) onLoaded(familyId, data ?? [])
  }, [isSuccess, data, familyId, onLoaded])
  return null
}

// The children a contract covers, and when each is there. This is what the pay
// split divides by: without it a shared contract has nothing to split, and the
// declaration says so (`split_without_children`).
export function ContractChildrenSection({
  familyId,
  contract,
  families,
}: {
  familyId: string
  contract: ContractRead
  families: FamilyRead[]
}) {
  const { t, lang } = useI18n()
  const [draft, setDraft] = useState<ChildDraft>(EMPTY_CHILD)
  const [editingId, setEditingId] = useState<string | 'new' | null>(null)
  // The family the current form writes through. A write is scoped to a family's
  // URL, so it is authorised against *that* family: editing a row uses the
  // family that owns it; a new row uses the chosen child's family, resolved at
  // save time (null until then).
  const [actingFamilyId, setActingFamilyId] = useState<string | null>(null)
  const [errors, setErrors] = useState<string[]>([])
  // Children of each manageable family, filled by the loaders below.
  const [childrenByFamily, setChildrenByFamily] = useState<
    Record<string, ChildRead[]>
  >({})
  const handleChildrenLoaded = useCallback(
    (fid: string, children: ChildRead[]) => {
      setChildrenByFamily((prev) => ({ ...prev, [fid]: children }))
    },
    [],
  )

  const { data: entries } = useFamiliesContractsChildrenListQuery({
    familyPk: familyId,
    contractPk: contract.id,
  })

  // The families on this contract the acting user may manage: their own, plus
  // any unclaimed family they set up on a co-employer's behalf — until that
  // co-employer claims it. Their children can be put on the contract and have
  // their presence edited, each routed through its own family so the backend's
  // can_manage check draws the same line (and revokes it the moment B claims).
  const manageableFamilies = contract.families.filter((cf) =>
    families.some((f) => f.id === cf.id && canManageFamily(f)),
  )
  const manageableIds = new Set(manageableFamilies.map((f) => f.id))

  const childrenLoaded = manageableFamilies.every(
    (cf) => cf.id in childrenByFamily,
  )
  // Every child of a manageable family, tagged with the family that owns it so a
  // new row can be routed through it.
  const ownChildren = manageableFamilies.flatMap((cf) =>
    (childrenByFamily[cf.id] ?? []).map((c) => ({
      id: c.id,
      name: c.first_name,
      familyId: cf.id,
    })),
  )

  // Cache invalidation is handled by RTK Query tags (see api/index.ts): a
  // contract-child mutation invalidates the "families" tag, refetching both the
  // entries here and every declaration (whose split moves with this).
  const [createContractChild, { isLoading: creating }] =
    useFamiliesContractsChildrenCreateMutation()
  const [updateContractChild, { isLoading: updating }] =
    useFamiliesContractsChildrenPartialUpdateMutation()
  const [deleteContractChild] = useFamiliesContractsChildrenDestroyMutation()
  const saving = creating || updating

  const close = () => {
    setEditingId(null)
    setActingFamilyId(null)
    setErrors([])
  }

  const open = (
    mode: string | 'new',
    initial: ChildDraft,
    family: string | null,
  ) => {
    setDraft(initial)
    setEditingId(mode)
    setActingFamilyId(family)
    setErrors([])
  }
  const submit = async () => {
    if (!draft.child) {
      setErrors([t('contractChild.childRequired')])
      return
    }
    const input: ContractChildRequest = {
      child: draft.child,
      windows: draft.windows as ContractChildWindowRequest[],
    }
    try {
      if (editingId === 'new' || editingId === null) {
        const target = ownChildren.find((c) => c.id === draft.child)?.familyId
        if (!target) throw new Error('No family owns the chosen child.')
        await createContractChild({
          familyPk: target,
          contractPk: contract.id,
          contractChildRequest: input,
        }).unwrap()
      } else {
        // actingFamilyId is pinned to the edited row's family when the form opens.
        await updateContractChild({
          familyPk: actingFamilyId as string,
          contractPk: contract.id,
          id: editingId,
          patchedContractChildRequest: input,
        }).unwrap()
      }
      close()
    } catch (err) {
      setErrors(extractErrorMessages(err, t('nanny.error')))
    }
  }

  // A child already on the contract is not a candidate to add again — but the
  // one being edited has to stay in its own picker.
  const taken = new Set(
    (entries ?? []).filter((e) => e.id !== editingId).map((e) => e.child),
  )
  const childOptions = ownChildren
    .filter((c) => !taken.has(c.id))
    .map((c) => ({ id: c.id, name: c.name }))

  return (
    <SectionCard
      title={t('contractChild.title')}
      description={t('contractChild.description')}
    >
      {manageableFamilies.map((cf) => (
        <FamilyChildrenLoader
          key={cf.id}
          familyId={cf.id}
          onLoaded={handleChildrenLoaded}
        />
      ))}

      {editingId !== null ? (
        <div className="flex flex-col gap-4 rounded-md border p-3">
          <ChildFields
            draft={draft}
            onChange={(p) => setDraft((d) => ({ ...d, ...p }))}
            lang={lang}
            childOptions={childOptions}
            lockChild={editingId !== 'new'}
          />
          <FormErrors messages={errors} />
          <div className="flex gap-2">
            <Button type="button" onClick={submit} disabled={saving}>
              {t('contractChild.save')}
            </Button>
            <Button type="button" variant="outline" onClick={close}>
              {t('common.cancel')}
            </Button>
          </div>
        </div>
      ) : (
        // The acting user only gets an add affordance for families they manage
        // on this contract. A plain member of the family they are viewing manages
        // none — so offer nothing (the rows below still render read-only) rather
        // than a lie like "add a child to your family first".
        manageableFamilies.length > 0 &&
        (childrenLoaded && ownChildren.length === 0 ? (
          // Nothing to put on the contract: say so rather than offer a form whose
          // only required field has no options.
          <p className="text-sm text-muted-foreground">
            {t('contractChild.noChildren')}
          </p>
        ) : (
          <Button
            type="button"
            variant="outline"
            className="self-start"
            disabled={childOptions.length === 0}
            onClick={() => open('new', EMPTY_CHILD, null)}
          >
            {t('contractChild.add')}
          </Button>
        ))
      )}

      {entries && entries.length > 0 ? (
        <ul className="flex flex-col divide-y text-sm">
          {entries.map((entry) => {
            // A row is ours to edit when we manage the family that owns the
            // child: our own family, or an unclaimed one we set up until it is
            // claimed. Another claimed family's children are on the contract too
            // — half of what the split divides — but are shown read-only.
            const editable = manageableIds.has(entry.family_id)
            const presence = describePresence(entry.windows, t, lang)
            return (
              <li
                key={entry.id}
                className="flex flex-col items-start gap-1 py-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3"
              >
                <span className="flex min-w-0 flex-col">
                  <span className="font-medium">{entry.first_name}</span>
                  <span className="text-muted-foreground">{presence}</span>
                </span>
                {editable && (
                  <span className="flex shrink-0 gap-1">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() =>
                        open(entry.id, entryToDraft(entry), entry.family_id)
                      }
                    >
                      {t('nanny.edit')}
                    </Button>
                    <ConfirmButton
                      trigger={t('nanny.delete')}
                      title={t('nanny.delete')}
                      description={t('contractChild.confirmDelete')}
                      onConfirm={() =>
                        void deleteContractChild({
                          familyPk: entry.family_id,
                          contractPk: contract.id,
                          id: entry.id,
                        })
                      }
                    />
                  </span>
                )}
              </li>
            )
          })}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">
          {t('contractChild.none')}
        </p>
      )}
    </SectionCard>
  )
}
