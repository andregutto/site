import type { HTMLAttributes } from 'react'

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  /* md shadow on hover — only for cards that navigate or open something */
  interactive?: boolean
}

export function Card({ interactive = false, className = '', style, ...rest }: CardProps) {
  return (
    <div
      className={`${interactive ? 'arvo-card-interactive ' : ''}${className}`}
      style={{
        background: 'var(--arvo-surface)',
        border: '1px solid var(--arvo-border)',
        borderRadius: 'var(--arvo-radius-lg)',
        ...style,
      }}
      {...rest}
    />
  )
}
