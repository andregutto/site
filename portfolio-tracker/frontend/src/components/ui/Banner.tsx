import type { ReactNode } from 'react'

interface BannerProps {
  /* info = gold hairline; alert = guará red hairline */
  variant?: 'info' | 'alert'
  children: ReactNode
  /* short action rendered as a link at the end of the strip */
  action?: ReactNode
  onDismiss?: () => void
  className?: string
}

/* The single banner pattern (§ shell): one thin beige strip, left hairline,
   max ONE visible at a time — queueing is the caller's job. */
export function Banner({ variant = 'info', children, action, onDismiss, className = '' }: BannerProps) {
  return (
    <div
      className={`flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3 px-4 py-2.5 ${className}`}
      style={{
        background: 'var(--arvo-surface-2)',
        borderLeft: `2px solid ${variant === 'alert' ? 'var(--arvo-red)' : 'var(--arvo-gold)'}`,
        borderRadius: 'var(--arvo-radius-xs)',
      }}
    >
      <p className="flex-1 min-w-0 sm:truncate" style={{ fontSize: 'var(--arvo-text-small)', color: 'var(--arvo-fg-muted)' }}>
        {children}
      </p>
      {(action || onDismiss) && (
        <div className="flex items-center gap-3 shrink-0">
          {action}
          {onDismiss && (
            <button
              type="button"
              onClick={onDismiss}
              aria-label="Dismiss"
              className="shrink-0 leading-none"
              style={{ color: 'var(--arvo-fg-soft)', fontSize: 14, background: 'none', border: 'none', cursor: 'pointer', padding: 4 }}
            >
              ×
            </button>
          )}
        </div>
      )}
    </div>
  )
}
