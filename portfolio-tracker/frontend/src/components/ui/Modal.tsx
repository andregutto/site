import { useEffect } from 'react'
import type { ReactNode } from 'react'

interface ModalProps {
  onClose: () => void
  title?: string
  children: ReactNode
  footer?: ReactNode
  maxWidth?: number
}

export function Modal({ onClose, title, children, footer, maxWidth = 480 }: ModalProps) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4"
      style={{ background: 'var(--arvo-overlay)' }}
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="w-full max-h-[92vh] sm:max-h-[90vh] overflow-y-auto rounded-t-2xl sm:rounded-2xl"
        style={{
          maxWidth,
          background: 'var(--arvo-surface)',
          border: '1px solid var(--arvo-border)',
          boxShadow: 'var(--arvo-shadow-lg)',
          paddingBottom: 'env(safe-area-inset-bottom, 0px)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {title && (
          <div className="px-6 pt-6 pb-2">
            <h2
              style={{
                fontFamily: 'var(--arvo-font-display)',
                fontWeight: 400,
                fontSize: 18,
                letterSpacing: 'var(--arvo-track-normal)',
                color: 'var(--arvo-fg)',
              }}
            >
              {title}
            </h2>
          </div>
        )}
        <div className="px-6 py-4">{children}</div>
        {footer && (
          <div className="px-6 pb-6 pt-2 flex justify-end gap-2">{footer}</div>
        )}
      </div>
    </div>
  )
}
