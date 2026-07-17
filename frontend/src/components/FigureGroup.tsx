import { Fragment, type ReactNode } from 'react'
import { cn } from '@/src/lib/utils'

// A labelled figure in a two-column list. `strong` marks the one line a reader is
// really after — a net salary, a remaining balance — so it carries the weight the
// others don't.
export interface Figure {
  label: string
  value: string
  strong?: boolean
}

// A titled two-column list of figures: the declaration card's pay/hours groups
// and the home dashboard's paid-leave block share it, so the label/value grid
// reads the same everywhere. `aside` sits opposite the title for a subtitle such
// as a period range.
export function FigureGroup({
  title,
  rows,
  aside,
}: {
  title: string
  rows: Figure[]
  aside?: ReactNode
}) {
  if (rows.length === 0) return null
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3">
        <h4 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {title}
        </h4>
        {aside}
      </div>
      <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1.5 text-sm">
        {rows.map((row) => (
          <Fragment key={row.label}>
            <dt className="text-muted-foreground">{row.label}</dt>
            <dd
              className={cn(
                'text-right tabular-nums',
                row.strong ? 'font-semibold' : 'font-medium',
              )}
            >
              {row.value}
            </dd>
          </Fragment>
        ))}
      </dl>
    </div>
  )
}
