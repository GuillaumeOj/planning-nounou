import { useMemo, useState } from 'react'
import { type FamilyRead, useFamiliesListQuery } from '@/src/api'

// The acting-family selection shared by the dashboard, planning, declarations and
// nannies pages: the user's families, a setter for the chosen id (null until they
// pick one), and the resolved active id — the chosen family, or the first one by
// default. Each page renders its own <Select> off `setFamilyId`/`activeFamilyId`.
export function useActiveFamily(): {
  families: FamilyRead[] | undefined
  setFamilyId: (id: string | null) => void
  activeFamilyId: string | null
} {
  const [familyId, setFamilyId] = useState<string | null>(null)
  const { data: families } = useFamiliesListQuery()
  const activeFamilyId = useMemo(() => {
    if (familyId !== null) return familyId
    return families && families.length > 0 ? families[0].id : null
  }, [familyId, families])
  return { families, setFamilyId, activeFamilyId }
}
