interface LegendDotProps {
  color: string
  label: string
  value?: string
  pct?: string
}

/* Custom legend row (§3.5) — dot + name (+ %/value), used in chart legends
   that sit beside a donut/area instead of Recharts' default legend. */
export function LegendDot({ color, label, value, pct }: LegendDotProps) {
  return (
    <div className="flex items-center justify-between gap-3 min-w-0">
      <span className="flex items-center gap-2 min-w-0">
        <span style={{ width: 8, height: 8, borderRadius: '50%', background: color, flexShrink: 0 }} />
        <span className="truncate" style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 14, color: 'var(--arvo-fg)' }}>{label}</span>
      </span>
      <span className="flex items-baseline gap-2 shrink-0">
        {pct && <span className="arvo-num" style={{ fontSize: 14, fontWeight: 600, color: 'var(--arvo-fg)' }}>{pct}</span>}
        {value && <span className="arvo-num" style={{ fontSize: 12, color: 'var(--arvo-fg-soft)' }}>{value}</span>}
      </span>
    </div>
  )
}
