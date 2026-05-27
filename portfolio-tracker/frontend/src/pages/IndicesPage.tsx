import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { apiFetch } from '../lib/api'
import { useI18n } from '../contexts/I18nContext'

interface IndexSnapshot {
  code: string
  name: string
  category: string
  unit: string
  description: string
  value: number | null
  prev_value: number | null
  ytd_pct: number | null
  m12_pct: number | null
  m1_pct: number | null
}

const CATEGORY_LABELS: Record<string, { pt: string; en: string; fr: string }> = {
  br_equity:    { pt: 'Renda variável BR', en: 'BR Equities',    fr: 'Actions BR' },
  us_equity:    { pt: 'Renda variável EUA', en: 'US Equities',   fr: 'Actions USA' },
  br_rate:      { pt: 'Taxas BR',          en: 'BR Rates',       fr: 'Taux BR' },
  br_inflation: { pt: 'Inflação BR',       en: 'BR Inflation',   fr: 'Inflation BR' },
  fx:           { pt: 'Câmbio',            en: 'FX',             fr: 'Change' },
  commodity:    { pt: 'Commodities',       en: 'Commodities',    fr: 'Matières premières' },
}

function pctColor(v: number | null) {
  if (v == null) return 'text-gray-400'
  if (v > 0) return 'text-emerald-600'
  if (v < 0) return 'text-red-500'
  return 'text-gray-500'
}

function fmtPct(v: number | null) {
  if (v == null) return '—'
  return `${v >= 0 ? '+' : ''}${v.toFixed(2)}%`
}

function fmtValue(v: number | null, unit: string) {
  if (v == null) return '—'
  if (unit === 'pts') return v.toLocaleString('pt-BR', { maximumFractionDigits: 0 })
  if (unit === '% a.a.' || unit === '% a.m.') return `${v.toFixed(2)}%`
  if (unit === 'R$') return v.toFixed(4)
  if (unit === 'USD/oz') return `$${v.toLocaleString('en-US', { maximumFractionDigits: 2 })}`
  return v.toFixed(2)
}

function MiniSparkBar({ pct }: { pct: number | null }) {
  if (pct == null) return <div className="w-1 h-4 bg-gray-100 rounded-full" />
  const h = Math.min(Math.abs(pct) * 2.5, 28)
  return (
    <div className="flex items-end justify-center w-2 h-7">
      <div
        className={`w-full rounded-sm ${pct >= 0 ? 'bg-emerald-400' : 'bg-red-400'}`}
        style={{ height: `${Math.max(h, 3)}px` }}
      />
    </div>
  )
}

export default function IndicesPage() {
  const { locale, t } = useI18n()
  const navigate = useNavigate()
  const [data, setData] = useState<IndexSnapshot[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    apiFetch<IndexSnapshot[]>('/indices')
      .then(setData)
      .catch(() => setError('error'))
      .finally(() => setLoading(false))
  }, [])

  const grouped = data
    ? Object.entries(
        data.reduce<Record<string, IndexSnapshot[]>>((acc, idx) => {
          ;(acc[idx.category] ??= []).push(idx)
          return acc
        }, {})
      )
    : []

  const CATEGORY_ORDER = ['br_equity', 'br_rate', 'br_inflation', 'us_equity', 'fx', 'commodity']
  grouped.sort(([a], [b]) => CATEGORY_ORDER.indexOf(a) - CATEGORY_ORDER.indexOf(b))

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="text-gray-400 text-sm animate-pulse">{t.indices.loading}</div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="text-red-500 text-sm">{t.indices.error}</div>
      </div>
    )
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 style={{ fontFamily: "var(--arvo-font-body)", fontSize: 18, letterSpacing: '0.06em', color: 'var(--arvo-black)' }}>{t.indices.title}</h1>
        <p className="text-sm mt-0.5" style={{ color: 'rgba(13,13,13,0.60)' }}>{t.indices.subtitle}</p>
      </div>

      {grouped.map(([category, items]) => (
        <section key={category}>
          <h2 className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: 'rgba(13,13,13,0.55)', fontFamily: "var(--arvo-font-body)", letterSpacing: '0.18em' }}>
            {CATEGORY_LABELS[category]?.[locale as 'pt' | 'en' | 'fr'] ?? category}
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {items.map(idx => {
              const dayPct = idx.prev_value && idx.value
                ? Math.round((idx.value / idx.prev_value - 1) * 10000) / 100
                : null

              return (
                <button
                  key={idx.code}
                  onClick={() => navigate(`/indices/${idx.code}`)}
                  className="text-left bg-white border border-gray-100 rounded-2xl p-4 hover:border-[#0D0D0D]/30 hover:shadow-sm transition-all"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="text-xs font-semibold text-gray-400 uppercase tracking-wide">{idx.code}</div>
                      <div className="text-sm font-semibold text-gray-800 truncate">{idx.name}</div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="text-lg font-bold text-gray-900 tabular-nums">
                        {fmtValue(idx.value, idx.unit)}
                      </div>
                      <div className={`text-xs font-medium ${pctColor(dayPct)}`}>
                        {fmtPct(dayPct)} {t.indices.month}
                      </div>
                    </div>
                  </div>

                  <div className="mt-3 pt-3 border-t border-gray-50 grid grid-cols-3 gap-2">
                    <div className="text-center">
                      <div className="flex justify-center mb-1">
                        <MiniSparkBar pct={idx.m1_pct} />
                      </div>
                      <div className={`text-xs font-semibold tabular-nums ${pctColor(idx.m1_pct)}`}>
                        {fmtPct(idx.m1_pct)}
                      </div>
                      <div className="text-[10px] text-gray-400">1m</div>
                    </div>
                    <div className="text-center">
                      <div className="flex justify-center mb-1">
                        <MiniSparkBar pct={idx.ytd_pct} />
                      </div>
                      <div className={`text-xs font-semibold tabular-nums ${pctColor(idx.ytd_pct)}`}>
                        {fmtPct(idx.ytd_pct)}
                      </div>
                      <div className="text-[10px] text-gray-400">YTD</div>
                    </div>
                    <div className="text-center">
                      <div className="flex justify-center mb-1">
                        <MiniSparkBar pct={idx.m12_pct} />
                      </div>
                      <div className={`text-xs font-semibold tabular-nums ${pctColor(idx.m12_pct)}`}>
                        {fmtPct(idx.m12_pct)}
                      </div>
                      <div className="text-[10px] text-gray-400">12m</div>
                    </div>
                  </div>
                </button>
              )
            })}
          </div>
        </section>
      ))}

      <p className="text-[10px] text-gray-300 pb-2">{t.indices.source}</p>
    </div>
  )
}
