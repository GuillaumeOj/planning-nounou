import { api } from './client'

export interface Nanny {
  id: number
  first_name: string
  last_name: string
}

// A compensation snapshot. Decimal fields are strings (DRF serializes them so).
export interface ContractTerms {
  id: number
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
  id?: number
  weekday: number
  start_time: string
  end_time: string
}

export interface ContractSchedule {
  id: number
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
  id: number
  name: string
  is_originator: boolean
}

export interface Contract {
  id: number
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
  nanny_id?: number
  first_name?: string
  last_name?: string
  starting_date: string
  ending_date?: string | null
  paid_leave_days?: number
  notes?: string
}

export interface ContractInvitation {
  id: number
  email: string
  status: string
  token: string
  created_at: string
  expires_at: string
}

// A pending contract invitation addressed to the logged-in user (their inbox).
export interface MyContractInvitation {
  id: number
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

const base = (familyId: number) => `/families/${familyId}/contracts/`

export async function getContracts(familyId: number): Promise<Contract[]> {
  const { data } = await api.get<Contract[]>(base(familyId))
  return data
}

export async function createContract(
  familyId: number,
  input: ContractInput,
): Promise<Contract> {
  const { data } = await api.post<Contract>(base(familyId), input)
  return data
}

export async function updateContract(
  familyId: number,
  id: number,
  input: Partial<ContractInput>,
): Promise<Contract> {
  const { data } = await api.patch<Contract>(`${base(familyId)}${id}/`, input)
  return data
}

export async function deleteContract(
  familyId: number,
  id: number,
): Promise<void> {
  await api.delete(`${base(familyId)}${id}/`)
}

export async function getContractTerms(
  familyId: number,
  contractId: number,
): Promise<ContractTerms[]> {
  const { data } = await api.get<ContractTerms[]>(
    `${base(familyId)}${contractId}/terms/`,
  )
  return data
}

export async function createContractTerms(
  familyId: number,
  contractId: number,
  input: ContractTermsInput,
): Promise<ContractTerms> {
  const { data } = await api.post<ContractTerms>(
    `${base(familyId)}${contractId}/terms/`,
    input,
  )
  return data
}

export async function updateContractTerms(
  familyId: number,
  contractId: number,
  termsId: number,
  input: ContractTermsInput,
): Promise<ContractTerms> {
  const { data } = await api.patch<ContractTerms>(
    `${base(familyId)}${contractId}/terms/${termsId}/`,
    input,
  )
  return data
}

export async function deleteContractTerms(
  familyId: number,
  contractId: number,
  termsId: number,
): Promise<void> {
  await api.delete(`${base(familyId)}${contractId}/terms/${termsId}/`)
}

export async function getContractSchedules(
  familyId: number,
  contractId: number,
): Promise<ContractSchedule[]> {
  const { data } = await api.get<ContractSchedule[]>(
    `${base(familyId)}${contractId}/schedule/`,
  )
  return data
}

export async function createContractSchedule(
  familyId: number,
  contractId: number,
  input: ContractScheduleInput,
): Promise<ContractSchedule> {
  const { data } = await api.post<ContractSchedule>(
    `${base(familyId)}${contractId}/schedule/`,
    input,
  )
  return data
}

export async function updateContractSchedule(
  familyId: number,
  contractId: number,
  scheduleId: number,
  input: ContractScheduleInput,
): Promise<ContractSchedule> {
  const { data } = await api.patch<ContractSchedule>(
    `${base(familyId)}${contractId}/schedule/${scheduleId}/`,
    input,
  )
  return data
}

export async function deleteContractSchedule(
  familyId: number,
  contractId: number,
  scheduleId: number,
): Promise<void> {
  await api.delete(`${base(familyId)}${contractId}/schedule/${scheduleId}/`)
}

export async function getContractInvitations(
  familyId: number,
  contractId: number,
): Promise<ContractInvitation[]> {
  const { data } = await api.get<ContractInvitation[]>(
    `${base(familyId)}${contractId}/invitations/`,
  )
  return data
}

export async function createContractInvitation(
  familyId: number,
  contractId: number,
  email: string,
): Promise<ContractInvitation> {
  const { data } = await api.post<ContractInvitation>(
    `${base(familyId)}${contractId}/invitations/`,
    { email },
  )
  return data
}

export async function revokeContractInvitation(
  familyId: number,
  contractId: number,
  invitationId: number,
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
  familyId: number,
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
