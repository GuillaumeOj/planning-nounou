import type { ReactNode } from 'react'

// A small signpost above each landing section. Repeated across the page, the
// eyebrows form a through-line the reader follows top to bottom — the "discover
// as you scroll" rhythm — with a short emerald rule marking each new beat.
export function SectionEyebrow({ children }: { children: ReactNode }) {
  return (
    <p className="flex items-center gap-2.5 text-sm font-semibold uppercase tracking-wide text-brand-emerald">
      <span aria-hidden="true" className="h-px w-6 bg-brand-emerald/50" />
      {children}
    </p>
  )
}
