import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Label } from 'recharts'
import type { PortfolioClass } from '../lib/types'
import { useI18n } from '../contexts/I18nContext'
import { useIsMobile } from '../hooks/useIsMobile'

interface Props {
  data: PortfolioClass[]
  currency?: string
  convert?: (v: number) => number
}

function fmtCompact(v: number, cur = 'BRL') {
  if (Math.abs(v) >= 1_000_000) {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: cur, maximumFractionDigits: 1, notation: 'compact' }).format(v)
  }
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: cur, maximumFractionDigits: 0 }).format(v)
}

const RADIAN = Math.PI / 180
const LABEL_LINE_HEIGHT_EM = 1.1

function wrapLabel(text: string, maxChars: number): string[] {
  const words = text.split(' ')
  const lines: string[] = []
  let current = ''
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word
    if (current && candidate.length > maxChars) {
      lines.push(current)
      current = word
    } else {
      current = candidate
    }
  }
  if (current) lines.push(current)
  return lines
}

export default function AllocationChart({ data, currency = 'BRL', convert }: Props) {
  const { t } = useI18n()
  const isMobile = useIsMobile()
  if (!data.length) return null

  const classNames = (t.classes.names as Record<string, string>) ?? {}
  const resolveClassName = (item: PortfolioClass) => {
    if (item.name_key && classNames[item.name_key]) return classNames[item.name_key]
    if (item.name === 'Sem classe') return t.classes.noClass
    return item.name
  }

  const total = data.reduce((s, d) => s + d.value_brl, 0)
  const totalFormatted = fmtCompact(convert ? convert(total) : total, currency)

  const renderOuterLabel = (props: {
    cx?: number; cy?: number; midAngle?: number;
    outerRadius?: number; percent?: number; payload?: PortfolioClass
  }) => {
    const { cx = 0, cy = 0, midAngle = 0, outerRadius = 0, percent = 0, payload } = props
    if (!payload || percent < 0.05) return null
    const radius = outerRadius + (isMobile ? 14 : 22)
    const x = cx + radius * Math.cos(-midAngle * RADIAN)
    const y = cy + radius * Math.sin(-midAngle * RADIAN)
    const anchor = x > cx ? 'start' : 'end'
    const pct = `${(percent * 100).toFixed(0)}%`

    if (isMobile) {
      const lines = wrapLabel(`${resolveClassName(payload)} ${pct}`, 10)
      const firstDy = -((lines.length - 1) / 2) * LABEL_LINE_HEIGHT_EM
      return (
        <text
          x={x} y={y}
          textAnchor={anchor}
          fontSize={11}
          fontFamily="var(--arvo-font-body)"
          fontWeight={500}
          fill={payload.color}
        >
          {lines.map((line, i) => (
            <tspan key={i} x={x} dy={`${i === 0 ? firstDy : LABEL_LINE_HEIGHT_EM}em`}>{line}</tspan>
          ))}
        </text>
      )
    }

    return (
      <text
        x={x} y={y}
        textAnchor={anchor}
        dominantBaseline="central"
        fontSize={12}
        fontFamily="var(--arvo-font-body)"
        fontWeight={500}
        fill={payload.color}
      >
        {`${resolveClassName(payload)} ${pct}`}
      </text>
    )
  }

  return (
    <div className="rounded-2xl p-6 h-full flex flex-col" style={{ background: 'var(--arvo-surface)', border: '1px solid var(--arvo-border)' }}>
      <h2 className="mb-1" style={{ fontFamily: "var(--arvo-font-body)", fontSize: 13, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--arvo-fg)' }}>{t.dashboard.allocationByClass}</h2>
      <p className="mb-2" style={{ fontFamily: "'Playfair Display', serif", fontStyle: 'italic', fontSize: 13, color: 'var(--arvo-fg-soft)' }}>{t.dashboard.allocationSubtitle}</p>
      <div className="flex-1 min-h-[260px]" style={{ width: '100%' }}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart margin={isMobile ? { top: 10, right: 25, bottom: 10, left: 25 } : { top: 10, right: 55, bottom: 10, left: 55 }}>
            <Pie
              data={data}
              dataKey="value_brl"
              nameKey="name"
              cx="50%"
              cy="50%"
              innerRadius={isMobile ? '45%' : '55%'}
              outerRadius={isMobile ? '65%' : '78%'}
              paddingAngle={2}
              stroke="var(--arvo-surface)"
              strokeWidth={2}
              label={renderOuterLabel}
              labelLine={false}
            >
              {data.map((entry, i) => (
                <Cell key={i} fill={entry.color} />
              ))}
              <Label
                content={({ viewBox }: any) => {
                  const { cx, cy } = viewBox
                  return (
                    <g>
                      <text x={cx} y={cy - 7} textAnchor="middle" fill="var(--arvo-fg-soft)" fontSize={9} fontFamily="var(--arvo-font-body)" letterSpacing="0.12em">
                        {t.common.total.toUpperCase()}
                      </text>
                      <text x={cx} y={cy + 9} textAnchor="middle" fill="var(--arvo-fg)" fontSize={13} fontFamily="var(--arvo-font-body)" fontWeight={600}>
                        {totalFormatted}
                      </text>
                    </g>
                  )
                }}
                position="center"
              />
            </Pie>
            <Tooltip
              formatter={(value) => {
                const raw = Number(value)
                const converted = convert ? convert(raw) : raw
                return [new Intl.NumberFormat('pt-BR', { style: 'currency', currency, maximumFractionDigits: 0 }).format(converted), t.common.value]
              }}
              contentStyle={{ borderRadius: 8, border: '1px solid var(--arvo-border)', background: 'var(--arvo-surface)', color: 'var(--arvo-fg)', fontSize: 12, fontFamily: "var(--arvo-font-body)" }}
            />
          </PieChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
