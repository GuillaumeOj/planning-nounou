import type { FamilyRole } from '@/src/api/family'
import type { TranslationKey } from '@/src/i18n/translations'

// Translate a family role for display. A null role is the creator of an
// unclaimed family (not yet a member).
export function roleLabel(
  t: (key: TranslationKey) => string,
  role: FamilyRole | null,
): string {
  if (role === 'owner') return t('family.roleOwner')
  if (role === 'member') return t('family.roleMember')
  return t('family.roleCreator')
}
