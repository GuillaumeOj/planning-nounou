import { api } from './client'

export interface Child {
  id: string
  first_name: string
}

export async function listChildren(familyId: string): Promise<Child[]> {
  const { data } = await api.get<Child[]>(`/families/${familyId}/children/`)
  return data
}

export async function createChild(
  familyId: string,
  first_name: string,
): Promise<Child> {
  const { data } = await api.post<Child>(`/families/${familyId}/children/`, {
    first_name,
  })
  return data
}

export async function updateChild(
  familyId: string,
  id: string,
  first_name: string,
): Promise<Child> {
  const { data } = await api.patch<Child>(
    `/families/${familyId}/children/${id}/`,
    { first_name },
  )
  return data
}

export async function deleteChild(familyId: string, id: string): Promise<void> {
  await api.delete(`/families/${familyId}/children/${id}/`)
}
