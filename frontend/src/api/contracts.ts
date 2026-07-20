import { api } from '@/src/api/client'

export interface Nanny {
  id: string
  first_name: string
  last_name: string
}

// A compensation snapshot. Decimal fields are strings (DRF serializes them so).
export interface ContractTerms {
  id: string
  effective_from: string
  effective_to: string | null
  net_hourly_rate: string
  night_presence_rate: string
  transport_fee: string
  mileage_rate: string
  benefits_in_kind: string
  minimum_net_hourly_rate: string | null
  below_minimum: boolean
  warnings: string[]
  edited: boolean
  // Display name of whoever last saved this snapshot; null if that account is
  // gone. Read-only — the server pins it to the acting user.
  created_by_name: string | null
}

export interface ContractTermsInput {
  effective_from?: string
  net_hourly_rate: string
  night_presence_rate?: string
  transport_fee?: string
  mileage_rate?: string
  benefits_in_kind?: string
}

export interface ScheduleBlock {
  id?: string
  weekday: number
  start_time: string
  end_time: string
}

export interface ContractSchedule {
  id: string
  effective_from: string
  effective_to: string | null
  weekly_hours: number
  edited: boolean
  // Display name of whoever last saved this snapshot; null if that account is gone.
  created_by_name: string | null
  blocks: ScheduleBlock[]
}

export interface ContractScheduleInput {
  effective_from?: string
  blocks: { weekday: number; start_time: string; end_time: string }[]
}

export interface ContractFamily {
  id: string
  name: string
  is_originator: boolean
}

// How a moment's hours divide between the families whose children are there.
// `equal` splits it in half between the families present; `by_children` weighs
// each family by how many of its children are there. A genuine choice the
// families make — two families with 2 and 1 children may still agree on halves —
// so it is stored, not derived.
export type SplitMethod = 'equal' | 'by_children'

export interface Contract {
  id: string
  nanny: Nanny
  starting_date: string
  ending_date: string | null
  split_method: SplitMethod
  paid_leave_days: number
  notes: string
  families: ContractFamily[]
  current_terms: ContractTerms | null
  current_schedule: ContractSchedule | null
}

export interface ContractInput {
  // Either reuse an existing nanny (nanny_id) or create one from names.
  nanny_id?: string
  first_name?: string
  last_name?: string
  starting_date: string
  ending_date?: string | null
  split_method?: SplitMethod
  paid_leave_days?: number
  notes?: string
}

export interface ContractInvitation {
  id: string
  email: string
  status: string
  token: string
  created_at: string
  expires_at: string
}

// A pending contract invitation addressed to the logged-in user (their inbox).
export interface MyContractInvitation {
  id: string
  nanny_first_name: string
  nanny_last_name: string
  token: string
  expires_at: string
}

export interface MinimumWage {
  net_hourly_rate: string | null
}

// The recommended net-hourly minimum in force on `on` (YYYY-MM-DD, default today).
export async function getMinimumWage(on?: string): Promise<MinimumWage> {
  const { data } = await api.get<MinimumWage>('/minimum-wage/', {
    params: on ? { on } : undefined,
  })
  return data
}

// The nanny's congés-payés standing for the current reference period (1 June–31
// May). Days are DRF decimal strings; `remaining` can be negative when leave is
// booked ahead of what has accrued. Computed on the backend, never stored.
export interface PaidLeaveBalance {
  period_start: string
  period_end: string
  total_days: string
  accrued: string
  taken: string
  remaining: string
}

const base = (familyId: string) => `/families/${familyId}/contracts/`

export async function getContracts(familyId: string): Promise<Contract[]> {
  const { data } = await api.get<Contract[]>(base(familyId))
  return data
}

export async function getPaidLeaveBalance(
  familyId: string,
  contractId: string,
): Promise<PaidLeaveBalance> {
  const { data } = await api.get<PaidLeaveBalance>(
    `${base(familyId)}${contractId}/paid-leave/`,
  )
  return data
}

// Query key + fetcher in one place, so the home dashboard and anything else that
// wants the balance share a cache entry rather than hand-matching the key.
export function paidLeaveQueryOptions(familyId: string, contractId: string) {
  return {
    queryKey: ['paid-leave', contractId] as const,
    queryFn: () => getPaidLeaveBalance(familyId, contractId),
  }
}

export async function createContract(
  familyId: string,
  input: ContractInput,
): Promise<Contract> {
  const { data } = await api.post<Contract>(base(familyId), input)
  return data
}

export async function updateContract(
  familyId: string,
  id: string,
  input: Partial<ContractInput>,
): Promise<Contract> {
  const { data } = await api.patch<Contract>(`${base(familyId)}${id}/`, input)
  return data
}

export async function deleteContract(
  familyId: string,
  id: string,
): Promise<void> {
  await api.delete(`${base(familyId)}${id}/`)
}

// Attach a family the acting user also manages (an unclaimed one they set up, or
// one they own) directly to the contract — no email invitation. `familyId` is the
// acting family; `targetFamilyId` the one being joined.
export async function attachContractFamily(
  familyId: string,
  contractId: string,
  targetFamilyId: string,
): Promise<Contract> {
  const { data } = await api.post<Contract>(
    `${base(familyId)}${contractId}/attach-family/`,
    { family_id: targetFamilyId },
  )
  return data
}

export async function getContractTerms(
  familyId: string,
  contractId: string,
): Promise<ContractTerms[]> {
  const { data } = await api.get<ContractTerms[]>(
    `${base(familyId)}${contractId}/terms/`,
  )
  return data
}

export async function createContractTerms(
  familyId: string,
  contractId: string,
  input: ContractTermsInput,
): Promise<ContractTerms> {
  const { data } = await api.post<ContractTerms>(
    `${base(familyId)}${contractId}/terms/`,
    input,
  )
  return data
}

export async function updateContractTerms(
  familyId: string,
  contractId: string,
  termsId: string,
  input: ContractTermsInput,
): Promise<ContractTerms> {
  const { data } = await api.patch<ContractTerms>(
    `${base(familyId)}${contractId}/terms/${termsId}/`,
    input,
  )
  return data
}

export async function deleteContractTerms(
  familyId: string,
  contractId: string,
  termsId: string,
): Promise<void> {
  await api.delete(`${base(familyId)}${contractId}/terms/${termsId}/`)
}

export async function getContractSchedules(
  familyId: string,
  contractId: string,
): Promise<ContractSchedule[]> {
  const { data } = await api.get<ContractSchedule[]>(
    `${base(familyId)}${contractId}/schedule/`,
  )
  return data
}

export async function createContractSchedule(
  familyId: string,
  contractId: string,
  input: ContractScheduleInput,
): Promise<ContractSchedule> {
  const { data } = await api.post<ContractSchedule>(
    `${base(familyId)}${contractId}/schedule/`,
    input,
  )
  return data
}

export async function updateContractSchedule(
  familyId: string,
  contractId: string,
  scheduleId: string,
  input: ContractScheduleInput,
): Promise<ContractSchedule> {
  const { data } = await api.patch<ContractSchedule>(
    `${base(familyId)}${contractId}/schedule/${scheduleId}/`,
    input,
  )
  return data
}

export async function deleteContractSchedule(
  familyId: string,
  contractId: string,
  scheduleId: string,
): Promise<void> {
  await api.delete(`${base(familyId)}${contractId}/schedule/${scheduleId}/`)
}

export async function getContractInvitations(
  familyId: string,
  contractId: string,
): Promise<ContractInvitation[]> {
  const { data } = await api.get<ContractInvitation[]>(
    `${base(familyId)}${contractId}/invitations/`,
  )
  return data
}

export async function createContractInvitation(
  familyId: string,
  contractId: string,
  email: string,
): Promise<ContractInvitation> {
  const { data } = await api.post<ContractInvitation>(
    `${base(familyId)}${contractId}/invitations/`,
    { email },
  )
  return data
}

export async function revokeContractInvitation(
  familyId: string,
  contractId: string,
  invitationId: string,
): Promise<void> {
  await api.delete(
    `${base(familyId)}${contractId}/invitations/${invitationId}/`,
  )
}

// Contract invitations addressed to the logged-in user (inbox notification).
export async function getMyContractInvitations(): Promise<
  MyContractInvitation[]
> {
  const { data } = await api.get<MyContractInvitation[]>(
    '/contract-invitations/',
  )
  return data
}

// Accept a shared contract, attaching one of the user's families to it.
export async function acceptContractInvitation(
  token: string,
  familyId: string,
): Promise<Contract> {
  const { data } = await api.post<Contract>(
    `/contract-invitations/${token}/accept/`,
    { family_id: familyId },
  )
  return data
}

export async function declineContractInvitation(token: string): Promise<void> {
  await api.post(`/contract-invitations/${token}/decline/`)
}
