import {
  type DashboardContractRead,
  type PaidLeaveBalanceRead,
  type RecentDeclarationRead,
  useFamiliesDashboardRetrieveQuery,
} from '@/src/api'
import { useAuth } from '@/src/auth/AuthContext'
import { BetaBanner } from '@/src/components/BetaBanner'
import { formatDate } from '@/src/components/DateField'
import { DeclarationStatusBadge } from '@/src/components/DeclarationStatusBadge'
import { type Figure, FigureGroup } from '@/src/components/FigureGroup'
import { PersonAvatar } from '@/src/components/PersonAvatar'
import { SectionCard } from '@/src/components/SectionCard'
import { Label } from '@/src/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/src/components/ui/select'
import { useActiveFamily } from '@/src/hooks/useActiveFamily'
import { useI18n } from '@/src/i18n/I18nContext'
import { monthLabel } from '@/src/lib/months'
import { formatDays, formatMoney } from '@/src/lib/utils'

// The dashboard: the family's contracts, each with the nanny's paid-leave
// standing and a run of the recent months' declarations. It picks the acting
// family (like the planning and the declarations pages) and shows what came back
// — the figures are all priced on the backend, and the whole page is one request
// (GET /families/{id}/dashboard/) rather than a fan-out per contract and month.

// The current month and the three before it: what a parent glances at to see the
// last few months are declared and this one is in hand.
const RECENT_MONTHS = 4

// The nanny's congés-payés standing for the current reference period: the agreed
// total, what has accrued so far, what has been taken, and what is left.
function PaidLeave({ balance }: { balance: PaidLeaveBalanceRead }) {
  const { t, lang } = useI18n()
  const days = t('home.paidLeave.days')
  // The unit rides on each value so the shared FigureGroup renders the row as-is.
  const figure = (key: keyof PaidLeaveBalanceRead) =>
    `${formatDays(balance[key], lang)} ${days}`
  const rows: Figure[] = [
    { label: t('home.paidLeave.total'), value: figure('total_days') },
    { label: t('home.paidLeave.accrued'), value: figure('accrued') },
    { label: t('home.paidLeave.taken'), value: figure('taken') },
    {
      label: t('home.paidLeave.remaining'),
      value: figure('remaining'),
      strong: true,
    },
  ]
  return (
    <FigureGroup
      title={t('home.paidLeave.title')}
      rows={rows}
      aside={
        <span className="text-xs text-muted-foreground">
          {formatDate(balance.period_start, lang)} →{' '}
          {formatDate(balance.period_end, lang)}
        </span>
      }
    />
  )
}

// The recent months' declarations for the acting family: net salary and status
// per month, so a parent sees at a glance which are filed and which still need
// doing. The rows are computed and scoped by the backend — only months the
// contract was live for, most recent first.
function RecentDeclarations({
  declarations,
}: {
  declarations: RecentDeclarationRead[]
}) {
  const { t, lang } = useI18n()

  return (
    <div className="flex flex-col gap-2">
      <h4 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {t('home.declarations.title')}
      </h4>
      <ul className="flex flex-col divide-y text-sm">
        {declarations.length === 0 && (
          <li className="py-2 text-xs text-muted-foreground">
            {t('home.declarations.nothing')}
          </li>
        )}
        {declarations.map((declaration) => (
          <li
            key={declaration.month}
            className="flex items-center justify-between gap-3 py-2"
          >
            <span className="capitalize text-muted-foreground">
              {monthLabel(declaration.month, lang)}
            </span>
            <span className="flex items-center gap-2">
              <span className="tabular-nums font-medium">
                {formatMoney(declaration.net_salary, lang)}
              </span>
              <DeclarationStatusBadge status={declaration.status} />
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}

function ContractCard({ contract }: { contract: DashboardContractRead }) {
  return (
    <SectionCard
      title={`${contract.nanny.first_name} ${contract.nanny.last_name}`}
      avatar={
        <PersonAvatar
          name={`${contract.nanny.first_name} ${contract.nanny.last_name}`}
        />
      }
    >
      <PaidLeave balance={contract.paid_leave_balance} />
      <RecentDeclarations declarations={contract.recent_declarations} />
    </SectionCard>
  )
}

export default function Home() {
  const { user } = useAuth()
  const { t } = useI18n()
  const { families, setFamilyId, activeFamilyId } = useActiveFamily()

  // One request pulls every contract with its paid-leave balance and recent
  // declarations already computed — no per-contract or per-month fan-out.
  const {
    data: dashboard,
    isLoading,
    isError,
  } = useFamiliesDashboardRetrieveQuery(
    { familyPk: activeFamilyId ?? '', months: RECENT_MONTHS },
    { skip: activeFamilyId === null },
  )

  const contractList = dashboard?.contracts ?? []

  return (
    <main className="flex flex-1 flex-col gap-6 p-4 sm:p-10">
      <BetaBanner />
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
          {t('home.title')}
        </h1>
        <p className="break-words text-sm text-muted-foreground">
          {t('home.signedInAs')}{' '}
          <strong className="text-foreground">{user?.email}</strong>
        </p>
      </div>

      {!families || families.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {t('contract.noFamilies')}
        </p>
      ) : (
        <>
          {families.length > 1 && (
            <div className="flex w-full max-w-xs flex-col gap-2">
              <Label htmlFor="acting-family">
                {t('contract.selectFamily')}
              </Label>
              <Select value={activeFamilyId ?? ''} onValueChange={setFamilyId}>
                <SelectTrigger id="acting-family">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {families.map((f) => (
                    <SelectItem key={f.id} value={f.id}>
                      {f.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {isLoading ? (
            <p className="text-sm text-muted-foreground">{t('home.loading')}</p>
          ) : isError ? (
            <p className="text-sm text-destructive">{t('home.loadError')}</p>
          ) : activeFamilyId === null || contractList.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {t('home.noContracts')}
            </p>
          ) : (
            // Card grid (brand guide p.6): contracts flow into columns on wider
            // screens, one per column on a phone.
            <div className="grid grid-cols-[repeat(auto-fill,minmax(320px,1fr))] gap-5">
              {contractList.map((contract) => (
                <ContractCard key={contract.id} contract={contract} />
              ))}
            </div>
          )}
        </>
      )}
    </main>
  )
}
