import type { TranslationKey } from '@/src/i18n/translations'

// Translate a family role for display. A null role is the creator of an
// unclaimed family (not yet a member). Accepts a plain string (the generated
// FamilyRead types role as `string | null`) since only equality is checked.
export function roleLabel(
  t: (key: TranslationKey) => string,
  role: string | null,
): string {
  if (role === 'owner') return t('family.roleOwner')
  if (role === 'member') return t('family.roleMember')
  return t('family.roleCreator')
}
