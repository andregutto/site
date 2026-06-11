import { useEffect, useMemo, useState } from 'react'
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid } from 'recharts'
import { usePortfolioValue } from '../hooks/usePortfolio'
import { useCurrency } from '../contexts/CurrencyContext'
import { useI18n } from '../contexts/I18nContext'
import { apiFetch } from '../lib/api'
import PageHeaderTabs from '../components/PageHeaderTabs'
import type { PortfolioAsset } from '../lib/types'

type Tab = 'geo' | 'sector' | 'risk'

const SECTOR_PALETTE = ['#1B4FD8', '#E8A020', '#D63B2F', '#16A34A', '#9333EA', '#0891B2', '#EA580C', '#6B7280', '#0D9488', '#BE185D']
const RISK_COLORS = ['#16A34A', '#65A30D', '#E8A020', '#EA580C', '#D63B2F']

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

// Normalized HHI: 0 = perfectly equal, 1 = fully concentrated
// Accounts for minimum possible HHI with n buckets (1/n)
function normalizeHHI(hhi: number, n: number): number {
  if (n <= 1) return 0
  const min = 1 / n
  return (hhi - min) / (1 - min)
}

function MetricCard({ label, value, sub, badge, badgeColor }: {
  label: string; value: string; sub?: string; badge?: string; badgeColor?: string
}) {
  return (
    <div style={{ background: 'var(--arvo-surface)', borderRadius: 12, border: '1px solid var(--arvo-border)', padding: '20px' }}>
      <div style={{ fontSize: 11, fontWeight: 500, color: 'var(--arvo-fg-soft)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 28, fontWeight: 700, color: 'var(--arvo-fg)', lineHeight: 1 }}>{value}</div>
      {badge && (
        <span style={{ display: 'inline-block', fontSize: 11, fontWeight: 600, color: badgeColor, background: (badgeColor ?? '#000') + '18', padding: '3px 8px', borderRadius: 20, marginTop: 8 }}>{badge}</span>
      )}
      {sub && <div style={{ fontSize: 12, color: 'var(--arvo-fg-soft)', marginTop: 6, lineHeight: 1.4 }}>{sub}</div>}
    </div>
  )
}

// Lead card for each subnav: a large, color-coded conclusion (the tool's analysis),
// followed by a short contextual sentence and a supporting stat.
function ConclusionCard({ label, headline, headlineColor, description, stat, statLabel }: {
  label: string; headline: string; headlineColor: string
  description?: string; stat?: string; statLabel?: string
}) {
  return (
    <div style={{ background: 'var(--arvo-surface)', borderRadius: 12, border: '1px solid var(--arvo-border)', padding: '24px' }}>
      <div style={{ fontSize: 11, fontWeight: 500, color: 'var(--arvo-fg-soft)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>{label}</div>
      <div style={{ fontSize: 30, fontWeight: 800, color: headlineColor, lineHeight: 1.15, marginBottom: description ? 8 : 0 }}>{headline}</div>
      {description && <p style={{ fontSize: 13, color: 'var(--arvo-fg-muted)', margin: 0, lineHeight: 1.5 }}>{description}</p>}
      {stat && (
        <div style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid var(--arvo-border)', display: 'flex', alignItems: 'baseline', gap: 8 }}>
          <span style={{ fontSize: 20, fontWeight: 700, color: 'var(--arvo-fg)' }}>{stat}</span>
          {statLabel && <span style={{ fontSize: 12, color: 'var(--arvo-fg-soft)' }}>{statLabel}</span>}
        </div>
      )}
    </div>
  )
}

function CollapsibleInfoCard({ title, children }: { title: string; children: React.ReactNode }) {
  const [expanded, setExpanded] = useState(false)
  return (
    <div style={{ background: 'var(--arvo-blue-tint)', borderRadius: 10, border: '1px solid rgba(27,79,216,0.20)', padding: '14px 16px', fontSize: 12, lineHeight: 1.6 }}>
      <button
        onClick={() => setExpanded(v => !v)}
        style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontSize: 12, color: 'var(--arvo-blue)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}
      >
        <span style={{ fontSize: 14 }}>ℹ️</span>
        {title} — {expanded ? '▲' : '▼'}
      </button>
      {expanded && (
        <div style={{ marginTop: 10, color: 'var(--arvo-fg-muted)' }}>
          {children}
        </div>
      )}
    </div>
  )
}

export default function DiversificationPage() {
  const { t } = useI18n()
  const { fmt, hideValues } = useCurrency()
  const { data, loading } = usePortfolioValue()
  const [tab, setTab] = useState<Tab>('geo')
  const [sectorData, setSectorData] = useState<Record<string, string | null> | null>(null)
  const [sectorLoading, setSectorLoading] = useState(false)

  const d = t.diversification

  const assets = useMemo(() => data?.by_asset ?? [], [data])
  const total = data?.total_brl ?? 0

  const fmtPct = (n: number) => `${Math.round(n * 100)}%`
  const fmtVal = (n: number) => hideValues ? '•••' : fmt(n)

  // Fetch sector data when sector tab is opened
  useEffect(() => {
    if (tab !== 'sector' || sectorData !== null || sectorLoading) return
    setSectorLoading(true)
    apiFetch<{ sectors: Record<string, string | null> }>('/portfolio/sector-data')
      .then(r => setSectorData(r.sectors))
      .catch(() => setSectorData({}))
      .finally(() => setSectorLoading(false))
  }, [tab, sectorData, sectorLoading])

  // Country labels from i18n (can't use COUNTRY_MAP at module scope — no i18n access there)
  const countryConfig = useMemo(() => ({
    BR:     { flag: '🇧🇷', label: d.countryBR,     color: '#1B4FD8' },
    US:     { flag: '🇺🇸', label: d.countryUS,     color: '#E8A020' },
    EU:     { flag: '🇪🇺', label: d.countryEU,     color: '#16A34A' },
    CRYPTO: { flag: '🌐',  label: d.countryCrypto, color: '#9333EA' },
    OTHER:  { flag: '📋',  label: d.countryOther,  color: '#94A3B8' },
  }), [d])

  // Geo grouping
  const geoGroups = useMemo(() => {
    const map = new Map<string, { key: string; flag: string; label: string; color: string; value: number }>()
    for (const a of assets) {
      const key = getCountryKey(a)
      const info = countryConfig[key as keyof typeof countryConfig] ?? countryConfig.OTHER
      const existing = map.get(key)
      if (existing) existing.value += a.value_brl
      else map.set(key, { key, ...info, value: a.value_brl })
    }
    return [...map.values()]
      .map(g => ({ ...g, pct: total > 0 ? g.value / total : 0 }))
      .sort((a, b) => b.value - a.value)
  }, [assets, total, countryConfig])

  // Class grouping (fallback for sector tab when no sector data)
  const classGroups = useMemo(() => {
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

  // Real sector grouping (from Yahoo Finance data)
  const realSectorGroups = useMemo(() => {
    if (!sectorData) return null
    const fallbackLabel = d.sectorOther ?? 'Outros'
    const map = new Map<string, { key: string; label: string; color: string; value: number; idx: number }>()
    let idx = 0
    for (const a of assets) {
      // Use real sector; fall back to translated "Outros" (never class name in sector view)
      const sector = sectorData[a.code] ?? fallbackLabel
      const key = sector.toLowerCase().replace(/\s+/g, '_').replace(/[^\w]/g, '')
      const existing = map.get(key)
      if (existing) { existing.value += a.value_brl }
      else { map.set(key, { key, label: sector, color: SECTOR_PALETTE[idx % SECTOR_PALETTE.length], value: a.value_brl, idx: idx++ }) }
    }
    return [...map.values()]
      .map(g => ({ ...g, pct: total > 0 ? g.value / total : 0 }))
      .sort((a, b) => b.value - a.value)
  }, [assets, total, sectorData, d.sectorOther])

  const sectorGroups = realSectorGroups ?? classGroups
  const hasBrapiSectors = sectorData !== null && Object.values(sectorData).some(v => v && !['Renda Fixa', 'Cripto'].includes(v))

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
    // Color each bar by its risk level (not arbitrary palette)
    const byClass = classGroups.map(g => ({
      name: g.label,
      pct: Math.round(g.pct * 100),
      risk: getRiskWeight(g.key, ''),
      color: RISK_COLORS[Math.min(getRiskWeight(g.key, '') - 1, 4)],
    }))
    const maxClassPct = Math.max(...byClass.map(c => c.pct), 0)
    const xAxisMax = Math.min(100, Math.ceil((maxClassPct + 5) / 10) * 10)
    return { assetHHI, effectiveN, geoHHI, sectorHHI, top3, top10, weightedRisk, byClass, xAxisMax }
  }, [assets, total, geoGroups, sectorGroups, classGroups])

  // HHI badge uses normalized HHI to account for bucket count
  function hhiBadge(hhi: number, n: number): { text: string; color: string; norm: number } {
    const norm = normalizeHHI(hhi, n)
    if (norm < 0.15) return { text: d.hhiLow,    color: '#16A34A', norm }
    if (norm < 0.40) return { text: d.hhiMedium, color: '#E8A020', norm }
    return { text: d.hhiHigh, color: '#D63B2F', norm }
  }

  function riskBadge(score: number): { text: string; color: string } {
    if (score < 1.5) return { text: d.riskScaleLow,      color: '#16A34A' }
    if (score < 2.5) return { text: d.riskScaleMedium,   color: '#65A30D' }
    if (score < 3.5) return { text: d.riskScaleHigh,     color: '#E8A020' }
    if (score < 4.5) return { text: d.riskScaleVeryHigh, color: '#EA580C' }
    return { text: d.riskScaleVeryHigh, color: '#D63B2F' }
  }

  const TABS: { key: Tab; label: string }[] = [
    { key: 'geo',    label: d.tabGeo },
    { key: 'sector', label: d.tabSector },
    { key: 'risk',   label: d.tabRisk },
  ]

  const customTooltip = ({ active, payload }: { active?: boolean; payload?: Array<{ name: string; value: number; payload: { pct: number } }> }) => {
    if (!active || !payload?.length) return null
    const entry = payload[0]
    return (
      <div style={{ background: 'var(--arvo-surface)', border: '1px solid var(--arvo-border)', borderRadius: 8, padding: '8px 12px', boxShadow: '0 2px 8px var(--arvo-border)', fontSize: 12 }}>
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

      <PageHeaderTabs title={d.title} subtitle={d.subtitle} tabs={TABS} activeTab={tab} onTabChange={setTab} />

      {/* ── GEO TAB ── */}
      {tab === 'geo' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {riskMetrics && (() => {
            const { text, color } = hhiBadge(riskMetrics.geoHHI, geoGroups.length)
            const top = geoGroups[0]
            const description = top
              ? d.geoConclusionDesc.replace('{country}', top.label).replace('{pct}', fmtPct(top.pct))
              : undefined
            return (
              <ConclusionCard
                label={d.geoConcentrationLabel}
                headline={text}
                headlineColor={color}
                description={description}
                stat={riskMetrics.geoHHI.toFixed(3)}
                statLabel={d.geoHhi}
              />
            )
          })()}

          <div style={{ background: 'var(--arvo-surface)', borderRadius: 12, border: '1px solid var(--arvo-border)', padding: '24px' }}>
            <h2 style={{ fontSize: 15, fontWeight: 600, margin: '0 0 20px', color: 'var(--arvo-fg)' }}>{d.geoTitle}</h2>
            <div style={{ display: 'flex', gap: 24, alignItems: 'center', flexWrap: 'wrap' }}>
              <div style={{ flex: '0 0 180px', height: 180 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={geoGroups} dataKey="value" nameKey="label" innerRadius={52} outerRadius={82} paddingAngle={2} stroke="var(--arvo-surface)" strokeWidth={2}>
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
                        <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--arvo-fg)' }}>{g.label}</span>
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

          <HhiInfoCard d={d} />
        </div>
      )}

      {/* ── SECTOR TAB ── */}
      {tab === 'sector' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {riskMetrics && (() => {
            const { text, color } = hhiBadge(riskMetrics.sectorHHI, sectorGroups.length)
            const top = sectorGroups[0]
            const description = top
              ? d.sectorConclusionDesc.replace('{sector}', top.label).replace('{pct}', fmtPct(top.pct))
              : undefined
            return (
              <ConclusionCard
                label={d.sectorConcentrationLabel}
                headline={text}
                headlineColor={color}
                description={description}
                stat={riskMetrics.sectorHHI.toFixed(3)}
                statLabel={d.sectorHhi}
              />
            )
          })()}

          <div style={{ background: 'var(--arvo-surface)', borderRadius: 12, border: '1px solid var(--arvo-border)', padding: '24px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20, gap: 8 }}>
              <h2 style={{ fontSize: 15, fontWeight: 600, margin: 0, color: 'var(--arvo-fg)' }}>{d.sectorTitle}</h2>
              {sectorLoading && <span style={{ fontSize: 11, color: 'var(--arvo-fg-soft)' }}>⏳</span>}
              {hasBrapiSectors && !sectorLoading && (
                <span style={{ fontSize: 10, color: '#16A34A', background: '#dcfce7', padding: '2px 8px', borderRadius: 10, whiteSpace: 'nowrap' }}>{d.sectorRealDataNote ?? 'BRAPI'}</span>
              )}
            </div>
            {!hasBrapiSectors && sectorData !== null && !sectorLoading && (
              <p style={{ fontSize: 11, color: 'var(--arvo-fg-soft)', margin: '0 0 16px', fontStyle: 'italic' }}>{d.sectorFallbackNote}</p>
            )}
            <div style={{ display: 'flex', gap: 24, alignItems: 'center', flexWrap: 'wrap' }}>
              <div style={{ flex: '0 0 180px', height: 180 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={sectorGroups} dataKey="value" nameKey="label" innerRadius={52} outerRadius={82} paddingAngle={2} stroke="var(--arvo-surface)" strokeWidth={2}>
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
                        <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--arvo-fg)' }}>{g.label}</span>
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

          <HhiInfoCard d={d} />
        </div>
      )}

      {/* ── RISK TAB ── */}
      {tab === 'risk' && riskMetrics && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

          {/* Risk score KPI */}
          {(() => {
            const { text, color } = riskBadge(riskMetrics.weightedRisk)
            return (
              <ConclusionCard
                label={d.riskScore}
                headline={text}
                headlineColor={color}
                description={d.riskScoreDesc}
                stat={`${riskMetrics.weightedRisk.toFixed(2)} / 5`}
              />
            )
          })()}

          {/* Risk by class chart */}
          <div style={{ background: 'var(--arvo-surface)', borderRadius: 12, border: '1px solid var(--arvo-border)', padding: '24px' }}>
            <h2 style={{ fontSize: 15, fontWeight: 600, margin: '0 0 4px', color: 'var(--arvo-fg)' }}>{d.riskByClassTitle ?? d.riskByClass}</h2>
            <p style={{ fontSize: 11, color: 'var(--arvo-fg-soft)', margin: '0 0 20px' }}>{d.riskBarNote}</p>
            <ResponsiveContainer width="100%" height={Math.max(160, riskMetrics.byClass.length * 44)}>
              <BarChart data={riskMetrics.byClass} layout="vertical" margin={{ left: 12, right: 36, top: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="var(--arvo-border)" />
                <XAxis type="number" domain={[0, riskMetrics.xAxisMax]} tickFormatter={v => `${v}%`} tick={{ fontSize: 11, fill: 'var(--arvo-fg-soft)' }} />
                <YAxis type="category" dataKey="name" width={100} tick={{ fontSize: 12, fill: 'var(--arvo-fg)' }} />
                <Tooltip
                  formatter={(v: unknown, _name: unknown, props: { payload?: { risk?: number } }) => {
                    const riskLevel = props.payload?.risk ?? 0
                    const riskLabel = [d.riskLevelVeryLow, d.riskLevelLow, d.riskLevelMedium, d.riskLevelHigh, d.riskLevelVeryHigh][riskLevel - 1] ?? ''
                    return [`${v}% — ${riskLabel}`, d.allocationPct]
                  }}
                  contentStyle={{ fontSize: 12, border: '1px solid var(--arvo-border)', borderRadius: 8 }}
                />
                <Bar dataKey="pct" radius={[0, 4, 4, 0]}>
                  {riskMetrics.byClass.map((entry, i) => (
                    <Cell key={i} fill={entry.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>

            {/* Risk level legend — colors now match the bars */}
            <div style={{ marginTop: 16, display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {[
                { level: 1, label: d.riskLevelVeryLow,  color: RISK_COLORS[0] },
                { level: 2, label: d.riskLevelLow,      color: RISK_COLORS[1] },
                { level: 3, label: d.riskLevelMedium,   color: RISK_COLORS[2] },
                { level: 4, label: d.riskLevelHigh,     color: RISK_COLORS[3] },
                { level: 5, label: d.riskLevelVeryHigh, color: RISK_COLORS[4] },
              ].map(r => (
                <span key={r.level} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: 'var(--arvo-fg-soft)' }}>
                  <span style={{ width: 10, height: 10, borderRadius: 2, background: r.color, display: 'inline-block' }} />
                  {r.level} — {r.label}
                </span>
              ))}
            </div>
          </div>

          {/* Risk methodology info */}
          <CollapsibleInfoCard title={d.riskMethodologyTitle ?? 'Como é calculado?'}>
            <p style={{ margin: 0 }}>{d.riskMethodologyDesc}</p>
          </CollapsibleInfoCard>

          {/* Asset & geo concentration */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12 }}>
            {(() => {
              const { text, color } = hhiBadge(riskMetrics.assetHHI, assets.length)
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

          {/* HHI comparison panel */}
          <div style={{ background: 'var(--arvo-surface)', borderRadius: 12, border: '1px solid var(--arvo-border)', padding: '20px' }}>
            <h3 style={{ fontSize: 13, fontWeight: 600, margin: '0 0 16px', color: 'var(--arvo-fg)' }}>{d.hhi}</h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
              {[
                { label: d.assetHhi,  val: riskMetrics.assetHHI,  n: assets.length },
                { label: d.geoHhi,    val: riskMetrics.geoHHI,    n: geoGroups.length },
                { label: d.sectorHhi, val: riskMetrics.sectorHHI, n: sectorGroups.length },
              ].map(m => {
                const { text, color } = hhiBadge(m.val, m.n)
                return (
                  <div key={m.label} style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: 11, color: 'var(--arvo-fg-soft)', marginBottom: 6 }}>{m.label}</div>
                    <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--arvo-fg)' }}>{m.val.toFixed(3)}</div>
                    <span style={{ fontSize: 11, fontWeight: 600, color, background: color + '18', padding: '2px 8px', borderRadius: 20, marginTop: 4, display: 'inline-block' }}>{text}</span>
                  </div>
                )
              })}
            </div>
          </div>

          <HhiInfoCard d={d} />
        </div>
      )}
    </div>
  )
}

function HhiInfoCard({ d }: { d: ReturnType<typeof useI18n>['t']['diversification'] }) {
  return (
    <CollapsibleInfoCard title={d.hhi}>
      <p style={{ margin: '0 0 8px' }}>{d.hhiDesc}</p>
      <p style={{ margin: 0 }}>{d.hhiExplain}</p>
    </CollapsibleInfoCard>
  )
}
