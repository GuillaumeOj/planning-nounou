import { api } from '@/src/api/client'

// The pay side of a contract: which children it covers and when they are there,
// the hours worked beyond the planning, and what each family declares to
// pajemploi. The rules behind all of it are in docs/shared-care-pay.md.
//
// Every decimal is a DRF decimal string, never a number: money and hours are
// exact on the backend and parsing them into a float here would throw that away.

// --- which children, and when ------------------------------------------------

export interface ContractChildWindow {
  id?: string
  weekday: number
  start_time: string
  end_time: string
}

// A child covered by the contract. `windows` EMPTY is meaningful and is the
// common case: the child is there whenever the nanny works. Windows narrow them
// to part of a day — and a child with windows on Mon/Tue/Thu/Fri is *absent* on
// Wednesday, which is how a family's day off is expressed.
export interface ContractChild {
  id: string
  child: string
  first_name: string
  family_id: string
  windows: ContractChildWindow[]
}

export interface ContractChildInput {
  child: string
  windows?: Omit<ContractChildWindow, 'id'>[]
}

const childrenBase = (familyId: string, contractId: string) =>
  `/families/${familyId}/contracts/${contractId}/children/`

export async function getContractChildren(
  familyId: string,
  contractId: string,
): Promise<ContractChild[]> {
  const { data } = await api.get<ContractChild[]>(
    childrenBase(familyId, contractId),
  )
  return data
}

export async function createContractChild(
  familyId: string,
  contractId: string,
  input: ContractChildInput,
): Promise<ContractChild> {
  const { data } = await api.post<ContractChild>(
    childrenBase(familyId, contractId),
    input,
  )
  return data
}

export async function updateContractChild(
  familyId: string,
  contractId: string,
  id: string,
  input: Partial<ContractChildInput>,
): Promise<ContractChild> {
  const { data } = await api.patch<ContractChild>(
    `${childrenBase(familyId, contractId)}${id}/`,
    input,
  )
  return data
}

export async function deleteContractChild(
  familyId: string,
  contractId: string,
  id: string,
): Promise<void> {
  await api.delete(`${childrenBase(familyId, contractId)}${id}/`)
}

// --- hours beyond the planning -----------------------------------------------

// Three kinds, three prices. `effective` adds to the week and can tip into
// overtime; `night_presence` is an indemnity paid by the hour and does NOT count
// toward the 40h week; `presence_responsable` counts as two thirds of an hour and
// is forbidden on a shared contract (CCN 3239 art. 137.1) — the API rejects it.
export type ExceptionalKind =
  | 'effective'
  | 'presence_responsable'
  | 'night_presence'

export interface ExceptionalHours {
  id: string
  // Who filed it. Read-only: the backend pins it to the acting family. A family
  // sees its own entries and every family's SHARED ones (so it can be prompted to
  // add its half), and can only ever write its own.
  family: string
  kind: ExceptionalKind
  // Care both families needed at once, split by the contract's usual rule, rather
  // than this family's own extra hour (which it pays whole). Only meaningful on a
  // shared contract.
  is_shared: boolean
  start_date: string
  start_time: string
  // Not always start_date: a night runs past midnight.
  end_date: string
  end_time: string
  // Times the nanny was woken. From the second, the indemnity rises from a
  // quarter of the equivalent salary to a third — so leaving it at 0 underpays.
  interventions: number
  notes: string
}

export interface ExceptionalHoursInput {
  kind: ExceptionalKind
  is_shared?: boolean
  start_date: string
  start_time: string
  end_date: string
  end_time: string
  interventions?: number
  notes?: string
}

const hoursBase = (familyId: string, contractId: string) =>
  `/families/${familyId}/contracts/${contractId}/exceptional-hours/`

export async function getExceptionalHours(
  familyId: string,
  contractId: string,
): Promise<ExceptionalHours[]> {
  const { data } = await api.get<ExceptionalHours[]>(
    hoursBase(familyId, contractId),
  )
  return data
}

// Query key + fetcher in one place, shared by the hours section and the calendar
// marks so they read from a single cache entry rather than hand-matched keys.
export function exceptionalHoursQueryOptions(
  familyId: string,
  contractId: string,
) {
  return {
    // familyId is part of the key: the read returns this family's own entries
    // plus every family's *shared* ones, and the section classifies them by
    // `entry.family === familyId`. A user acting for both families of a shared
    // contract must not read one family's own/prompt split under the other.
    // Invalidations key on ['exceptional-hours', contractId] and still prefix-match.
    queryKey: ['exceptional-hours', contractId, familyId] as const,
    queryFn: () => getExceptionalHours(familyId, contractId),
  }
}

export async function createExceptionalHours(
  familyId: string,
  contractId: string,
  input: ExceptionalHoursInput,
): Promise<ExceptionalHours> {
  const { data } = await api.post<ExceptionalHours>(
    hoursBase(familyId, contractId),
    input,
  )
  return data
}

export async function updateExceptionalHours(
  familyId: string,
  contractId: string,
  id: string,
  input: Partial<ExceptionalHoursInput>,
): Promise<ExceptionalHours> {
  const { data } = await api.patch<ExceptionalHours>(
    `${hoursBase(familyId, contractId)}${id}/`,
    input,
  )
  return data
}

export async function deleteExceptionalHours(
  familyId: string,
  contractId: string,
  id: string,
): Promise<void> {
  await api.delete(`${hoursBase(familyId, contractId)}${id}/`)
}

// --- a child there outside their usual window --------------------------------

// Not the same thing as exceptional hours, and the difference is the point: the
// nanny works no longer for it — she is already there for the others — so the
// month's total does not move. Only the split between the families does.
export interface ExceptionalPresence {
  id: string
  child: string
  first_name: string
  date: string
  start_time: string
  end_time: string
  notes: string
}

export interface ExceptionalPresenceInput {
  child: string
  date: string
  start_time: string
  end_time: string
  notes?: string
}

const presenceBase = (familyId: string, contractId: string) =>
  `/families/${familyId}/contracts/${contractId}/exceptional-presences/`

export async function getExceptionalPresences(
  familyId: string,
  contractId: string,
): Promise<ExceptionalPresence[]> {
  const { data } = await api.get<ExceptionalPresence[]>(
    presenceBase(familyId, contractId),
  )
  return data
}

// Query key + fetcher in one place, shared by the presence section and the
// calendar marks (a single cache entry rather than a hand-matched key).
export function exceptionalPresencesQueryOptions(
  familyId: string,
  contractId: string,
) {
  return {
    queryKey: ['exceptional-presences', contractId] as const,
    queryFn: () => getExceptionalPresences(familyId, contractId),
  }
}

export async function createExceptionalPresence(
  familyId: string,
  contractId: string,
  input: ExceptionalPresenceInput,
): Promise<ExceptionalPresence> {
  const { data } = await api.post<ExceptionalPresence>(
    presenceBase(familyId, contractId),
    input,
  )
  return data
}

export async function updateExceptionalPresence(
  familyId: string,
  contractId: string,
  id: string,
  input: Partial<ExceptionalPresenceInput>,
): Promise<ExceptionalPresence> {
  const { data } = await api.patch<ExceptionalPresence>(
    `${presenceBase(familyId, contractId)}${id}/`,
    input,
  )
  return data
}

export async function deleteExceptionalPresence(
  familyId: string,
  contractId: string,
  id: string,
): Promise<void> {
  await api.delete(`${presenceBase(familyId, contractId)}${id}/`)
}

// --- the declaration ---------------------------------------------------------

// Where a number comes from: the article, its URL, and the verbatim French. The
// UI should show this rather than the bare code — a parent is about to type these
// figures into pajemploi and deserves to check them against the convention rather
// than take our word.
export interface WarningSource {
  ref: string
  url: string
  quote: string
}

export interface DeclarationWarning {
  code: string
  source: WarningSource | null
}

// One period of the month priced at one rate. Almost always a single entry; a
// mid-month avenant makes total != hours x rate, and this is what lets a parent
// reproduce the figure anyway.
export interface RatePeriod {
  from: string
  to: string
  days: number
  net_hourly_rate: string
  night_presence_rate: string
  transport_fee: string
  mileage_rate: string
  benefits_in_kind: string
}

export type DeclarationStatus = 'draft' | 'filed'

// What one family types into pajemploi for one month. A draft is recomputed from
// live data on every read; filing freezes it forever.
export interface MonthlyDeclaration {
  id: string
  family: string
  family_name: string
  month: string
  status: DeclarationStatus
  normal_hours: string
  hours_25: string
  hours_50: string
  // pajemploi's "salaire net": the declared hours priced, and nothing else.
  net_salary: string
  // net_salary plus the night indemnity and any worked-holiday majoration. The
  // advantages below are their own pajemploi fields and are not folded in here.
  total_amount: string
  transport_amount: string
  benefits_in_kind_amount: string
  // The only figure a parent types here; everything else is computed.
  kilometers: string
  mileage_amount: string
  night_count: number
  night_indemnity: string
  holiday_majoration: string
  net_hourly_rate: string
  night_presence_rate: string
  mileage_rate: string
  rate_periods: RatePeriod[]
  warnings: DeclarationWarning[]
  computed_at: string
  filed_at: string | null
  // A filed declaration stays editable in place until `editable_until` (the end
  // of the month two months after the one it covers); after that it locks. A
  // draft is always editable. The UI shows the kilometres control and the
  // deadline off these rather than off `status` alone.
  is_editable: boolean
  editable_until: string
}

const declarationsBase = (familyId: string, contractId: string) =>
  `/families/${familyId}/contracts/${contractId}/declarations/`

// `month` is "YYYY-MM". Listing recomputes every family's draft, so a schedule
// edited yesterday shows up here rather than lurking.
export async function getDeclarations(
  familyId: string,
  contractId: string,
  month: string,
): Promise<MonthlyDeclaration[]> {
  const { data } = await api.get<MonthlyDeclaration[]>(
    declarationsBase(familyId, contractId),
    { params: { month } },
  )
  return data
}

export async function updateDeclaration(
  familyId: string,
  contractId: string,
  id: string,
  input: { kilometers: string },
): Promise<MonthlyDeclaration> {
  const { data } = await api.patch<MonthlyDeclaration>(
    `${declarationsBase(familyId, contractId)}${id}/`,
    input,
  )
  return data
}

export async function fileDeclaration(
  familyId: string,
  contractId: string,
  id: string,
): Promise<MonthlyDeclaration> {
  const { data } = await api.post<MonthlyDeclaration>(
    `${declarationsBase(familyId, contractId)}${id}/file/`,
    {},
  )
  return data
}
