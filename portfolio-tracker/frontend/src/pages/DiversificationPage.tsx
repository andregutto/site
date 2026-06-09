import { useMemo, useState } from 'react'
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid } from 'recharts'
import { usePortfolioValue } from '../hooks/usePortfolio'
import { useCurrency } from '../contexts/CurrencyContext'
import { useI18n } from '../contexts/I18nContext'
import type { PortfolioAsset } from '../lib/types'

type Tab = 'geo' | 'sector' | 'risk'

interface CountryInfo { key: string; flag: string; label: string; color: string }

const COUNTRY_MAP: Record<string, CountryInfo> = {
  BR:     { key: 'BR',     flag: '🇧🇷', label: '', color: '#1B4FD8' },
  US:     { key: 'US',     flag: '🇺🇸', label: '', color: '#E8A020' },
  EU:     { key: 'EU',     flag: '🇪🇺', label: '', color: '#16A34A' },
  CRYPTO: { key: 'CRYPTO', flag: '🌐', label: '', color: '#9333EA' },
  OTHER:  { key: 'OTHER',  flag: '📋', label: '', color: '#94A3B8' },
}

const SECTOR_PALETTE = ['#1B4FD8', '#E8A020', '#D63B2F', '#16A34A', '#9333EA', '#0891B2', '#EA580C', '#6B7280', '#0D9488', '#BE185D']

function getCountryKey(asset: PortfolioAsset): string {
  const exch = (asset.exchange ?? '').toUpperCase()
  if (asset.source === 'fixed_income') return 'BR'
  if (['BVMF', 'B3', 'BOVESPA', 'SAO'].some(e => exch.startsWith(e))) return 'BR'
  if (['NYSE', 'NASDAQ', 'AMEX', 'NYSEARCA', 'NYQ', 'NMS', 'PCX', 'NGM', 'BATS', 'CBOE'].includes(exch)) return 'US'
  if (['XPAR', 'XETR', 'XLON', 'LSE', 'EURONEXT', 'XAMS', 'XBRU', 'XMIL', 'XMAD', 'AMS', 'FRA', 'EPA'].includes(exch)) return 'EU'
  if (asset.source === 'coingecko') return 'CRYPTO'
  if (asset.currency === 'BRL') return 'BR'
  if (asset.currency === 'USD') return 'US'
  if (asset.currency === 'EUR') return 'EU'
  return 'OTHER'
}

function getRiskWeight(classKey: string | null | undefined, source: string): number {
  const k = (classKey ?? '').toLowerCase()
  if (k.includes('caixa') || k.includes('cash')) return 1
  if (k.includes('rendafixa') || k.includes('previdencia') || source === 'fixed_income') return 2
  if (k.includes('fiis') || k.includes('imoveis') || k.includes('imóveis')) return 3
  if (k.includes('acoes') || k.includes('ações') || k.includes('equit') || k.includes('etf')) return 4
  if (k.includes('cripto') || k.includes('crypto')) return 5
  if (source === 'fixed_income') return 2
  return 3
}

function calcHHI(shares: number[]): number {
  return shares.reduce((s, x) => s + x * x, 0)
}

function MetricCard({ label, value, sub, badge, badgeColor }: {
  label: string; value: string; sub?: string; badge?: string; badgeColor?: string
}) {
  return (
    <div style={{ background: '#fff', borderRadius: 12, border: '1px solid var(--arvo-border)', padding: '20px' }}>
      <div style={{ fontSize: 11, fontWeight: 500, color: 'var(--arvo-fg-soft)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>{label}</div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
        <div style={{ fontSize: 28, fontWeight: 700, color: 'var(--arvo-black)', lineHeight: 1 }}>{value}</div>
        {badge && (
          <span style={{ fontSize: 11, fontWeight: 600, color: badgeColor, background: (badgeColor ?? '#000') + '18', padding: '3px 8px', borderRadius: 20 }}>{badge}</span>
        )}
      </div>
      {sub && <div style={{ fontSize: 12, color: 'var(--arvo-fg-soft)', marginTop: 6, lineHeight: 1.4 }}>{sub}</div>}
    </div>
  )
}

export default function DiversificationPage() {
  const { t } = useI18n()
  const { fmt, hideValues } = useCurrency()
  const { data, loading } = usePortfolioValue()
  const [tab, setTab] = useState<Tab>('geo')

  const d = t.diversification

  const assets = useMemo(() => data?.by_asset ?? [], [data])
  const total = data?.total_brl ?? 0

  const fmtPct = (n: number) => `${Math.round(n * 100)}%`
  const fmtVal = (n: number) => hideValues ? '•••' : fmt(n)

  // Geo grouping
  const geoGroups = useMemo(() => {
    const map = new Map<string, { key: string; flag: string; label: string; color: string; value: number }>()
    for (const a of assets) {
      const key = getCountryKey(a)
      const info = COUNTRY_MAP[key] ?? COUNTRY_MAP.OTHER
      const existing = map.get(key)
      if (existing) existing.value += a.value_brl
      else map.set(key, { ...info, value: a.value_brl })
    }
    return [...map.values()]
      .map(g => ({ ...g, pct: total > 0 ? g.value / total : 0 }))
      .sort((a, b) => b.value - a.value)
  }, [assets, total])

  // Sector grouping
  const sectorGroups = useMemo(() => {
    const map = new Map<string, { key: string; label: string; color: string; value: number; idx: number }>()
    let idx = 0
    for (const a of assets) {
      const key = a.class_name_key ?? a.class_name ?? 'other'
      const existing = map.get(key)
      if (existing) { existing.value += a.value_brl }
      else { map.set(key, { key, label: a.class_name, color: a.class_color || SECTOR_PALETTE[idx % SECTOR_PALETTE.length], value: a.value_brl, idx: idx++ }) }
    }
    return [...map.values()]
      .map(g => ({ ...g, pct: total > 0 ? g.value / total : 0 }))
      .sort((a, b) => b.value - a.value)
  }, [assets, total])

  // Risk metrics
  const riskMetrics = useMemo(() => {
    if (!assets.length || total === 0) return null
    const assetShares = assets.map(a => a.value_brl / total)
    const assetHHI = calcHHI(assetShares)
    const effectiveN = assetHHI > 0 ? 1 / assetHHI : 0
    const geoHHI = calcHHI(geoGroups.map(g => g.pct))
    const sectorHHI = calcHHI(sectorGroups.map(g => g.pct))
    const sorted = [...assets].sort((a, b) => b.value_brl - a.value_brl)
    const top3 = sorted.slice(0, 3).reduce((s, a) => s + a.value_brl, 0) / total
    const top10 = sorted.slice(0, 10).reduce((s, a) => s + a.value_brl, 0) / total
    const weightedRisk = assets.reduce((s, a) => s + (a.value_brl / total) * getRiskWeight(a.class_name_key, a.source), 0)
    const byClass = sectorGroups.map((g, i) => ({
      name: g.label,
      pct: Math.round(g.pct * 100),
      risk: getRiskWeight(g.key, ''),
      color: SECTOR_PALETTE[i % SECTOR_PALETTE.length],
    }))
    return { assetHHI, effectiveN, geoHHI, sectorHHI, top3, top10, weightedRisk, byClass }
  }, [assets, total, geoGroups, sectorGroups])

  function hhiBadge(hhi: number): { text: string; color: string } {
    if (hhi < 0.10) return { text: d.hhiLow, color: '#16A34A' }
    if (hhi < 0.18) return { text: d.hhiMedium, color: '#E8A020' }
    return { text: d.hhiHigh, color: '#D63B2F' }
  }

  function riskBadge(score: number): { text: string; color: string } {
    if (score < 1.5) return { text: d.riskScaleLow, color: '#16A34A' }
    if (score < 2.5) return { text: d.riskScaleMedium, color: '#65A30D' }
    if (score < 3.5) return { text: d.riskScaleHigh, color: '#E8A020' }
    if (score < 4.5) return { text: d.riskScaleVeryHigh, color: '#EA580C' }
    return { text: d.riskScaleVeryHigh, color: '#D63B2F' }
  }

  const TABS: { key: Tab; label: string }[] = [
    { key: 'geo', label: d.tabGeo },
    { key: 'sector', label: d.tabSector },
    { key: 'risk', label: d.tabRisk },
  ]

  const customTooltip = ({ active, payload }: { active?: boolean; payload?: Array<{ name: string; value: number; payload: { pct: number } }> }) => {
    if (!active || !payload?.length) return null
    const entry = payload[0]
    return (
      <div style={{ background: '#fff', border: '1px solid var(--arvo-border)', borderRadius: 8, padding: '8px 12px', boxShadow: '0 2px 8px rgba(0,0,0,0.08)', fontSize: 12 }}>
        <div style={{ fontWeight: 600, marginBottom: 2 }}>{entry.name}</div>
        <div>{fmtVal(entry.value)}</div>
        <div style={{ color: 'var(--arvo-fg-soft)' }}>{fmtPct(entry.payload?.pct ?? 0)}</div>
      </div>
    )
  }

  if (loading) return (
    <div style={{ padding: 32, textAlign: 'center', color: 'var(--arvo-fg-soft)', fontFamily: 'var(--arvo-font-body)' }}>...</div>
  )

  if (!assets.length) return (
    <div style={{ padding: 48, textAlign: 'center', color: 'var(--arvo-fg-soft)', fontFamily: 'var(--arvo-font-body)' }}>{d.noData}</div>
  )

  return (
    <div style={{ maxWidth: 800, margin: '0 auto', padding: '24px 16px 64px', fontFamily: 'var(--arvo-font-body)' }}>

      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontFamily: 'var(--arvo-font-display)', fontSize: 22, fontWeight: 700, color: 'var(--arvo-black)', margin: '0 0 4px' }}>{d.title}</h1>
        <p style={{ fontSize: 13, color: 'var(--arvo-fg-soft)', margin: 0 }}>{d.subtitle}</p>
      </div>

      {/* Tab pills */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 24, background: 'rgba(0,0,0,0.05)', borderRadius: 10, padding: 4 }}>
        {TABS.map(item => (
          <button
            key={item.key}
            onClick={() => setTab(item.key)}
            style={{
              flex: 1, padding: '8px 0', border: 'none', borderRadius: 7,
              fontSize: 13, fontFamily: 'var(--arvo-font-body)',
              fontWeight: tab === item.key ? 600 : 400,
              cursor: 'pointer',
              background: tab === item.key ? '#fff' : 'transparent',
              color: tab === item.key ? 'var(--arvo-black)' : 'var(--arvo-fg-soft)',
              boxShadow: tab === item.key ? '0 1px 3px rgba(0,0,0,0.10)' : 'none',
              transition: 'all 0.15s',
            }}
          >
            {item.label}
          </button>
        ))}
      </div>

      {/* ── GEO TAB ── */}
      {tab === 'geo' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ background: '#fff', borderRadius: 12, border: '1px solid var(--arvo-border)', padding: '24px' }}>
            <h2 style={{ fontSize: 15, fontWeight: 600, margin: '0 0 20px', color: 'var(--arvo-black)' }}>{d.geoTitle}</h2>
            <div style={{ display: 'flex', gap: 24, alignItems: 'center', flexWrap: 'wrap' }}>
              <div style={{ flex: '0 0 180px', height: 180 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={geoGroups} dataKey="value" nameKey="label" innerRadius={52} outerRadius={82} paddingAngle={2}>
                      {geoGroups.map(g => <Cell key={g.key} fill={g.color} />)}
                    </Pie>
                    <Tooltip content={customTooltip as any} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div style={{ flex: 1, minWidth: 180 }}>
                {geoGroups.map(g => (
                  <div key={g.key} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                    <span style={{ fontSize: 20, lineHeight: 1 }}>{g.flag}</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                        <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--arvo-black)' }}>{g.label}</span>
                        <span style={{ fontSize: 12, color: 'var(--arvo-fg-soft)' }}>{fmtPct(g.pct)}</span>
                      </div>
                      <div style={{ height: 4, background: 'var(--arvo-border)', borderRadius: 2 }}>
                        <div style={{ height: '100%', width: `${g.pct * 100}%`, background: g.color, borderRadius: 2 }} />
                      </div>
                    </div>
                    <span style={{ fontSize: 12, color: 'var(--arvo-fg-soft)', minWidth: 68, textAlign: 'right' }}>{fmtVal(g.value)}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {riskMetrics && (() => {
            const { text, color } = hhiBadge(riskMetrics.geoHHI)
            return (
              <MetricCard
                label={d.geoHhi}
                value={riskMetrics.geoHHI.toFixed(3)}
                badge={text}
                badgeColor={color}
                sub={d.hhiDesc}
              />
            )
          })()}
        </div>
      )}

      {/* ── SECTOR TAB ── */}
      {tab === 'sector' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ background: '#fff', borderRadius: 12, border: '1px solid var(--arvo-border)', padding: '24px' }}>
            <h2 style={{ fontSize: 15, fontWeight: 600, margin: '0 0 20px', color: 'var(--arvo-black)' }}>{d.sectorTitle}</h2>
            <div style={{ display: 'flex', gap: 24, alignItems: 'center', flexWrap: 'wrap' }}>
              <div style={{ flex: '0 0 180px', height: 180 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={sectorGroups} dataKey="value" nameKey="label" innerRadius={52} outerRadius={82} paddingAngle={2}>
                      {sectorGroups.map((g, i) => <Cell key={g.key} fill={SECTOR_PALETTE[i % SECTOR_PALETTE.length]} />)}
                    </Pie>
                    <Tooltip content={customTooltip as any} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div style={{ flex: 1, minWidth: 180 }}>
                {sectorGroups.map((g, i) => (
                  <div key={g.key} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                    <div style={{ width: 10, height: 10, borderRadius: 2, background: SECTOR_PALETTE[i % SECTOR_PALETTE.length], flexShrink: 0 }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                        <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--arvo-black)' }}>{g.label}</span>
                        <span style={{ fontSize: 12, color: 'var(--arvo-fg-soft)' }}>{fmtPct(g.pct)}</span>
                      </div>
                      <div style={{ height: 4, background: 'var(--arvo-border)', borderRadius: 2 }}>
                        <div style={{ height: '100%', width: `${g.pct * 100}%`, background: SECTOR_PALETTE[i % SECTOR_PALETTE.length], borderRadius: 2 }} />
                      </div>
                    </div>
                    <span style={{ fontSize: 12, color: 'var(--arvo-fg-soft)', minWidth: 68, textAlign: 'right' }}>{fmtVal(g.value)}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {riskMetrics && (() => {
            const { text, color } = hhiBadge(riskMetrics.sectorHHI)
            return (
              <MetricCard
                label={d.sectorHhi}
                value={riskMetrics.sectorHHI.toFixed(3)}
                badge={text}
                badgeColor={color}
                sub={d.hhiDesc}
              />
            )
          })()}
        </div>
      )}

      {/* ── RISK TAB ── */}
      {tab === 'risk' && riskMetrics && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

          {/* KPI row */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12 }}>
            {(() => {
              const { text, color } = riskBadge(riskMetrics.weightedRisk)
              return (
                <MetricCard
                  label={d.riskScore}
                  value={riskMetrics.weightedRisk.toFixed(2)}
                  badge={text}
                  badgeColor={color}
                  sub={d.riskScoreDesc}
                />
              )
            })()}
            {(() => {
              const { text, color } = hhiBadge(riskMetrics.assetHHI)
              return (
                <MetricCard
                  label={d.assetHhi}
                  value={riskMetrics.assetHHI.toFixed(3)}
                  badge={text}
                  badgeColor={color}
                />
              )
            })()}
            <MetricCard
              label={d.effectiveN}
              value={riskMetrics.effectiveN.toFixed(1)}
              sub={d.effectiveNDesc}
            />
          </div>

          {/* Concentration row */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12 }}>
            {(() => {
              const color = riskMetrics.top3 > 0.5 ? '#D63B2F' : riskMetrics.top3 > 0.35 ? '#E8A020' : '#16A34A'
              return (
                <MetricCard
                  label={d.top3Conc}
                  value={fmtPct(riskMetrics.top3)}
                  badge={riskMetrics.top3 > 0.5 ? d.hhiHigh : riskMetrics.top3 > 0.35 ? d.hhiMedium : d.hhiLow}
                  badgeColor={color}
                />
              )
            })()}
            {(() => {
              const color = riskMetrics.top10 > 0.9 ? '#D63B2F' : riskMetrics.top10 > 0.7 ? '#E8A020' : '#16A34A'
              return (
                <MetricCard
                  label={d.top10Conc}
                  value={fmtPct(riskMetrics.top10)}
                  badge={riskMetrics.top10 > 0.9 ? d.hhiHigh : riskMetrics.top10 > 0.7 ? d.hhiMedium : d.hhiLow}
                  badgeColor={color}
                />
              )
            })()}
          </div>

          {/* Risk by class chart */}
          <div style={{ background: '#fff', borderRadius: 12, border: '1px solid var(--arvo-border)', padding: '24px' }}>
            <h2 style={{ fontSize: 15, fontWeight: 600, margin: '0 0 20px', color: 'var(--arvo-black)' }}>{d.riskByClass}</h2>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={riskMetrics.byClass} layout="vertical" margin={{ left: 12, right: 24, top: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="var(--arvo-border)" />
                <XAxis type="number" domain={[0, 100]} tickFormatter={v => `${v}%`} tick={{ fontSize: 11, fill: 'var(--arvo-fg-soft)' }} />
                <YAxis type="category" dataKey="name" width={96} tick={{ fontSize: 12, fill: 'var(--arvo-black)' }} />
                <Tooltip
                  formatter={(v: number) => [`${v}%`, d.allocationPct]}
                  contentStyle={{ fontSize: 12, border: '1px solid var(--arvo-border)', borderRadius: 8 }}
                />
                <Bar dataKey="pct" radius={[0, 4, 4, 0]}>
                  {riskMetrics.byClass.map((entry, i) => (
                    <Cell key={i} fill={SECTOR_PALETTE[i % SECTOR_PALETTE.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>

            {/* Risk legend */}
            <div style={{ marginTop: 20, display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {[
                { level: 1, label: d.riskLevelVeryLow, color: '#16A34A' },
                { level: 2, label: d.riskLevelLow, color: '#65A30D' },
                { level: 3, label: d.riskLevelMedium, color: '#E8A020' },
                { level: 4, label: d.riskLevelHigh, color: '#EA580C' },
                { level: 5, label: d.riskLevelVeryHigh, color: '#D63B2F' },
              ].map(r => (
                <span key={r.level} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: 'var(--arvo-fg-soft)' }}>
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: r.color, display: 'inline-block' }} />
                  {r.level} — {r.label}
                </span>
              ))}
            </div>
          </div>

          {/* HHI comparison */}
          <div style={{ background: '#fff', borderRadius: 12, border: '1px solid var(--arvo-border)', padding: '20px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
              {[
                { label: d.assetHhi, val: riskMetrics.assetHHI },
                { label: d.geoHhi, val: riskMetrics.geoHHI },
                { label: d.sectorHhi, val: riskMetrics.sectorHHI },
              ].map(m => {
                const { text, color } = hhiBadge(m.val)
                return (
                  <div key={m.label} style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: 11, color: 'var(--arvo-fg-soft)', marginBottom: 6 }}>{m.label}</div>
                    <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--arvo-black)' }}>{m.val.toFixed(3)}</div>
                    <span style={{ fontSize: 11, fontWeight: 600, color, background: color + '18', padding: '2px 8px', borderRadius: 20, marginTop: 4, display: 'inline-block' }}>{text}</span>
                  </div>
                )
              })}
            </div>
            <p style={{ fontSize: 12, color: 'var(--arvo-fg-soft)', margin: '16px 0 0', lineHeight: 1.5 }}>{d.hhiDesc}</p>
          </div>
        </div>
      )}
    </div>
  )
}
