import { type ReactNode, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { useI18n } from '../i18n/I18nContext'

// Lightweight modal dialog: a clickable backdrop (button, so it is keyboard
// operable) behind a labelled dialog card. Closes on backdrop click or Escape.
export function Modal({
  title,
  onClose,
  children,
}: {
  title: string
  onClose: () => void
  children: ReactNode
}) {
  const { t } = useI18n()

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  // Portalled to <body> so the overlay sits above the whole app and is not
  // affected by the styling of whatever subtree renders it.
  return createPortal(
    <div className="modal-root">
      <button
        type="button"
        className="modal-backdrop"
        aria-label={t('common.close')}
        onClick={onClose}
      />
      <div
        className="modal card"
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <h2>{title}</h2>
        {children}
      </div>
    </div>,
    document.body,
  )
}
