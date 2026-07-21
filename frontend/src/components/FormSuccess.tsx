import type { ReactNode } from 'react'

// The success counterpart to FormErrors: a single confirmation line announced to
// assistive tech via role="status". Renders nothing until there's a message.
export function FormSuccess({ children }: { children?: ReactNode }) {
  if (!children) {
    return null
  }

  return (
    <p className="text-sm text-emerald-600 dark:text-emerald-400" role="status">
      {children}
    </p>
  )
}
