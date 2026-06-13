import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { apiFetch } from '../lib/api'
import { useI18n } from '../contexts/I18nContext'
import { PageLoader } from '../components/ArvoLoader'
import { StatDelta } from '../components/ui'

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

function dayPctColor(v: number | null, neutral: boolean) {
  if (v == null || neutral) return 'arvo-delta-neutral'
  if (v > 0) return 'arvo-delta-pos'
  if (v < 0) return 'arvo-delta-neg'
  return 'arvo-delta-neutral'
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

export default function IndicesPage() {
  const { t } = useI18n()
  const categoryLabels = t.indices.categories as Record<string, string>
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
      <PageLoader />
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
        <h1 style={{ fontFamily: "var(--arvo-font-body)", fontSize: 18, letterSpacing: '0.06em', color: 'var(--arvo-fg)' }}>{t.indices.title}</h1>
        <p className="text-sm mt-0.5" style={{ color: 'var(--arvo-fg-muted)' }}>{t.indices.subtitle}</p>
      </div>

      {grouped.map(([category, items]) => (
        <section key={category}>
          <h2 className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: 'var(--arvo-fg-muted)', fontFamily: "var(--arvo-font-body)", letterSpacing: '0.18em' }}>
            {categoryLabels?.[category] ?? category}
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {items.map(idx => {
              const dayPct = idx.prev_value && idx.value
                ? Math.round((idx.value / idx.prev_value - 1) * 10000) / 100
                : null
              const isInflation = idx.category === 'br_inflation'

              return (
                <button
                  key={idx.code}
                  onClick={() => navigate(`/indices/${idx.code}`)}
                  className="text-left bg-[var(--arvo-surface)] border border-[var(--arvo-border)] rounded-2xl p-4 hover:border-[var(--arvo-fg)]/30 hover:shadow-sm transition-all"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="text-xs font-semibold text-[var(--arvo-fg-soft)] uppercase tracking-wide">{idx.code}</div>
                      <div className="text-sm font-semibold text-[var(--arvo-fg)] truncate">{idx.name}</div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="text-lg font-bold text-[var(--arvo-fg)] tabular-nums">
                        {fmtValue(idx.value, idx.unit)}
                      </div>
                      <div className={`text-xs font-medium arvo-num ${dayPctColor(dayPct, isInflation)}`}>
                        {fmtPct(dayPct)} {t.indices.month}
                      </div>
                    </div>
                  </div>

                  <div className="mt-3 pt-3 border-t border-[var(--arvo-border-soft)] grid grid-cols-3 gap-2">
                    {[
                      { pct: idx.m1_pct, label: '1m' },
                      { pct: idx.ytd_pct, label: 'YTD' },
                      { pct: idx.m12_pct, label: '12m' },
                    ].map(({ pct, label }) => (
                      <div key={label} className="text-center">
                        <div className="text-xs font-semibold">
                          {pct == null
                            ? <span className="arvo-num arvo-delta-neutral">—</span>
                            : <StatDelta value={pct} neutral={isInflation} formatted={`${Math.abs(pct).toFixed(2)}%`} />}
                        </div>
                        <div className="text-[10px] text-[var(--arvo-fg-soft)] mt-0.5">{label}</div>
                      </div>
                    ))}
                  </div>
                </button>
              )
            })}
          </div>
        </section>
      ))}

      <p className="text-[10px] text-[var(--arvo-fg-faint)] pb-2">{t.indices.source}</p>
    </div>
  )
}
