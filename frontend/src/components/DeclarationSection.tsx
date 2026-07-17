import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { TriangleAlert } from 'lucide-react'
import { Fragment, useState } from 'react'
import type { Contract } from '@/src/api/contracts'
import {
  type DeclarationWarning,
  fileDeclaration,
  getDeclarations,
  type MonthlyDeclaration,
  updateDeclaration,
} from '@/src/api/declarations'
import { extractErrorMessages } from '@/src/api/errors'
import { ConfirmButton } from '@/src/components/ConfirmButton'
import { formatDate } from '@/src/components/DateField'
import { FormErrors } from '@/src/components/FormErrors'
import { SectionCard } from '@/src/components/SectionCard'
import { Button } from '@/src/components/ui/button'
import { Input } from '@/src/components/ui/input'
import { Label } from '@/src/components/ui/label'
import { useI18n } from '@/src/i18n/I18nContext'
import type { TranslationKey } from '@/src/i18n/translations'
import { cn, formatHours, formatMoney } from '@/src/lib/utils'

// Each code the compute raises, spelled out. A code with no entry here falls
// back to the raw string rather than rendering blank: a warning a parent cannot
// read is still better than a warning they never see.
const WARNING_KEYS: Record<string, TranslationKey> = {
  rates_changed_mid_month: 'declaration.warning.rates_changed_mid_month',
  night_presence_rate_below_floor:
    'declaration.warning.night_presence_rate_below_floor',
  night_presence_longer_than_12h:
    'declaration.warning.night_presence_longer_than_12h',
  night_presence_outside_window:
    'declaration.warning.night_presence_outside_window',
  night_presence_should_be_requalified:
    'declaration.warning.night_presence_should_be_requalified',
  night_interventions_need_manual_pricing:
    'declaration.warning.night_interventions_need_manual_pricing',
  presence_responsable_in_shared_care:
    'declaration.warning.presence_responsable_in_shared_care',
  split_without_children: 'declaration.warning.split_without_children',
  weekly_hours_over_maximum: 'declaration.warning.weekly_hours_over_maximum',
  worked_holiday_not_majorated:
    'declaration.warning.worked_holiday_not_majorated',
}

const isZero = (decimal: string) => Number(decimal) === 0

// Rows that only earn their space when they carry a figure. Reads left to right
// — condition, then the rows it admits — where the bare spread ternary put an
// empty array between a reader and the row they came for.
const when = (condition: boolean, ...rows: Figure[]): Figure[] =>
  condition ? rows : []

// A labelled figure. `strong` marks the one line a parent is really after — the
// net salary — so it carries the weight the others don't.
interface Figure {
  label: string
  value: string
  strong?: boolean
}

function FigureGroup({ title, rows }: { title: string; rows: Figure[] }) {
  if (rows.length === 0) return null
  return (
    <div className="flex flex-col gap-2">
      <h4 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {title}
      </h4>
      <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1.5 text-sm">
        {rows.map((row) => (
          <Fragment key={row.label}>
            <dt className="text-muted-foreground">{row.label}</dt>
            <dd
              className={cn(
                'text-right tabular-nums',
                row.strong ? 'font-semibold' : 'font-medium',
              )}
            >
              {row.value}
            </dd>
          </Fragment>
        ))}
      </dl>
    </div>
  )
}

// The article behind a warning, quoted verbatim. This is the point of showing a
// warning at all: a parent about to type a figure into pajemploi can check it
// against the convention rather than take our word.
function WarningItem({ warning }: { warning: DeclarationWarning }) {
  const { t } = useI18n()
  const key = WARNING_KEYS[warning.code]

  return (
    <li className="flex flex-col gap-1.5">
      <p className="text-sm">{key ? t(key) : warning.code}</p>
      {warning.source && (
        <figure className="flex flex-col gap-1 border-l-2 border-amber-500/40 pl-2.5">
          <blockquote className="text-xs italic text-muted-foreground">
            “{warning.source.quote}”
          </blockquote>
          <figcaption className="text-xs">
            <a
              href={warning.source.url}
              target="_blank"
              rel="noreferrer"
              className="underline underline-offset-2 hover:text-foreground"
            >
              {warning.source.ref}
            </a>
          </figcaption>
        </figure>
      )}
    </li>
  )
}

function Warnings({ warnings }: { warnings: DeclarationWarning[] }) {
  const { t } = useI18n()
  if (warnings.length === 0) return null

  return (
    <div className="flex flex-col gap-2.5 rounded-md border border-amber-500/40 bg-amber-500/5 p-3">
      <p className="flex items-center gap-2 text-sm font-medium">
        <TriangleAlert size={16} aria-hidden="true" />
        {t('declaration.checkBeforeFiling')}
      </p>
      <ul className="flex flex-col gap-3">
        {warnings.map((warning) => (
          <WarningItem key={warning.code} warning={warning} />
        ))}
      </ul>
    </div>
  )
}

// Only shown when the rates moved mid-month, which is the one case where
// total != hours × rate and a parent would otherwise be unable to reproduce the
// figure. A single period is the norm and says nothing worth the space.
function RatePeriods({ declaration }: { declaration: MonthlyDeclaration }) {
  const { t, lang } = useI18n()
  if (declaration.rate_periods.length < 2) return null

  return (
    <div className="flex flex-col gap-2">
      <h4 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {t('declaration.ratePeriods')}
      </h4>
      <ul className="flex flex-col gap-1 text-sm">
        {declaration.rate_periods.map((period) => (
          <li
            key={`${period.from}-${period.to}`}
            className="flex flex-wrap items-baseline justify-between gap-x-3 text-muted-foreground"
          >
            <span>
              {formatDate(period.from, lang)} → {formatDate(period.to, lang)} (
              {period.days} {t('declaration.ratePeriodDays')})
            </span>
            <span className="tabular-nums text-foreground">
              {formatMoney(period.net_hourly_rate, lang)}
              {t('declaration.perHour')}
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}

// The kilometres a parent drove, and what they are worth. The only figure on the
// card that is typed rather than computed, so it is the only control here.
function Kilometers({
  familyId,
  contractId,
  declaration,
}: {
  familyId: string
  contractId: string
  declaration: MonthlyDeclaration
}) {
  const { t, lang } = useI18n()
  const queryClient = useQueryClient()
  const [kilometers, setKilometers] = useState(declaration.kilometers)
  const [errors, setErrors] = useState<string[]>([])

  const mutation = useMutation({
    mutationFn: () =>
      updateDeclaration(familyId, contractId, declaration.id, { kilometers }),
    onSuccess: async (updated) => {
      setErrors([])
      // Take the backend's normalisation ('42' comes back '42.00') rather than
      // leaving the field showing what was typed.
      setKilometers(updated.kilometers)
      // Only this contract's rows moved, and reading them recomputes and writes
      // every non-frozen row on the backend — so do not sweep the other cards in.
      await queryClient.invalidateQueries({
        queryKey: ['declarations', contractId],
      })
    },
    onError: (error) =>
      setErrors(extractErrorMessages(error, t('declaration.saveError'))),
  })

  // Saving a value the server already holds would be a write for nothing.
  const dirty = kilometers !== declaration.kilometers

  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={`kilometers-${declaration.id}`}>
        {t('declaration.kilometers')}
      </Label>
      <div className="flex items-center gap-2">
        <Input
          id={`kilometers-${declaration.id}`}
          type="number"
          min="0"
          step="0.01"
          inputMode="decimal"
          className="w-32"
          value={kilometers}
          onChange={(e) => setKilometers(e.target.value)}
        />
        <span className="text-sm tabular-nums text-muted-foreground">
          → {formatMoney(declaration.mileage_amount, lang)}
        </span>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={!dirty || mutation.isPending}
          onClick={() => mutation.mutate()}
        >
          {mutation.isPending
            ? t('declaration.saving')
            : t('declaration.saveKilometers')}
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        {t('declaration.kilometersHint')}
      </p>
      <FormErrors messages={errors} />
    </div>
  )
}

// One family's declaration for the month. Every family's is shown — a parent
// wants to see the whole arrangement adds up — but only your own can be written,
// and only while it is a draft.
function DeclarationCard({
  familyId,
  contractId,
  declaration,
}: {
  familyId: string
  contractId: string
  declaration: MonthlyDeclaration
}) {
  const { t, lang } = useI18n()
  const queryClient = useQueryClient()
  const [errors, setErrors] = useState<string[]>([])

  const isOwn = declaration.family === familyId
  const isFiled = declaration.status === 'filed'
  // The one place that decides whether the kilometres control is showing. The
  // mileage row below is its complement, so the two cannot drift apart and
  // leave a declaration — the other family's draft — showing neither.
  const editsKilometers = isOwn && !isFiled

  const fileMutation = useMutation({
    mutationFn: () => fileDeclaration(familyId, contractId, declaration.id),
    onSuccess: async () => {
      setErrors([])
      await queryClient.invalidateQueries({
        queryKey: ['declarations', contractId],
      })
    },
    onError: (error) =>
      setErrors(extractErrorMessages(error, t('declaration.fileError'))),
  })

  const hours: Figure[] = [
    {
      label: t('declaration.normalHours'),
      value: formatHours(declaration.normal_hours, lang),
    },
    {
      label: t('declaration.hours25'),
      value: formatHours(declaration.hours_25, lang),
    },
    {
      label: t('declaration.hours50'),
      value: formatHours(declaration.hours_50, lang),
    },
  ]

  // The optional lines only earn their space when they carry a figure: a zeroed
  // night indemnity on a contract that has no nights is noise between a parent
  // and the number they came for.
  const pay: Figure[] = [
    {
      label: t('declaration.totalAmount'),
      value: formatMoney(declaration.total_amount, lang),
      strong: true,
    },
    ...when(!isZero(declaration.holiday_majoration), {
      label: t('declaration.holidayMajoration'),
      value: formatMoney(declaration.holiday_majoration, lang),
    }),
    ...when(
      declaration.night_count > 0,
      {
        label: t('declaration.nightCount'),
        value: String(declaration.night_count),
      },
      {
        label: t('declaration.nightIndemnity'),
        value: formatMoney(declaration.night_indemnity, lang),
      },
    ),
  ]

  const extras: Figure[] = [
    ...when(!isZero(declaration.transport_amount), {
      label: t('declaration.transportAmount'),
      value: formatMoney(declaration.transport_amount, lang),
    }),
    ...when(!isZero(declaration.benefits_in_kind_amount), {
      label: t('declaration.benefitsInKind'),
      value: formatMoney(declaration.benefits_in_kind_amount, lang),
    }),
    // Whatever has no kilometres control still has to show its mileage: a filed
    // declaration, and the other family's, whether draft or filed.
    ...when(!editsKilometers && !isZero(declaration.mileage_amount), {
      label: t('declaration.mileageAmount'),
      value: formatMoney(declaration.mileage_amount, lang),
    }),
  ]

  const rates: Figure[] = [
    {
      label: t('declaration.netHourlyRate'),
      value: `${formatMoney(declaration.net_hourly_rate, lang)}${t('declaration.perHour')}`,
    },
    ...when(!isZero(declaration.night_presence_rate), {
      label: t('declaration.nightPresenceRate'),
      value: `${formatMoney(declaration.night_presence_rate, lang)}${t('declaration.perHour')}`,
    }),
    ...when(!isZero(declaration.mileage_rate), {
      label: t('declaration.mileageRate'),
      value: `${formatMoney(declaration.mileage_rate, lang)}${t('declaration.perKm')}`,
    }),
  ]

  return (
    <div
      className={cn(
        'flex flex-col gap-4 rounded-md border p-3',
        // Your own is the one you act on; the others are context.
        isOwn && 'border-primary/40 bg-primary/5',
      )}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-medium">
          {declaration.family_name}
          {isOwn && (
            <span className="ml-2 text-xs font-normal text-muted-foreground">
              {t('declaration.yours')}
            </span>
          )}
        </h3>
        <span
          className={cn(
            'rounded-full px-2 py-0.5 text-xs font-medium',
            isFiled
              ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
              : 'bg-muted text-muted-foreground',
          )}
        >
          {isFiled
            ? t('declaration.status.filed')
            : t('declaration.status.draft')}
        </span>
      </div>

      <FigureGroup title={t('declaration.hours')} rows={hours} />
      <FigureGroup title={t('declaration.pay')} rows={pay} />
      <FigureGroup title={t('declaration.extras')} rows={extras} />

      {editsKilometers && (
        <Kilometers
          familyId={familyId}
          contractId={contractId}
          declaration={declaration}
        />
      )}

      <FigureGroup title={t('declaration.rates')} rows={rates} />
      <RatePeriods declaration={declaration} />
      <Warnings warnings={declaration.warnings} />
      <FormErrors messages={errors} />

      {isFiled ? (
        declaration.filed_at && (
          <p className="text-xs text-muted-foreground">
            {t('declaration.filedOn')}{' '}
            {formatDate(declaration.filed_at.slice(0, 10), lang)}
          </p>
        )
      ) : isOwn ? (
        <div className="self-start">
          <ConfirmButton
            variant="default"
            trigger={
              fileMutation.isPending
                ? t('declaration.filing')
                : t('declaration.file')
            }
            title={t('declaration.confirmFileTitle')}
            description={t('declaration.confirmFileDescription')}
            disabled={fileMutation.isPending}
            onConfirm={() => fileMutation.mutate()}
          />
        </div>
      ) : null}
    </div>
  )
}

// One contract's declarations for a month: one card per family sharing it. The
// list endpoint recomputes every draft as it reads, so a schedule edited
// yesterday shows up here rather than lurking until someone files.
export function DeclarationSection({
  familyId,
  contract,
  month,
}: {
  familyId: string
  contract: Contract
  month: string
}) {
  const { t } = useI18n()

  const {
    data: declarations,
    isLoading,
    isError,
  } = useQuery({
    queryKey: ['declarations', contract.id, month],
    queryFn: () => getDeclarations(familyId, contract.id, month),
  })

  return (
    <SectionCard
      title={`${contract.nanny.first_name} ${contract.nanny.last_name}`}
    >
      {isLoading ? (
        <p className="text-sm text-muted-foreground">
          {t('declaration.loading')}
        </p>
      ) : isError ? (
        <p className="text-sm text-destructive">{t('declaration.loadError')}</p>
      ) : declarations && declarations.length > 0 ? (
        <div className="flex flex-col gap-3">
          {declarations.map((declaration) => (
            <DeclarationCard
              key={declaration.id}
              familyId={familyId}
              contractId={contract.id}
              declaration={declaration}
            />
          ))}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">{t('declaration.none')}</p>
      )}
    </SectionCard>
  )
}
