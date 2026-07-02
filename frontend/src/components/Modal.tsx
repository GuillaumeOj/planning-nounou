import type { ReactNode } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from './ui/dialog'

// Controlled modal dialog built on the shadcn Dialog. Always open while mounted;
// closing (Escape, overlay, or the close button) calls onClose so the caller can
// unmount it.
export function Modal({
  title,
  onClose,
  children,
}: {
  title: string
  onClose: () => void
  children: ReactNode
}) {
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        {children}
      </DialogContent>
    </Dialog>
  )
}
