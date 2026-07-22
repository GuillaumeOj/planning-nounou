import {
  type SimulationContractRead,
  type SimulationMonthRead,
  useFamiliesSimulationRetrieveQuery,
} from '@/src/api'
import { formatDate } from '@/src/components/DateField'
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
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from '@/src/components/ui/table'
import { useActiveFamily } from '@/src/hooks/useActiveFamily'
import { useI18n } from '@/src/i18n/I18nContext'
import type { Language } from '@/src/i18n/translations'
import { monthLabel } from '@/src/lib/months'
import { formatMoney } from '@/src/lib/utils'

// The payment-simulation detail: the current année de référence (1 June → 31 May)
// broken down month by month per contract. Each row is a month; each column a
// component the family pays (net wage, transport, kilométrage, benefits in kind, and
// the congés-payés 1/10 rappel that lands on the period's closing month); the footer
// totals every column and the whole period. The figures are the acting family's own
// outlay, priced by the backend — this page only lays them out.

const COMPONENT_KEYS = [
  'net_wage',
  'transport',
  'mileage',
  'benefits_in_kind',
  'paid_leave_rappel',
  'total',
] as const

type ComponentKey = (typeof COMPONENT_KEYS)[number]

// Sum decimal-string money exactly in integer cents, so the footer never drifts by a
// rounding cent the way summing floats would. Returns a "123.45" string for formatMoney.
function sumCents(values: string[]): string {
  const cents = values.reduce(
    (acc, value) => acc + Math.round(Number(value) * 100),
    0,
  )
  return (cents / 100).toFixed(2)
}

function columnTotal(months: SimulationMonthRead[], key: ComponentKey): string {
  return sumCents(months.map((month) => month[key]))
}

function ContractTable({
  contract,
  lang,
}: {
  contract: SimulationContractRead
  lang: Language
}) {
  const { t } = useI18n()
  const headers: Array<{ key: ComponentKey; label: string; strong?: boolean }> =
    [
      { key: 'net_wage', label: t('simulation.col.netWage') },
      { key: 'transport', label: t('simulation.col.transport') },
      { key: 'mileage', label: t('simulation.col.mileage') },
      { key: 'benefits_in_kind', label: t('simulation.col.benefits') },
      { key: 'paid_leave_rappel', label: t('simulation.col.rappel') },
      { key: 'total', label: t('simulation.col.total'), strong: true },
    ]

  return (
    <SectionCard
      title={`${contract.nanny.first_name} ${contract.nanny.last_name}`}
      avatar={
        <PersonAvatar
          name={`${contract.nanny.first_name} ${contract.nanny.last_name}`}
        />
      }
    >
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t('simulation.col.month')}</TableHead>
              {headers.map((header) => (
                <TableHead key={header.key} className="text-right">
                  {header.label}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {contract.months.map((month) => (
              <TableRow key={month.month}>
                <TableCell className="capitalize whitespace-nowrap text-muted-foreground">
                  {monthLabel(month.month, lang)}
                </TableCell>
                {headers.map((header) => (
                  <TableCell
                    key={header.key}
                    className={`text-right tabular-nums ${header.strong ? 'font-medium' : ''}`}
                  >
                    {formatMoney(month[header.key], lang)}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
          <TableFooter>
            <TableRow>
              <TableCell className="font-medium">
                {t('simulation.footerTotal')}
              </TableCell>
              {headers.map((header) => (
                <TableCell
                  key={header.key}
                  className={`text-right tabular-nums ${header.strong ? 'font-semibold' : 'font-medium'}`}
                >
                  {formatMoney(columnTotal(contract.months, header.key), lang)}
                </TableCell>
              ))}
            </TableRow>
          </TableFooter>
        </Table>
      </div>
    </SectionCard>
  )
}

export default function Simulation() {
  const { t, lang } = useI18n()
  const { families, setFamilyId, activeFamilyId } = useActiveFamily()

  const { data, isLoading, isError } = useFamiliesSimulationRetrieveQuery(
    { familyPk: activeFamilyId ?? '' },
    { skip: activeFamilyId === null },
  )

  const contracts = (data?.contracts ?? []).filter((c) => c.months.length > 0)

  return (
    <main className="flex flex-1 flex-col gap-6 p-4 sm:p-10">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
          {t('simulation.title')}
        </h1>
        <p className="text-sm text-muted-foreground">
          {t('simulation.subtitle')}
          {data && (
            <>
              {' '}
              <span className="text-foreground">
                {formatDate(data.period_start, lang)} →{' '}
                {formatDate(data.period_end, lang)}
              </span>
            </>
          )}
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
            <p className="text-sm text-muted-foreground">
              {t('simulation.loading')}
            </p>
          ) : isError ? (
            <p className="text-sm text-destructive">{t('simulation.error')}</p>
          ) : activeFamilyId === null || contracts.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {t('simulation.empty')}
            </p>
          ) : (
            <div className="flex flex-col gap-5">
              {contracts.map((contract) => (
                <ContractTable
                  key={contract.id}
                  contract={contract}
                  lang={lang}
                />
              ))}
            </div>
          )}
        </>
      )}
    </main>
  )
}
