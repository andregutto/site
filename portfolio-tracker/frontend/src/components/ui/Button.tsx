import type { ButtonHTMLAttributes } from 'react'

export type ButtonVariant = 'primary' | 'ghost' | 'link'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: 'sm' | 'md'
}

export function Button({ variant = 'primary', size = 'md', type = 'button', className = '', ...rest }: ButtonProps) {
  const cls = [
    'arvo-btn',
    `arvo-btn--${variant}`,
    size === 'sm' ? 'arvo-btn--sm' : '',
    className,
  ].filter(Boolean).join(' ')
  return <button type={type} className={cls} {...rest} />
}
