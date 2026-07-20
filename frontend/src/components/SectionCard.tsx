import type { ReactNode } from 'react'
import { Card, CardContent } from '@/src/components/ui/card'

// A titled card section: a heading (+ optional description) above its content.
// Shared by the settings blocks and the nanny add/edit form.
export function SectionCard({
  title,
  description,
  avatar,
  className,
  children,
}: {
  title: string
  description?: string
  // An optional leading element (e.g. a PersonAvatar), shown left of the title.
  avatar?: ReactNode
  className?: string
  children: ReactNode
}) {
  return (
    <Card className={className}>
      <CardContent className="flex flex-col gap-4">
        <div className="flex items-center gap-3">
          {avatar}
          <div className="flex min-w-0 flex-col gap-1">
            <h2 className="font-heading text-lg font-medium">{title}</h2>
            {description && (
              <p className="text-sm text-muted-foreground">{description}</p>
            )}
          </div>
        </div>
        {children}
      </CardContent>
    </Card>
  )
}
