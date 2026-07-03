import { api } from './client'

export interface Child {
  id: number
  first_name: string
}

export async function listChildren(familyId: number): Promise<Child[]> {
  const { data } = await api.get<Child[]>(`/families/${familyId}/children/`)
  return data
}

export async function createChild(
  familyId: number,
  first_name: string,
): Promise<Child> {
  const { data } = await api.post<Child>(`/families/${familyId}/children/`, {
    first_name,
  })
  return data
}

export async function updateChild(
  familyId: number,
  id: number,
  first_name: string,
): Promise<Child> {
  const { data } = await api.patch<Child>(
    `/families/${familyId}/children/${id}/`,
    { first_name },
  )
  return data
}

export async function deleteChild(familyId: number, id: number): Promise<void> {
  await api.delete(`/families/${familyId}/children/${id}/`)
}
