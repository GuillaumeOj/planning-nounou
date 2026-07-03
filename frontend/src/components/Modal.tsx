import type { ReactNode } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from './ui/dialog'

// Controlled modal dialog built on the shadcn Dialog. Always open while mounted;
// closing (Escape, overlay, or the close button) calls onClose so the caller can
// unmount it.
export function Modal({
  title,
  onClose,
  className,
  children,
}: {
  title: string
  onClose: () => void
  className?: string
  children: ReactNode
}) {
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
    >
      <DialogContent className={className}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        {children}
      </DialogContent>
    </Dialog>
  )
}
