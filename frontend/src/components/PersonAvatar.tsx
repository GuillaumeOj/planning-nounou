import { Avatar, AvatarFallback } from '@/src/components/ui/avatar'
import { cn } from '@/src/lib/utils'

// Up to two initials from a display name: the first and last word's initial, or
// the first letter of a single word (a lone first name, or an email fallback).
export function personInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0][0].toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

// A person's avatar: their initials on the brand emerald ground (guide p.7).
// Decorative by default — the name is always spelled out next to it — so it is
// hidden from assistive tech.
export function PersonAvatar({
  name,
  size,
  className,
}: {
  name: string
  size?: 'sm' | 'default' | 'lg'
  className?: string
}) {
  return (
    <Avatar
      size={size}
      aria-hidden="true"
      className={cn('shrink-0', className)}
    >
      <AvatarFallback>{personInitials(name)}</AvatarFallback>
    </Avatar>
  )
}
