import { api } from './client'

export interface Child {
  id: number
  first_name: string
}

export async function listChildren(): Promise<Child[]> {
  const { data } = await api.get<Child[]>('/auth/children/')
  return data
}

export async function createChild(first_name: string): Promise<Child> {
  const { data } = await api.post<Child>('/auth/children/', { first_name })
  return data
}

export async function updateChild(
  id: number,
  first_name: string,
): Promise<Child> {
  const { data } = await api.patch<Child>(`/auth/children/${id}/`, {
    first_name,
  })
  return data
}

export async function deleteChild(id: number): Promise<void> {
  await api.delete(`/auth/children/${id}/`)
}
