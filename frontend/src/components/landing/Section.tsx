import type { ComponentProps } from 'react'
import { cn } from '@/src/lib/utils'

// The shared page frame for the marketing surface: centred, capped at the
// brand's 1120px main width, with the standard gutters and vertical rhythm.
// Callers override padding or width by passing className (tailwind-merge lets
// the later utility win).
export function Section({ className, ...props }: ComponentProps<'section'>) {
  return (
    <section
      className={cn(
        'mx-auto w-full max-w-[1120px] px-4 py-16 sm:px-6 sm:py-20',
        className,
      )}
      {...props}
    />
  )
}
