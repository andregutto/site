import type { ReactNode } from 'react'

interface PageTitleProps {
  /* e.g. "CAPITAL · INVESTIMENTOS" — rendered uppercase 10px/0.30em */
  eyebrow: string
  title: string
  /* right-aligned slot for controls (Segmented, ghost buttons…) */
  actions?: ReactNode
  className?: string
}

export function PageTitle({ eyebrow, title, actions, className = '' }: PageTitleProps) {
  return (
    <div className={`flex flex-wrap items-end justify-between gap-3 ${className}`}>
      <div>
        <span className="arvo-eyebrow block">{eyebrow}</span>
        <h1
          style={{
            fontFamily: 'var(--arvo-font-display)',
            fontWeight: 400,
            fontSize: 'clamp(22px, 2.2vw, 26px)',
            letterSpacing: 'var(--arvo-track-normal)',
            lineHeight: 'var(--arvo-leading-tight)',
            color: 'var(--arvo-fg)',
            marginTop: 4,
          }}
        >
          {title}
        </h1>
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  )
}
