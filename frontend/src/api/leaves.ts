import { api } from '@/src/api/client'

export type LeaveType = 'paid' | 'unpaid' | 'sickness' | 'maternity'
export type LeavePortion = 'full_day' | 'half_day' | 'hourly'

// A nanny's day(s) off under a contract. `hours` is a DRF decimal string (or
// null) and only set for an hourly (unpaid) leave.
export interface Leave {
  id: string
  leave_type: LeaveType
  start_date: string
  end_date: string
  portion: LeavePortion
  hours: string | null
  notes: string
}

export interface LeaveInput {
  leave_type: LeaveType
  start_date: string
  end_date: string
  portion: LeavePortion
  hours?: string | null
  notes?: string
}

const base = (familyId: string, contractId: string) =>
  `/families/${familyId}/contracts/${contractId}/leaves/`

export async function getLeaves(
  familyId: string,
  contractId: string,
): Promise<Leave[]> {
  const { data } = await api.get<Leave[]>(base(familyId, contractId))
  return data
}

// The query key and fetcher in one place, so every consumer — the section that
// edits leaves and the calendar that only marks them — shares a cache entry
// instead of hand-matching the key in two files.
export function leavesQueryOptions(familyId: string, contractId: string) {
  return {
    queryKey: ['contract-leaves', contractId] as const,
    queryFn: () => getLeaves(familyId, contractId),
  }
}

export async function createLeave(
  familyId: string,
  contractId: string,
  input: LeaveInput,
): Promise<Leave> {
  const { data } = await api.post<Leave>(base(familyId, contractId), input)
  return data
}

export async function updateLeave(
  familyId: string,
  contractId: string,
  leaveId: string,
  input: Partial<LeaveInput>,
): Promise<Leave> {
  const { data } = await api.patch<Leave>(
    `${base(familyId, contractId)}${leaveId}/`,
    input,
  )
  return data
}

export async function deleteLeave(
  familyId: string,
  contractId: string,
  leaveId: string,
): Promise<void> {
  await api.delete(`${base(familyId, contractId)}${leaveId}/`)
}
