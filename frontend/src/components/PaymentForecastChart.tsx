import { format } from 'date-fns'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import {
  type SimulationContractRead,
  useFamiliesSimulationRetrieveQuery,
} from '@/src/api'
import { SectionCard } from '@/src/components/SectionCard'
import { useI18n } from '@/src/i18n/I18nContext'
import type { Language } from '@/src/i18n/translations'
import { toMonthParam } from '@/src/lib/months'
import { formatMoney, localeFor } from '@/src/lib/utils'

// The 12-month payment forecast on Home: a stacked bar per month, one coloured
// segment per nanny, so a family sees at a glance what it will pay each month for
// the year ahead and how the contracts add up. The figures are the acting family's
// own outlay, priced by the backend simulation (net wage + reimbursements + benefits
// in kind, and the congés-payés 1/10 rappel on the reference period's closing month).

// The theme's categorical palette (index.css, light + dark). Series cycle through it.
const SERIES_COLORS = [
  'var(--chart-1)',
  'var(--chart-2)',
  'var(--chart-3)',
  'var(--chart-4)',
  'var(--chart-5)',
]

function nannyName(contract: SimulationContractRead): string {
  return `${contract.nanny.first_name} ${contract.nanny.last_name}`.trim()
}

// The legend/series label for a contract id: the nanny's name, or the id itself if
// the contract is gone. Named (not inlined) so it can be exercised without recharts,
// which never invokes the legend formatter under jsdom.
export function legendLabel(
  contracts: SimulationContractRead[],
  value: string,
): string {
  const contract = contracts.find((c) => c.id === value)
  return contract ? nannyName(contract) : value
}

// A "YYYY-MM" to a short axis tick, e.g. "juil." — the tooltip carries the full label.
export function shortMonth(month: string, lang: Language): string {
  const [year, m] = month.split('-').map(Number)
  return format(new Date(year, m - 1, 1), 'LLL', { locale: localeFor(lang) })
}

export function fullMonth(month: string, lang: Language): string {
  const [year, m] = month.split('-').map(Number)
  return format(new Date(year, m - 1, 1), 'LLLL yyyy', {
    locale: localeFor(lang),
  })
}

// A compact currency tick for the axis: "1,5 k €" rather than "€1,500.00".
export function compactMoney(value: number, lang: Language): string {
  return new Intl.NumberFormat(lang, {
    style: 'currency',
    currency: 'EUR',
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(value)
}

type Row = { month: string } & Record<string, number | string>

// The API shape (per contract, a list of months) pivoted to what a stacked chart
// wants: one row per month, each contract a numeric key on it. Months are the union
// across contracts, so a contract that starts mid-window simply contributes 0 before.
export function toRows(contracts: SimulationContractRead[]): Row[] {
  const months = [
    ...new Set(contracts.flatMap((c) => c.months.map((m) => m.month))),
  ].sort()
  return months.map((month) => {
    const row: Row = { month }
    for (const contract of contracts) {
      const entry = contract.months.find((m) => m.month === month)
      row[contract.id] = entry ? Number(entry.total) : 0
    }
    return row
  })
}

// Recharts injects `active`/`payload`/`label` at runtime; in v3 they are not on the
// public props type, so we declare the slice we read ourselves.
type TooltipEntry = {
  dataKey?: string | number
  value?: number
  color?: string
}

export function ForecastTooltip({
  active,
  payload,
  label,
  contracts,
  lang,
}: {
  active?: boolean
  payload?: TooltipEntry[]
  label?: string | number
  contracts: SimulationContractRead[]
  lang: Language
}) {
  const { t } = useI18n()
  if (!active || !payload?.length) return null
  const nameById = new Map(contracts.map((c) => [c.id, nannyName(c)]))
  const total = payload.reduce((sum, item) => sum + (item.value ?? 0), 0)
  return (
    <div className="rounded-lg border bg-popover p-3 text-sm shadow-md">
      <p className="mb-1.5 font-medium capitalize">
        {fullMonth(String(label), lang)}
      </p>
      <ul className="flex flex-col gap-1">
        {payload.map((item) => (
          <li key={item.dataKey} className="flex items-center gap-2">
            <span
              aria-hidden="true"
              className="size-2.5 rounded-[2px]"
              style={{ backgroundColor: item.color }}
            />
            <span className="text-muted-foreground">
              {nameById.get(String(item.dataKey))}
            </span>
            <span className="ml-auto tabular-nums font-medium">
              {formatMoney(String(item.value ?? 0), lang)}
            </span>
          </li>
        ))}
      </ul>
      <div className="mt-1.5 flex items-center justify-between gap-4 border-t pt-1.5">
        <span className="text-muted-foreground">
          {t('home.forecast.total')}
        </span>
        <span className="tabular-nums font-semibold">
          {formatMoney(String(total), lang)}
        </span>
      </div>
    </div>
  )
}

export function PaymentForecastChart({ familyId }: { familyId: string }) {
  const { t, lang } = useI18n()
  // A lone `from` rolls a year forward on the backend: this month through +11.
  const from = toMonthParam(new Date())
  const { data, isLoading, isError } = useFamiliesSimulationRetrieveQuery(
    { familyPk: familyId, from },
    { skip: !familyId },
  )

  const contracts = (data?.contracts ?? []).filter((c) => c.months.length > 0)
  const rows = toRows(contracts)

  return (
    <SectionCard title={t('home.forecast.title')}>
      {isLoading ? (
        <p className="text-sm text-muted-foreground">
          {t('home.forecast.loading')}
        </p>
      ) : isError ? (
        <p className="text-sm text-destructive">{t('home.forecast.error')}</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {t('home.forecast.empty')}
        </p>
      ) : (
        <div className="h-72 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              accessibilityLayer
              data={rows}
              margin={{ top: 8, right: 8, bottom: 0, left: 8 }}
            >
              <CartesianGrid vertical={false} stroke="var(--border)" />
              <XAxis
                dataKey="month"
                tickFormatter={(m: string) => shortMonth(m, lang)}
                tickLine={false}
                axisLine={false}
                tick={{ fill: 'var(--muted-foreground)', fontSize: 12 }}
                className="capitalize"
              />
              <YAxis
                tickFormatter={(v: number) => compactMoney(v, lang)}
                tickLine={false}
                axisLine={false}
                width={64}
                tick={{ fill: 'var(--muted-foreground)', fontSize: 12 }}
              />
              <Tooltip
                cursor={{ fill: 'var(--muted)', opacity: 0.4 }}
                content={<ForecastTooltip contracts={contracts} lang={lang} />}
              />
              <Legend
                formatter={(value: string) => legendLabel(contracts, value)}
              />
              {contracts.map((contract, i) => (
                <Bar
                  key={contract.id}
                  dataKey={contract.id}
                  name={contract.id}
                  stackId="pay"
                  fill={SERIES_COLORS[i % SERIES_COLORS.length]}
                  radius={
                    i === contracts.length - 1 ? [4, 4, 0, 0] : [0, 0, 0, 0]
                  }
                />
              ))}
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </SectionCard>
  )
}
