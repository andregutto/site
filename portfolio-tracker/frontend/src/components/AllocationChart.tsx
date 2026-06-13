import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Label } from 'recharts'
import type { PortfolioClass } from '../lib/types'
import { useI18n } from '../contexts/I18nContext'
import { ArvoTooltip, LegendDot } from './charts'

interface Props {
  data: PortfolioClass[]
  currency?: string
  convert?: (v: number) => number
}

function fmtCompact(v: number, cur = 'BRL', locale = 'pt-BR') {
  if (Math.abs(v) >= 1_000_000) {
    return new Intl.NumberFormat(locale, { style: 'currency', currency: cur, maximumFractionDigits: 1, notation: 'compact' }).format(v)
  }
  return new Intl.NumberFormat(locale, { style: 'currency', currency: cur, maximumFractionDigits: 0 }).format(v)
}

export default function AllocationChart({ data, currency = 'BRL', convert }: Props) {
  const { t, locale } = useI18n()
  const intlLocale = locale === 'pt' ? 'pt-BR' : locale === 'fr' ? 'fr-FR' : 'en-GB'
  if (!data.length) return null

  const classNames = (t.classes.names as Record<string, string>) ?? {}
  const resolveClassName = (item: PortfolioClass) => {
    if (item.name_key && classNames[item.name_key]) return classNames[item.name_key]
    if (item.name === 'Sem classe') return t.classes.noClass
    return item.name
  }

  const total = data.reduce((s, d) => s + d.value_brl, 0)
  const totalFormatted = fmtCompact(convert ? convert(total) : total, currency, intlLocale)

  return (
    <div className="rounded-2xl p-4 sm:p-6 h-full flex flex-col" style={{ background: 'var(--arvo-surface)', border: '1px solid var(--arvo-border)' }}>
      <h2 className="mb-1" style={{ fontFamily: "var(--arvo-font-body)", fontSize: 13, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--arvo-fg)' }}>{t.dashboard.allocationByClass}</h2>
      <p className="mb-2" style={{ fontFamily: "'Playfair Display', serif", fontStyle: 'italic', fontSize: 13, color: 'var(--arvo-fg-soft)' }}>{t.dashboard.allocationSubtitle}</p>
      <div className="flex-1 min-h-[280px] flex flex-col sm:flex-row items-center gap-4 sm:gap-6">
        <div className="w-full sm:flex-1 sm:h-full" style={{ minHeight: 220 }}>
          <ResponsiveContainer width="100%" height="100%">
            <PieChart margin={{ top: 8, right: 8, bottom: 8, left: 8 }}>
              <Pie
                data={data}
                dataKey="value_brl"
                nameKey="name"
                cx="50%"
                cy="50%"
                innerRadius="55%"
                outerRadius="85%"
                paddingAngle={2}
                stroke="var(--arvo-surface)"
                strokeWidth={2}
              >
                {data.map((entry, i) => (
                  <Cell key={i} fill={entry.color} />
                ))}
                <Label
                  content={(props) => {
                    const vb = (props.viewBox as unknown as { cx?: number; cy?: number; x?: number; y?: number; width?: number; height?: number }) ?? {}
                    const cx = vb.cx ?? (vb.x ?? 0) + (vb.width ?? 0) / 2
                    const cy = vb.cy ?? (vb.y ?? 0) + (vb.height ?? 0) / 2
                    return (
                      <g>
                        <text x={cx} y={cy - 7} textAnchor="middle" fill="var(--arvo-fg-soft)" fontSize={9} fontFamily="var(--arvo-font-body)" letterSpacing="0.12em">
                          {t.common.total.toUpperCase()}
                        </text>
                        <text x={cx} y={cy + 9} textAnchor="middle" fill="var(--arvo-fg)" fontSize={13} fontFamily="var(--arvo-font-body)" fontWeight={600} className="arvo-num">
                          {totalFormatted}
                        </text>
                      </g>
                    )
                  }}
                  position="center"
                />
              </Pie>
              <Tooltip
                content={
                  <ArvoTooltip
                    formatter={(v, _name, item) => [
                      new Intl.NumberFormat(intlLocale, { style: 'currency', currency, maximumFractionDigits: 0 }).format(convert ? convert(v) : v),
                      resolveClassName(item.payload as unknown as PortfolioClass) ?? item.name,
                    ]}
                  />
                }
              />
            </PieChart>
          </ResponsiveContainer>
        </div>
        <div className="w-full sm:w-[210px] flex flex-col gap-2.5 shrink-0">
          {data.map((d, i) => (
            <LegendDot
              key={i}
              color={d.color}
              label={resolveClassName(d)}
              pct={`${Math.round(d.pct)}%`}
              value={fmtCompact(convert ? convert(d.value_brl) : d.value_brl, currency, intlLocale)}
            />
          ))}
        </div>
      </div>
    </div>
  )
}
