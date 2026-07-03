import { api } from './client'

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
  transport_fee: string
  mileage_rate: string
  benefits_in_kind: string
  minimum_net_hourly_rate: string | null
  below_minimum: boolean
  warnings: string[]
  edited: boolean
}

export interface ContractTermsInput {
  effective_from?: string
  net_hourly_rate: string
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

export interface Contract {
  id: string
  nanny: Nanny
  starting_date: string
  ending_date: string | null
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

const base = (familyId: string) => `/families/${familyId}/contracts/`

export async function getContracts(familyId: string): Promise<Contract[]> {
  const { data } = await api.get<Contract[]>(base(familyId))
  return data
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
