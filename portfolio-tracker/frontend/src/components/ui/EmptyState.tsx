import type { ReactNode } from 'react'

interface EmptyStateProps {
  icon?: ReactNode
  title: string
  description?: string
  action?: ReactNode
  className?: string
}

export function EmptyState({ icon, title, description, action, className = '' }: EmptyStateProps) {
  return (
    <div className={`flex flex-col items-center text-center px-6 py-12 ${className}`}>
      {icon && (
        <div
          className="flex items-center justify-center mb-4"
          style={{
            width: 48,
            height: 48,
            borderRadius: 'var(--arvo-radius-pill)',
            background: 'var(--arvo-surface-2)',
            color: 'var(--arvo-fg-soft)',
          }}
        >
          {icon}
        </div>
      )}
      <p
        style={{
          fontFamily: 'var(--arvo-font-display)',
          fontSize: 16,
          letterSpacing: 'var(--arvo-track-normal)',
          color: 'var(--arvo-fg)',
        }}
      >
        {title}
      </p>
      {description && (
        <p className="mt-1 max-w-sm" style={{ fontSize: 'var(--arvo-text-small)', color: 'var(--arvo-fg-soft)', lineHeight: 1.6 }}>
          {description}
        </p>
      )}
      {action && <div className="mt-5">{action}</div>}
    </div>
  )
}
