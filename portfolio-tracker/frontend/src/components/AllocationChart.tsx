import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts'
import type { PortfolioClass } from '../lib/types'
import { useI18n } from '../contexts/I18nContext'

interface Props {
  data: PortfolioClass[]
}

function fmtBRL(v: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(v)
}

export default function AllocationChart({ data }: Props) {
  const { t } = useI18n()
  if (!data.length) return null

  return (
    <div className="bg-white border border-gray-100 rounded-2xl p-6 shadow-sm">
      <h2 className="font-semibold text-gray-800 mb-4">{t.dashboard.allocationByClass}</h2>
      <div className="flex flex-col lg:flex-row gap-6 items-center">
        <div className="w-full lg:w-64 h-64">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={data}
                dataKey="value_brl"
                nameKey="name"
                cx="50%"
                cy="50%"
                innerRadius={60}
                outerRadius={100}
                paddingAngle={2}
              >
                {data.map((entry, i) => (
                  <Cell key={i} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip
                formatter={(value) => [fmtBRL(Number(value)), t.common.value]}
                contentStyle={{ borderRadius: 8, border: '1px solid #e5e7eb', fontSize: 12 }}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>

        <div className="flex-1 w-full space-y-2">
          {data.map((item) => (
            <div key={item.name} className="flex items-center gap-3">
              <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: item.color }} />
              <div className="flex-1 min-w-0">
                <div className="flex justify-between items-baseline">
                  <span className="text-sm text-gray-700 truncate">{item.name === 'Sem classe' ? t.classes.noClass : item.name}</span>
                  <span className="text-sm font-medium text-gray-900 ml-2 flex-shrink-0">
                    {item.pct.toFixed(1)}%
                  </span>
                </div>
                <div className="mt-0.5 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all"
                    style={{ width: `${item.pct}%`, backgroundColor: item.color }}
                  />
                </div>
              </div>
              <span className="text-xs text-gray-400 flex-shrink-0 w-24 text-right">
                {fmtBRL(item.value_brl)}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
