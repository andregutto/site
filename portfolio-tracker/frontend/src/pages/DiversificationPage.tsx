import { useEffect, useMemo, useState } from 'react'
import type { CSSProperties } from 'react'
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid } from 'recharts'
import { PageLoader } from '../components/ArvoLoader'
import { usePortfolioValue } from '../hooks/usePortfolio'
import { useCurrency } from '../contexts/CurrencyContext'
import { useI18n } from '../contexts/I18nContext'
import { apiFetch } from '../lib/api'
import { PageTitle, Segmented } from '../components/ui'
import { Icon } from '../components/icons'
import type { PortfolioAsset } from '../lib/types'
import DegradedTotalNote from '../components/DegradedTotalNote'

type Tab = 'geo' | 'sector' | 'risk'

const SECTOR_PALETTE = [
  'var(--arvo-blue)',
  'var(--arvo-gold)',
  'var(--arvo-terracotta)',
  'var(--arvo-green)',
  'var(--arvo-ocre)',
  '#5A5248',
  'var(--arvo-red)',
  'var(--arvo-fg-soft)',
]
const RISK_COLORS = [
  'var(--arvo-green)',
  'color-mix(in srgb, var(--arvo-green) 50%, var(--arvo-ocre))',
  'var(--arvo-ocre)',
  'color-mix(in srgb, var(--arvo-ocre) 50%, var(--arvo-red))',
  'var(--arvo-red)',
]

// Maps a severity token to its soft background tint (for badges/pills)
function severityTint(color: string): string {
  if (color === 'var(--arvo-green)') return 'var(--arvo-green-tint)'
  if (color === 'var(--arvo-ocre)') return 'var(--arvo-ocre-tint)'
  if (color === 'var(--arvo-red)') return 'var(--arvo-red-tint)'
  return 'var(--arvo-gold-tint)'
}

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
    <div className="rounded-2xl p-5" style={{ background: 'var(--arvo-surface)', border: '1px solid var(--arvo-border)' }}>
      <div style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 12, fontWeight: 600, letterSpacing: '0.10em', textTransform: 'uppercase', color: 'var(--arvo-fg-soft)', marginBottom: 8 }}>{label}</div>
      <div className="arvo-num" style={{ fontSize: 26, fontWeight: 600, color: 'var(--arvo-fg)', lineHeight: 1 }}>{value}</div>
      {badge && (
        <span style={{ display: 'inline-block', fontSize: 12, fontWeight: 600, color: badgeColor, background: severityTint(badgeColor ?? ''), padding: '3px 10px', borderRadius: 'var(--arvo-radius-pill)', marginTop: 10 }}>{badge}</span>
      )}
      {sub && <div style={{ fontSize: 13, color: 'var(--arvo-fg-soft)', marginTop: 8, lineHeight: 1.4 }}>{sub}</div>}
    </div>
  )
}

// Lead card for each subnav: eyebrow + Tenor Sans verdict word with a severity dot,
// a thin progress bar (HHI or risk score), a short contextual sentence and a supporting stat.
function VerdictCard({ eyebrow, headline, severityColor, description, barValue, stat, statLabel }: {
  eyebrow: string; headline: string; severityColor: string
  description?: string; barValue?: number; stat?: string; statLabel?: string
}) {
  return (
    <div className="rounded-2xl p-6" style={{ background: 'var(--arvo-surface)', border: '1px solid var(--arvo-border)' }}>
      <span className="arvo-eyebrow block mb-3">{eyebrow}</span>
      <div className="flex items-center gap-2.5">
        <span style={{ width: 8, height: 8, borderRadius: '50%', background: severityColor, flexShrink: 0 }} />
        <span style={{ fontFamily: 'var(--arvo-font-display)', fontWeight: 400, fontSize: 'clamp(20px, 2.4vw, 26px)', letterSpacing: 'var(--arvo-track-normal)', color: 'var(--arvo-fg)' }}>{headline}</span>
      </div>
      {description && <p className="mt-2 mb-0" style={{ fontSize: 14, color: 'var(--arvo-fg-muted)', lineHeight: 1.5 }}>{description}</p>}
      {barValue != null && (
        <div className="mt-4" style={{ height: 4, background: 'var(--arvo-border)', borderRadius: 'var(--arvo-radius-pill)', overflow: 'hidden' }}>
          <div style={{ height: '100%', width: `${Math.round(barValue * 100)}%`, background: severityColor, borderRadius: 'var(--arvo-radius-pill)' }} />
        </div>
      )}
      {stat && (
        <div className="mt-4 pt-4 flex items-baseline gap-2" style={{ borderTop: '1px solid var(--arvo-border)' }}>
          <span className="arvo-num" style={{ fontSize: 20, fontWeight: 600, color: 'var(--arvo-fg)' }}>{stat}</span>
          {statLabel && <span style={{ fontSize: 13, color: 'var(--arvo-fg-soft)' }}>{statLabel}</span>}
        </div>
      )}
    </div>
  )
}

function CollapsibleInfoCard({ title, children }: { title: string; children: React.ReactNode }) {
  const [expanded, setExpanded] = useState(false)
  return (
    <div className="rounded-2xl" style={{ background: 'var(--arvo-surface-2)', borderLeft: '2px solid var(--arvo-gold)' }}>
      <button
        type="button"
        onClick={() => setExpanded(v => !v)}
        className="w-full flex items-center gap-2.5 px-4 py-3 text-left"
        style={{ background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'var(--arvo-font-body)', fontSize: 13, fontWeight: 600, color: 'var(--arvo-fg-muted)' }}
      >
        <Icon name="info" size={14} style={{ flexShrink: 0 }} />
        <span className="flex-1">{title}</span>
        <Icon name="plus" size={12} style={{ flexShrink: 0, transform: expanded ? 'rotate(45deg)' : 'none', transition: 'transform var(--arvo-dur-fast) var(--arvo-ease)' }} />
      </button>
      {expanded && (
        <div className="px-4 pb-4" style={{ color: 'var(--arvo-fg-muted)', fontSize: 13, lineHeight: 1.6 }}>
          {children}
        </div>
      )}
    </div>
  )
}

// Black circle with gold code/icon, replacing flag emoji (consistent with InstitutionLogo redesign)
function CountryBadge({ code }: { code: string }) {
  const style: CSSProperties = {
    width: 28, height: 28, minWidth: 28, borderRadius: '50%',
    background: 'var(--arvo-black)', color: 'var(--arvo-gold)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontFamily: 'var(--arvo-font-body)', fontSize: 10, fontWeight: 600, letterSpacing: '0.02em',
  }
  if (code === 'CRYPTO') return <div style={style}><Icon name="globe" size={13} /></div>
  if (code === 'OTHER') return <div style={style}><Icon name="file" size={13} /></div>
  return <div style={style}>{code}</div>
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
    BR:     { label: d.countryBR,     color: 'var(--arvo-blue)' },
    US:     { label: d.countryUS,     color: 'var(--arvo-ocre)' },
    EU:     { label: d.countryEU,     color: 'var(--arvo-green)' },
    CRYPTO: { label: d.countryCrypto, color: '#5A5248' },
    OTHER:  { label: d.countryOther,  color: 'var(--arvo-fg-soft)' },
  }), [d])

  // Geo grouping
  const geoGroups = useMemo(() => {
    const map = new Map<string, { key: string; label: string; color: string; value: number }>()
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
    if (norm < 0.15) return { text: d.hhiLow,    color: 'var(--arvo-green)', norm }
    if (norm < 0.40) return { text: d.hhiMedium, color: 'var(--arvo-ocre)', norm }
    return { text: d.hhiHigh, color: 'var(--arvo-red)', norm }
  }

  function riskBadge(score: number): { text: string; color: string } {
    if (score < 1.5) return { text: d.riskScaleLow,      color: 'var(--arvo-green)' }
    if (score < 2.5) return { text: d.riskScaleMedium,   color: RISK_COLORS[1] }
    if (score < 3.5) return { text: d.riskScaleHigh,     color: 'var(--arvo-ocre)' }
    if (score < 4.5) return { text: d.riskScaleVeryHigh, color: RISK_COLORS[3] }
    return { text: d.riskScaleVeryHigh, color: 'var(--arvo-red)' }
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
      <div style={{ background: 'var(--arvo-surface)', border: '1px solid var(--arvo-border)', borderRadius: 8, padding: '8px 12px', boxShadow: '0 2px 8px var(--arvo-border)', fontSize: 13 }}>
        <div style={{ fontWeight: 600, marginBottom: 2 }}>{entry.name}</div>
        <div>{fmtVal(entry.value)}</div>
        <div style={{ color: 'var(--arvo-fg-soft)' }}>{fmtPct(entry.payload?.pct ?? 0)}</div>
      </div>
    )
  }

  if (loading) return <PageLoader />

  if (!assets.length) return (
    <div style={{ padding: 48, textAlign: 'center', color: 'var(--arvo-fg-soft)', fontFamily: 'var(--arvo-font-body)' }}>{d.noData}</div>
  )

  return (
    <div className="space-y-6">

      <PageTitle
        eyebrow={t.dashboard.eyebrow}
        title={d.title}
        actions={
          <Segmented<Tab>
            ariaLabel={d.subtitle}
            value={tab}
            onChange={setTab}
            options={TABS.map(({ key, label }) => ({ value: key, label }))}
          />
        }
      />

      <DegradedTotalNote degraded={data?.degraded} assets={data?.degraded_assets} />

      {/* ── GEO TAB ── */}
      {tab === 'geo' && (
        <div className="space-y-6">
          {riskMetrics && (() => {
            const { text, color, norm } = hhiBadge(riskMetrics.geoHHI, geoGroups.length)
            const top = geoGroups[0]
            const description = top
              ? d.geoConclusionDesc.replace('{country}', top.label).replace('{pct}', fmtPct(top.pct))
              : undefined
            return (
              <VerdictCard
                eyebrow={d.geoConcentrationLabel}
                headline={text}
                severityColor={color}
                description={description}
                barValue={norm}
                stat={riskMetrics.geoHHI.toFixed(3)}
                statLabel={d.geoHhi}
              />
            )
          })()}

          <div className="rounded-2xl p-6" style={{ background: 'var(--arvo-surface)', border: '1px solid var(--arvo-border)' }}>
            <h2 className="font-semibold mb-5" style={{ color: 'var(--arvo-fg)' }}>{d.geoTitle}</h2>
            <div className="flex gap-6 items-center justify-center flex-wrap">
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
                  <div key={g.key} className="flex items-center gap-3 mb-3">
                    <CountryBadge code={g.key} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div className="flex justify-between mb-1">
                        <span style={{ fontSize: 14, fontWeight: 500, color: 'var(--arvo-fg)' }}>{g.label}</span>
                        <span className="arvo-num" style={{ fontSize: 13, color: 'var(--arvo-fg-soft)' }}>{fmtPct(g.pct)}</span>
                      </div>
                      <div style={{ height: 4, background: 'var(--arvo-border)', borderRadius: 'var(--arvo-radius-pill)' }}>
                        <div style={{ height: '100%', width: `${g.pct * 100}%`, background: g.color, borderRadius: 'var(--arvo-radius-pill)' }} />
                      </div>
                    </div>
                    <span className="arvo-num" style={{ fontSize: 13, color: 'var(--arvo-fg-soft)', minWidth: 68, textAlign: 'right' }}>{fmtVal(g.value)}</span>
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
        <div className="space-y-6">
          {riskMetrics && (() => {
            const { text, color, norm } = hhiBadge(riskMetrics.sectorHHI, sectorGroups.length)
            const top = sectorGroups[0]
            const description = top
              ? d.sectorConclusionDesc.replace('{sector}', top.label).replace('{pct}', fmtPct(top.pct))
              : undefined
            return (
              <VerdictCard
                eyebrow={d.sectorConcentrationLabel}
                headline={text}
                severityColor={color}
                description={description}
                barValue={norm}
                stat={riskMetrics.sectorHHI.toFixed(3)}
                statLabel={d.sectorHhi}
              />
            )
          })()}

          <div className="rounded-2xl p-6" style={{ background: 'var(--arvo-surface)', border: '1px solid var(--arvo-border)' }}>
            <div className="flex justify-between items-start mb-5 gap-2">
              <h2 className="font-semibold" style={{ color: 'var(--arvo-fg)' }}>{d.sectorTitle}</h2>
              {sectorLoading && <Icon name="refresh" size={14} className="animate-spin" style={{ color: 'var(--arvo-fg-soft)' }} />}
              {hasBrapiSectors && !sectorLoading && (
                <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--arvo-green)', background: 'var(--arvo-green-tint)', padding: '2px 10px', borderRadius: 'var(--arvo-radius-pill)', whiteSpace: 'nowrap' }}>{d.sectorRealDataNote ?? 'BRAPI'}</span>
              )}
            </div>
            {!hasBrapiSectors && sectorData !== null && !sectorLoading && (
              <p className="mb-4" style={{ fontSize: 12, color: 'var(--arvo-fg-soft)', fontStyle: 'italic' }}>{d.sectorFallbackNote}</p>
            )}
            <div className="flex gap-6 items-center justify-center flex-wrap">
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
                  <div key={g.key} className="flex items-center gap-3 mb-3">
                    <div style={{ width: 10, height: 10, borderRadius: 2, background: SECTOR_PALETTE[i % SECTOR_PALETTE.length], flexShrink: 0 }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div className="flex justify-between mb-1">
                        <span style={{ fontSize: 14, fontWeight: 500, color: 'var(--arvo-fg)' }}>{g.label}</span>
                        <span className="arvo-num" style={{ fontSize: 13, color: 'var(--arvo-fg-soft)' }}>{fmtPct(g.pct)}</span>
                      </div>
                      <div style={{ height: 4, background: 'var(--arvo-border)', borderRadius: 'var(--arvo-radius-pill)' }}>
                        <div style={{ height: '100%', width: `${g.pct * 100}%`, background: SECTOR_PALETTE[i % SECTOR_PALETTE.length], borderRadius: 'var(--arvo-radius-pill)' }} />
                      </div>
                    </div>
                    <span className="arvo-num" style={{ fontSize: 13, color: 'var(--arvo-fg-soft)', minWidth: 68, textAlign: 'right' }}>{fmtVal(g.value)}</span>
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
        <div className="space-y-6">

          {/* Risk score KPI */}
          {(() => {
            const { text, color } = riskBadge(riskMetrics.weightedRisk)
            return (
              <VerdictCard
                eyebrow={d.riskScore}
                headline={text}
                severityColor={color}
                description={d.riskScoreDesc}
                barValue={(riskMetrics.weightedRisk - 1) / 4}
                stat={`${riskMetrics.weightedRisk.toFixed(2)} / 5`}
              />
            )
          })()}

          {/* Risk by class chart */}
          <div className="rounded-2xl p-6" style={{ background: 'var(--arvo-surface)', border: '1px solid var(--arvo-border)' }}>
            <h2 className="font-semibold mb-1" style={{ color: 'var(--arvo-fg)' }}>{d.riskByClassTitle ?? d.riskByClass}</h2>
            <p className="mb-5" style={{ fontSize: 12, color: 'var(--arvo-fg-soft)' }}>{d.riskBarNote}</p>
            <ResponsiveContainer width="100%" height={Math.max(160, riskMetrics.byClass.length * 44)}>
              <BarChart data={riskMetrics.byClass} layout="vertical" margin={{ left: 12, right: 36, top: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="var(--arvo-border)" />
                <XAxis type="number" domain={[0, riskMetrics.xAxisMax]} tickFormatter={v => `${v}%`} tick={{ fontSize: 12, fill: 'var(--arvo-fg-soft)' }} />
                <YAxis type="category" dataKey="name" width={100} tick={{ fontSize: 13, fill: 'var(--arvo-fg)' }} />
                <Tooltip
                  formatter={(v: unknown, _name: unknown, props: { payload?: { risk?: number } }) => {
                    const riskLevel = props.payload?.risk ?? 0
                    const riskLabel = [d.riskLevelVeryLow, d.riskLevelLow, d.riskLevelMedium, d.riskLevelHigh, d.riskLevelVeryHigh][riskLevel - 1] ?? ''
                    return [`${v}% · ${riskLabel}`, d.allocationPct]
                  }}
                  contentStyle={{ fontSize: 13, border: '1px solid var(--arvo-border)', borderRadius: 8 }}
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
                <span key={r.level} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, color: 'var(--arvo-fg-soft)' }}>
                  <span style={{ width: 10, height: 10, borderRadius: 2, background: r.color, display: 'inline-block' }} />
                  {r.level} · {r.label}
                </span>
              ))}
            </div>
          </div>

          {/* Risk methodology info */}
          <CollapsibleInfoCard title={d.riskMethodologyTitle ?? 'Como é calculado?'}>
            <p style={{ margin: 0 }}>{d.riskMethodologyDesc}</p>
          </CollapsibleInfoCard>

          {/* Asset & geo concentration */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
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
              const color = riskMetrics.top3 > 0.5 ? 'var(--arvo-red)' : riskMetrics.top3 > 0.35 ? 'var(--arvo-ocre)' : 'var(--arvo-green)'
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
              const color = riskMetrics.top10 > 0.9 ? 'var(--arvo-red)' : riskMetrics.top10 > 0.7 ? 'var(--arvo-ocre)' : 'var(--arvo-green)'
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
          <div className="rounded-2xl p-6" style={{ background: 'var(--arvo-surface)', border: '1px solid var(--arvo-border)' }}>
            <h3 className="font-semibold mb-4" style={{ fontSize: 14, color: 'var(--arvo-fg)' }}>{d.hhi}</h3>
            <div className="grid grid-cols-3 gap-4">
              {[
                { label: d.assetHhi,  val: riskMetrics.assetHHI,  n: assets.length },
                { label: d.geoHhi,    val: riskMetrics.geoHHI,    n: geoGroups.length },
                { label: d.sectorHhi, val: riskMetrics.sectorHHI, n: sectorGroups.length },
              ].map(m => {
                const { text, color } = hhiBadge(m.val, m.n)
                return (
                  <div key={m.label} className="text-center">
                    <div style={{ fontSize: 12, color: 'var(--arvo-fg-soft)', marginBottom: 6 }}>{m.label}</div>
                    <div className="arvo-num" style={{ fontSize: 20, fontWeight: 600, color: 'var(--arvo-fg)' }}>{m.val.toFixed(3)}</div>
                    <span style={{ fontSize: 12, fontWeight: 600, color, background: severityTint(color), padding: '2px 10px', borderRadius: 'var(--arvo-radius-pill)', marginTop: 4, display: 'inline-block' }}>{text}</span>
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
