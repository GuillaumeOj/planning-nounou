import { Check } from 'lucide-react'
import { useI18n } from '@/src/i18n/I18nContext'
import type { TranslationKey } from '@/src/i18n/translations'

// A list of ticked points, shared by the feature sections and the pricing card.
export function CheckList({ itemKeys }: { itemKeys: TranslationKey[] }) {
  const { t } = useI18n()
  return (
    <ul className="flex flex-col gap-3">
      {itemKeys.map((key) => (
        <li key={key} className="flex items-start gap-3">
          <Check
            size={18}
            aria-hidden={true}
            className="mt-0.5 shrink-0 text-brand-emerald"
          />
          <span className="text-sm leading-relaxed">{t(key)}</span>
        </li>
      ))}
    </ul>
  )
}
