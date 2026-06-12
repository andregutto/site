import type { HTMLAttributes } from 'react'

export function Eyebrow({ className = '', ...rest }: HTMLAttributes<HTMLSpanElement>) {
  return <span className={`arvo-eyebrow ${className}`} {...rest} />
}
