import { useState, useEffect } from 'react'
import { apiFetch } from '../lib/api'
import { useNavigate } from 'react-router-dom'

interface IndexSnapshot {
  code: string
  name: string
  value: number | null
  m1_pct: number | null
  unit: string
}

const DASHBOARD_INDICES = ['IBOV', 'CDI', 'SP500', 'IPCA'] as const

function fmtVal(v: number | null, unit: string) {
  if (v == null) return '—'
  if (unit === 'pts') return v.toLocaleString('pt-BR', { maximumFractionDigits: 0 })
  if (unit === '% a.a.' || unit === '% a.m.') return `${v.toFixed(2)}%`
  return v.toFixed(2)
}

function fmtPct(v: number | null) {
  if (v == null) return null
  return `${v >= 0 ? '+' : ''}${v.toFixed(2)}%`
}

export default function MarketIndicesBar() {
  const [data, setData] = useState<IndexSnapshot[] | null>(null)
  const navigate = useNavigate()

  useEffect(() => {
    apiFetch<IndexSnapshot[]>('/indices').then(setData).catch(() => {})
  }, [])

  if (!data) return null

  const indices = DASHBOARD_INDICES
    .map(code => data.find(d => d.code === code))
    .filter(Boolean) as IndexSnapshot[]

  if (!indices.length) return null

  return (
    <div
      className="grid grid-cols-2 lg:grid-cols-4 gap-4 cursor-pointer"
      onClick={() => navigate('/indices')}
      title="Ver todos os índices"
    >
      {indices.map(idx => {
        const pct = idx.m1_pct
        const isPos = pct != null && pct > 0
        const isNeg = pct != null && pct < 0
        return (
          <div key={idx.code} className="rounded-2xl p-4" style={{ background: 'white', border: '1px solid var(--arvo-border)' }}>
            <div style={{ fontFamily: "var(--arvo-font-body)", fontSize: 11, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--arvo-fg-soft)', marginBottom: 4 }}>
              {idx.name}
            </div>
            <div style={{ fontFamily: "var(--arvo-font-body)", fontSize: 17, letterSpacing: '0.01em', color: 'var(--arvo-black)', lineHeight: 1.1 }}>
              {fmtVal(idx.value, idx.unit)}
            </div>
            <div className="mt-1 text-xs" style={{ fontFamily: "var(--arvo-font-body)", color: isPos ? 'var(--arvo-green)' : isNeg ? 'var(--arvo-red)' : 'var(--arvo-fg-soft)' }}>
              {pct != null ? (
                <>{fmtPct(pct)} <span style={{ color: 'var(--arvo-fg-soft)' }}>no mês</span></>
              ) : '—'}
            </div>
          </div>
        )
      })}
    </div>
  )
}
