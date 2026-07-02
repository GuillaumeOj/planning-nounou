import { api } from './client'

export interface Nanny {
  id: number
  first_name: string
  last_name: string
  starting_date: string
  ending_date: string | null
}

// Fields the UI submits; the backend sets the owner from the auth token.
export interface NannyInput {
  first_name: string
  last_name: string
  starting_date: string
  ending_date: string | null
}

export async function getNannies(): Promise<Nanny[]> {
  const { data } = await api.get<Nanny[]>('/nannies/')
  return data
}

export async function createNanny(input: NannyInput): Promise<Nanny> {
  const { data } = await api.post<Nanny>('/nannies/', input)
  return data
}

export async function updateNanny(
  id: number,
  input: NannyInput,
): Promise<Nanny> {
  const { data } = await api.patch<Nanny>(`/nannies/${id}/`, input)
  return data
}

export async function deleteNanny(id: number): Promise<void> {
  await api.delete(`/nannies/${id}/`)
}
