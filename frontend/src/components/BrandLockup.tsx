import { Baby } from 'lucide-react'
import { BetaBadge } from '@/src/components/BetaBadge'
import { APP_NAME } from '@/src/lib/brand'
import { cn } from '@/src/lib/utils'

// The brand mark: the Baby icon in emerald + the app name in the heading face,
// with the Beta tag alongside. Shared by the navbar (both breakpoints) and the
// public header so the lockup stays identical everywhere.
export function BrandLockup({
  iconSize = 20,
  className,
  showBeta = true,
}: {
  iconSize?: number
  className?: string
  showBeta?: boolean
}) {
  return (
    <span
      className={cn(
        'flex items-center gap-2 font-heading font-semibold text-foreground',
        className,
      )}
    >
      <Baby size={iconSize} aria-hidden="true" className="text-brand-emerald" />
      <span>{APP_NAME}</span>
      {showBeta && <BetaBadge />}
    </span>
  )
}
