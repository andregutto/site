import type { ReactNode } from 'react'

const HAIRLINE: Record<InfoBoxVariant, string> = {
  info: 'var(--arvo-gold)',
  action: 'var(--arvo-blue)',
  warning: 'var(--arvo-ocre)',
  error: 'var(--arvo-red)',
}

export type InfoBoxVariant = 'info' | 'action' | 'warning' | 'error'

interface InfoBoxProps {
  variant: InfoBoxVariant
  title: string
  className?: string
  children: ReactNode
}

/* Unified instruction box: beige surface, hairline on the left whose color
   carries the variant (gold = info, blue = action, ocre = warning, red =
   error). Replaces ad-hoc Bootstrap-style blue/amber/green/red alerts. */
export function InfoBox({ variant, title, className = '', children }: InfoBoxProps) {
  return (
    <div
      className={`rounded-xl p-4 text-sm text-[var(--arvo-fg-muted)] space-y-1 ${className}`}
      style={{ background: 'var(--arvo-surface-2)', borderLeft: `2px solid ${HAIRLINE[variant]}` }}
    >
      <p className="text-xs font-semibold uppercase tracking-wide text-[var(--arvo-fg)]">{title}</p>
      {children}
    </div>
  )
}
