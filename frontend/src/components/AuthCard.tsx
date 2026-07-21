import type { ReactNode } from 'react'
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/src/components/ui/card'

interface AuthCardProps {
  // The lucide icon shown in the brand medallion above the title.
  icon: ReactNode
  title: ReactNode
  description?: ReactNode
  // Optional line above the title (e.g. the app name on the login card).
  eyebrow?: ReactNode
  // Optional footer content, centered under the card body.
  footer?: ReactNode
  children: ReactNode
}

// The shared shell for every auth page (login, register, verify-email, forgot /
// reset password, activation): a centered narrow card with the brand medallion,
// title, and optional description/eyebrow/footer. Keeps the medallion geometry
// and card sizing defined once.
export function AuthCard({
  icon,
  title,
  description,
  eyebrow,
  footer,
  children,
}: AuthCardProps) {
  return (
    <main className="flex flex-1 items-center justify-center p-4 sm:p-6">
      <Card className="w-full max-w-sm">
        <CardHeader className="items-center text-center">
          <div
            className="mx-auto mb-2 flex size-13 items-center justify-center rounded-2xl bg-brand-emerald/10 text-brand-emerald ring-1 ring-brand-emerald/20"
            aria-hidden="true"
          >
            {icon}
          </div>
          {eyebrow}
          <CardTitle className="text-2xl">{title}</CardTitle>
          {description && <CardDescription>{description}</CardDescription>}
        </CardHeader>
        <CardContent>{children}</CardContent>
        {footer && <CardFooter className="justify-center">{footer}</CardFooter>}
      </Card>
    </main>
  )
}
