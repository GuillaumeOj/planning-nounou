import type { FamilyRead } from '@/src/api'

// Whether the acting user may manage this family: an owner, or the creator of an
// unclaimed family they set up on someone's behalf (until that person claims it).
// One source of truth shared by every page/section that gates a manage action.
export function canManageFamily(family: FamilyRead): boolean {
  return family.role === 'owner' || (family.role === null && !family.is_claimed)
}
