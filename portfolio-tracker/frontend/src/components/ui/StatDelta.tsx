interface StatDeltaProps {
  /* signed value; drives color and the +/− prefix */
  value: number
  /* pre-formatted display (without sign); defaults to percent with 1 decimal */
  formatted?: string
  /* for data where sentiment doesn't apply (e.g. inflation) */
  neutral?: boolean
  className?: string
}

export function StatDelta({ value, formatted, neutral = false, className = '' }: StatDeltaProps) {
  const tone = neutral ? 'arvo-delta-neutral' : value < 0 ? 'arvo-delta-neg' : 'arvo-delta-pos'
  const sign = value < 0 ? '−' : '+'
  const display = formatted ?? `${Math.abs(value).toFixed(1).replace('.', ',')}%`
  return (
    <span className={`arvo-num ${tone} ${className}`}>
      {sign}{display}
    </span>
  )
}
