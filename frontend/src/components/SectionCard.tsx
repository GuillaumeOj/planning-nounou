import type { ReactNode } from 'react'
import { Card, CardContent } from '@/src/components/ui/card'

// A titled card section: a heading (+ optional description) above its content.
// Shared by the settings blocks and the nanny add/edit form.
export function SectionCard({
  title,
  description,
  className,
  children,
}: {
  title: string
  description?: string
  className?: string
  children: ReactNode
}) {
  return (
    <Card className={className}>
      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <h2 className="font-heading text-lg font-medium">{title}</h2>
          {description && (
            <p className="text-sm text-muted-foreground">{description}</p>
          )}
        </div>
        {children}
      </CardContent>
    </Card>
  )
}
