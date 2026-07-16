import { api } from '@/src/api/client'

// A national work-free day (jour férié). Global and admin-managed; read-only
// over the API. `is_workable` marks a holiday that is still worked (e.g. the
// journée de solidarité) — the planning only neutralizes non-workable days.
export interface BankHoliday {
  id: string
  name: string
  date: string // "yyyy-MM-dd"
  is_workable: boolean
}

export async function getBankHolidays(year: number): Promise<BankHoliday[]> {
  const { data } = await api.get<BankHoliday[]>('/holidays/', {
    params: { year },
  })
  return data
}
