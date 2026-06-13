import { Fragment, useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { apiFetch } from '../lib/api'
import { useI18n } from '../contexts/I18nContext'

interface IndexSnapshot {
  code: string
  name: string
  value: number | null
  m1_pct: number | null
  ytd_pct: number | null
  m12_pct: number | null
  unit: string
}

type PeriodMode = 'current_month' | 'last_30d' | 'ytd' | 'last_12m' | 'inception'

const CARD_INDICES = ['IBOV', 'CDI', 'SP500', 'IPCA'] as const

function fmtVal(v: number | null, unit: string) {
  if (v == null) return '—'
  if (unit === 'pts') return v.toLocaleString('pt-BR', { maximumFractionDigits: 0 })
  if (unit === '% a.a.' || unit === '% a.m.') return `${v.toFixed(2)}%`
  return v.toFixed(2)
}

function fmtPct(v: number | null) {
  if (v == null) return '—'
  return `${v >= 0 ? '+' : ''}${v.toFixed(2)}%`
}

interface Props {
  periodMode: PeriodMode
  periodLabel: string
}

export default function MarketIndicesCard({ periodMode, periodLabel }: Props) {
  const [data, setData] = useState<IndexSnapshot[] | null>(null)
  const [failed, setFailed] = useState(false)
  const { t } = useI18n()
  const navigate = useNavigate()

  useEffect(() => {
    apiFetch<IndexSnapshot[]>('/indices').then(setData).catch(() => setFailed(true))
  }, [])

  if (failed) return null

  const indices = data
    ? (CARD_INDICES.map(code => data.find(d => d.code === code)).filter(Boolean) as IndexSnapshot[])
    : null

  if (indices && !indices.length) return null

  function getPct(idx: IndexSnapshot): number | null {
    switch (periodMode) {
      case 'ytd': return idx.ytd_pct
      case 'last_12m': return idx.m12_pct
      case 'inception': return idx.m12_pct // best available proxy
      default: return idx.m1_pct // current_month, last_30d
    }
  }

  return (
    <div
      className="rounded-2xl p-4 h-full flex flex-col cursor-pointer hover:shadow-md transition-shadow"
      style={{ background: 'var(--arvo-surface)', border: '1px solid var(--arvo-border)' }}
      onClick={() => navigate('/portfolio/indices')}
      title={t.common.allIndices}
    >
      <h2 className="mb-1" style={{ fontFamily: "var(--arvo-font-body)", fontSize: 13, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--arvo-fg)' }}>
        {t.indices.title ?? 'Índices'}
      </h2>
      <p className="mb-3" style={{ fontFamily: "'Playfair Display', serif", fontStyle: 'italic', fontSize: 13, color: 'var(--arvo-fg-soft)' }}>
        {periodLabel}
      </p>
      <div className="flex-1 grid items-baseline content-center" style={{ gridTemplateColumns: '1fr auto auto', columnGap: 14, rowGap: 10 }}>
        {indices
          ? indices.map(idx => {
              const pct = getPct(idx)
              const isPos = pct != null && pct > 0
              const isNeg = pct != null && pct < 0
              const isCDI = idx.code === 'CDI'
              return (
                <Fragment key={idx.code}>
                  <span style={{ fontFamily: "var(--arvo-font-body)", fontSize: 11, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--arvo-fg-soft)' }}>
                    {idx.name}
                  </span>
                  <span className="arvo-num" style={{ fontFamily: "var(--arvo-font-body)", fontSize: 16, letterSpacing: '0.01em', color: 'var(--arvo-fg)', justifySelf: 'end' }}>
                    {fmtVal(idx.value, idx.unit)}
                  </span>
                  <span
                    className="arvo-num"
                    style={{ fontFamily: "var(--arvo-font-body)", fontSize: 13, fontWeight: 600, color: isPos ? 'var(--arvo-green)' : isNeg ? 'var(--arvo-red)' : 'var(--arvo-fg-faint)', justifySelf: 'end', minWidth: 56, textAlign: 'right' }}
                    title={pct == null ? (isCDI ? t.indices.cdiDeltaTooltip : t.indices.deltaUnavailable) : undefined}
                  >
                    {fmtPct(pct)}
                  </span>
                </Fragment>
              )
            })
          : CARD_INDICES.map(code => (
              <Fragment key={code}>
                <div className="h-2.5 w-16 rounded animate-pulse" style={{ background: 'var(--arvo-track-bg)' }} />
                <div className="h-4 w-20 rounded animate-pulse justify-self-end" style={{ background: 'var(--arvo-track-bg)' }} />
                <div className="h-4 w-12 rounded animate-pulse justify-self-end" style={{ background: 'var(--arvo-track-bg)' }} />
              </Fragment>
            ))}
      </div>
    </div>
  )
}
