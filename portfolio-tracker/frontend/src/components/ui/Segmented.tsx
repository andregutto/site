interface SegmentedOption<T extends string> {
  value: T
  label: string
  disabled?: boolean
}

interface SegmentedProps<T extends string> {
  options: SegmentedOption<T>[]
  value: T
  onChange: (value: T) => void
  ariaLabel?: string
  className?: string
}

/* Single segmented control (§ controls) — replaces period chip-soup.
   Hairline container radius 3, active segment = black pill tokens. */
export function Segmented<T extends string>({ options, value, onChange, ariaLabel, className = '' }: SegmentedProps<T>) {
  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className={`inline-flex ${className}`}
      style={{ border: '1px solid var(--arvo-border)', borderRadius: 'var(--arvo-radius-xs)', overflow: 'hidden' }}
    >
      {options.map((opt) => {
        const active = opt.value === value
        return (
          <button
            key={opt.value}
            type="button"
            role="tab"
            aria-selected={active}
            disabled={opt.disabled}
            onClick={() => !opt.disabled && onChange(opt.value)}
            className="px-3 py-1.5"
            style={{
              fontFamily: 'var(--arvo-font-body)',
              fontSize: 11,
              letterSpacing: '0.04em',
              border: 'none',
              cursor: opt.disabled ? 'not-allowed' : 'pointer',
              background: active && !opt.disabled ? 'var(--arvo-pill-active-bg)' : 'transparent',
              color: opt.disabled ? 'var(--arvo-fg-faint)' : active ? 'var(--arvo-pill-active-fg)' : 'var(--arvo-fg-muted)',
              transition: 'background var(--arvo-dur-fast) var(--arvo-ease), color var(--arvo-dur-fast) var(--arvo-ease)',
            }}
          >
            {opt.label}
          </button>
        )
      })}
    </div>
  )
}
