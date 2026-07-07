import type { ReactNode } from 'react'

interface ArvoTooltipPayloadItem {
  color?: string
  name?: ReactNode
  value?: number | string
  dataKey?: string | number
  payload?: unknown
}

interface ArvoTooltipProps {
  active?: boolean
  label?: string | number
  payload?: ArvoTooltipPayloadItem[]
  formatter?: (value: number, name: ReactNode, item: ArvoTooltipPayloadItem) => [ReactNode, ReactNode]
  labelFormatter?: (label: string | number) => ReactNode
}

/* Arvo chart tooltip (§3.5) — dark card, off-white text, gold hairline. */
export function ArvoTooltip({ active, payload, label, formatter, labelFormatter }: ArvoTooltipProps) {
  if (!active || !payload?.length) return null

  return (
    <div
      style={{
        background: '#161513',
        color: 'var(--arvo-fg-on-dark)',
        borderRadius: 10,
        border: '1px solid var(--arvo-gold-line)',
        padding: '8px 12px',
        fontSize: 13,
        fontFamily: 'var(--arvo-font-body)',
        boxShadow: 'var(--arvo-shadow-md)',
      }}
    >
      {label != null && (
        <div style={{ fontSize: 10, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--arvo-fg-on-dark-soft)', marginBottom: 4 }}>
          {labelFormatter ? labelFormatter(label) : label}
        </div>
      )}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
        {payload.map((item, i) => {
          const raw = typeof item.value === 'number' ? item.value : Number(item.value ?? 0)
          const [val, name] = formatter ? formatter(raw, item.name, item) : [item.value, item.name]
          return (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, justifyContent: 'space-between' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--arvo-fg-on-dark-muted)' }}>
                {item.color && <span style={{ width: 6, height: 6, borderRadius: '50%', background: item.color, flexShrink: 0 }} />}
                {name}
              </span>
              <span className="arvo-num" style={{ fontWeight: 600 }}>{val}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
