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
  period_pct: number | null
  unit: string
}

type PeriodMode = 'last_5d' | 'current_month' | 'last_30d' | 'ytd' | 'last_12m' | 'inception'

const CARD_INDICES = ['IBOV', 'CDI', 'SP500', 'IPCA'] as const

function fmtVal(v: number | null, unit: string) {
  if (v == null) return '-'
  if (unit === 'pts') return v.toLocaleString('pt-BR', { maximumFractionDigits: 0 })
  if (unit === '% a.a.' || unit === '% a.m.') return `${v.toFixed(2)}%`
  return v.toFixed(2)
}

function fmtPct(v: number | null) {
  if (v == null) return '-'
  return `${v >= 0 ? '+' : ''}${v.toFixed(2)}%`
}

interface Props {
  periodMode: PeriodMode
  periodLabel: string
  windowFrom?: string | null
  windowTo?: string | null
  // Retorno da carteira no MESMO período do card (usePerformanceSummary já calculado
  // pelo Dashboard) — mostrado como segundo número "vs Carteira" pra desambiguar o
  // absoluto do índice sem duplicar o cálculo de performance aqui.
  portfolioReturnPct?: number | null
}

export default function MarketIndicesCard({ periodMode, periodLabel, windowFrom, windowTo, portfolioReturnPct }: Props) {
  const [data, setData] = useState<IndexSnapshot[] | null>(null)
  const [failed, setFailed] = useState(false)
  const { t } = useI18n()
  const navigate = useNavigate()

  useEffect(() => {
    const qs = windowFrom && windowTo ? `?from=${windowFrom}&to=${windowTo}` : ''
    apiFetch<IndexSnapshot[]>(`/indices${qs}`).then(setData).catch(() => setFailed(true))
  }, [windowFrom, windowTo])

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
      case 'last_5d':
      case 'last_30d':
      case 'current_month':
        return idx.period_pct ?? idx.m1_pct
    }
  }

  return (
    <div
      className="rounded-2xl p-4 h-full flex flex-col cursor-pointer hover:shadow-md transition-shadow"
      style={{ background: 'var(--arvo-surface)', border: '1px solid var(--arvo-border)' }}
      onClick={() => navigate('/portfolio/indices')}
      title={t.common.allIndices}
    >
      <h2 className="mb-1" style={{ fontFamily: "var(--arvo-font-body)", fontSize: 14, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--arvo-fg)' }}>
        {t.indices.title ?? 'Índices'}
      </h2>
      <p className="mb-3" style={{ fontFamily: "'Fraunces', serif", fontStyle: 'italic', fontSize: 14, color: 'var(--arvo-fg-soft)' }}>
        {periodLabel}
      </p>
      <div className="flex-1 grid items-baseline content-center" style={{ gridTemplateColumns: `1fr auto auto${portfolioReturnPct != null ? ' auto' : ''}`, columnGap: 14, rowGap: 10 }}>
        {indices
          ? indices.map(idx => {
              const pct = getPct(idx)
              const isPos = pct != null && pct > 0
              const isNeg = pct != null && pct < 0
              const isCDI = idx.code === 'CDI'
              // Vs. carteira: dois números lado a lado (absoluto do índice + relativo à
              // carteira no mesmo período), pra não confundir com o número relativo/
              // absoluto que aparece em outras telas (ex: linha de 30d na Hoje).
              const vsPortfolio = pct != null && portfolioReturnPct != null ? Math.round((portfolioReturnPct - pct) * 100) / 100 : null
              const vsPos = vsPortfolio != null && vsPortfolio > 0
              const vsNeg = vsPortfolio != null && vsPortfolio < 0
              return (
                <Fragment key={idx.code}>
                  <span style={{ fontFamily: "var(--arvo-font-body)", fontSize: 12, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--arvo-fg-soft)' }}>
                    {idx.name}
                  </span>
                  <span className="arvo-num" style={{ fontFamily: "var(--arvo-font-body)", fontSize: 16, letterSpacing: '0.01em', color: 'var(--arvo-fg)', justifySelf: 'end' }}>
                    {fmtVal(idx.value, idx.unit)}
                  </span>
                  <span
                    className="arvo-num"
                    style={{ fontFamily: "var(--arvo-font-body)", fontSize: 14, fontWeight: 600, color: isPos ? 'var(--arvo-green)' : isNeg ? 'var(--arvo-red)' : 'var(--arvo-fg-faint)', justifySelf: 'end', minWidth: 56, textAlign: 'right' }}
                    title={pct == null ? (isCDI ? t.indices.cdiDeltaTooltip : t.indices.deltaUnavailable) : undefined}
                  >
                    {fmtPct(pct)}
                  </span>
                  {portfolioReturnPct != null && (
                    <span
                      className="arvo-num"
                      style={{ fontFamily: "var(--arvo-font-body)", fontSize: 12.5, fontWeight: 600, color: vsPos ? 'var(--arvo-green)' : vsNeg ? 'var(--arvo-red)' : 'var(--arvo-fg-faint)', justifySelf: 'end', minWidth: 60, textAlign: 'right' }}
                      title={t.indices.vsPortfolioTooltip}
                    >
                      {vsPortfolio == null ? '-' : `${vsPortfolio >= 0 ? '+' : ''}${vsPortfolio.toFixed(2)}%`}
                    </span>
                  )}
                </Fragment>
              )
            })
          : CARD_INDICES.map(code => (
              <Fragment key={code}>
                <div className="h-2.5 w-16 rounded animate-pulse" style={{ background: 'var(--arvo-track-bg)' }} />
                <div className="h-4 w-20 rounded animate-pulse justify-self-end" style={{ background: 'var(--arvo-track-bg)' }} />
                <div className="h-4 w-12 rounded animate-pulse justify-self-end" style={{ background: 'var(--arvo-track-bg)' }} />
                {portfolioReturnPct != null && <div className="h-4 w-12 rounded animate-pulse justify-self-end" style={{ background: 'var(--arvo-track-bg)' }} />}
              </Fragment>
            ))}
      </div>
      {portfolioReturnPct != null && (
        <p className="mt-2" style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 9.5, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--arvo-fg-faint)', textAlign: 'right' }}>
          {t.indices.vsPortfolioLabel}
        </p>
      )}
    </div>
  )
}
