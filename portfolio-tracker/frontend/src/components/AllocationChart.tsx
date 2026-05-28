import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts'
import type { PortfolioClass } from '../lib/types'
import { useI18n } from '../contexts/I18nContext'

interface Props {
  data: PortfolioClass[]
  currency?: string
  convert?: (v: number) => number
}

function fmtFull(v: number, cur = 'BRL') {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: cur, maximumFractionDigits: 0 }).format(v)
}

export default function AllocationChart({ data, currency = 'BRL', convert }: Props) {
  const { t } = useI18n()
  if (!data.length) return null

  const classNames = (t.classes.names as Record<string, string>) ?? {}
  const resolveClassName = (item: PortfolioClass) => {
    if (item.name_key && classNames[item.name_key]) return classNames[item.name_key]
    if (item.name === 'Sem classe') return t.classes.noClass
    return item.name
  }

  return (
    <div className="rounded-2xl p-6" style={{ background: 'white', border: '1px solid var(--arvo-border)' }}>
      <h2 className="mb-1" style={{ fontFamily: "var(--arvo-font-body)", fontSize: 13, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--arvo-fg)' }}>{t.dashboard.allocationByClass}</h2>
      <p className="mb-4" style={{ fontFamily: "'Playfair Display', serif", fontStyle: 'italic', fontSize: 13, color: 'var(--arvo-fg-soft)' }}>onde seu patrimônio está plantado</p>
      <div className="flex gap-6 items-center">
        <div style={{ width: 200, height: 200, flexShrink: 0 }}>
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={data}
                dataKey="value_brl"
                nameKey="name"
                cx="50%"
                cy="50%"
                innerRadius={60}
                outerRadius={95}
                paddingAngle={2}
              >
                {data.map((entry, i) => (
                  <Cell key={i} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip
                formatter={(value) => {
                  const raw = Number(value)
                  const converted = convert ? convert(raw) : raw
                  return [new Intl.NumberFormat('pt-BR', { style: 'currency', currency, maximumFractionDigits: 0 }).format(converted), t.common.value]
                }}
                contentStyle={{ borderRadius: 8, border: '1px solid var(--arvo-border-soft)', background: 'var(--arvo-offwhite)', fontSize: 12, fontFamily: "var(--arvo-font-body)" }}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>

        <div className="flex-1 min-w-0 space-y-2">
          {data.map((item) => (
            <div key={item.name} className="flex items-center gap-3">
              <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: item.color }} />
              <div className="flex-1 min-w-0">
                <div className="flex justify-between items-baseline">
                  <span className="text-sm truncate" style={{ color: 'rgba(13,13,13,0.7)' }}>{resolveClassName(item)}</span>
                  <span className="text-sm ml-2 flex-shrink-0" style={{ fontFamily: "var(--arvo-font-body)", color: 'var(--arvo-black)' }}>
                    {item.pct.toFixed(1)}%
                    <span className="ml-2 text-xs" style={{ fontStyle: 'italic', color: 'rgba(13,13,13,0.45)' }}>{fmtFull(convert ? convert(item.value_brl) : item.value_brl, currency)}</span>
                  </span>
                </div>
                <div className="mt-0.5 h-1 rounded-full overflow-hidden" style={{ background: 'rgba(13,13,13,0.07)' }}>
                  <div
                    className="h-full rounded-full transition-all"
                    style={{ width: `${item.pct}%`, backgroundColor: item.color }}
                  />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
