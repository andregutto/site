import type { ReactNode } from 'react'

interface SectionHeadingProps {
  title: string
  /* optional small action on the right (link-style button) */
  action?: ReactNode
  className?: string
}

export function SectionHeading({ title, action, className = '' }: SectionHeadingProps) {
  return (
    <div className={`flex items-baseline justify-between gap-3 ${className}`}>
      <h2
        style={{
          fontFamily: 'var(--arvo-font-display)',
          fontWeight: 400,
          fontSize: 16,
          letterSpacing: 'var(--arvo-track-normal)',
          color: 'var(--arvo-fg)',
        }}
      >
        {title}
      </h2>
      {action}
    </div>
  )
}
