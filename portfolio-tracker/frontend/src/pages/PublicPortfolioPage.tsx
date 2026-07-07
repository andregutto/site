import { useEffect, useState, type CSSProperties, type ReactNode } from 'react'
import { Link, useParams } from 'react-router-dom'
import {
  ComposedChart, Area, Line, LineChart, PieChart, Pie, Cell, Label,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts'
import { useI18n } from '../contexts/I18nContext'
import LanguageSelector from '../components/LanguageSelector'
import { Icon } from '../components/icons'
import { ArvoTooltip, breakdownColor, formatCompactCurrency } from '../components/charts'

type T = ReturnType<typeof useI18n>['t']

// ---------- Shapes (mirror backend PortfolioSnapshot, masked per show_values/hide_holdings) ----------
interface SnapshotAsset {
  id: number; code: string; name: string
  value: number | null; pct: number
  class_name: string; class_name_key: string | null; class_color: string
  exchange: string | null; currency: string
  return_pct: number | null
}
interface SnapshotGroupValue { key: string; label: string; value: number | null; pct: number }
interface SnapshotClassValue {
  key: string; name: string; name_key: string | null; color: string
  value: number | null; pct: number; target_pct: number | null
}
interface SnapshotPerformance {
  from: string; to: string
  value_start: number | null; value_end: number | null
  contributions: number | null; return_abs: number | null; return_pct: number | null
}
interface SnapshotBenchmarkPct { portfolio_pct: number | null; cdi_pct: number | null; ibov_pct: number | null; sp500_pct: number | null }
interface SnapshotBenchmarks {
  period: SnapshotBenchmarkPct
  since_inception: SnapshotBenchmarkPct
  monthly: Array<{ month: string; portfolio_cum: number | null; cdi_cum: number | null; ibov_cum: number | null; sp500_cum: number | null }>
}
interface SnapshotMonthlyPoint { month: string; total: number | null; contributions_cumulative: number | null }
interface SnapshotDiversification {
  hhi_asset: number; hhi_asset_normalized: number
  hhi_geography: number; hhi_geography_normalized: number
  hhi_sector: number; hhi_sector_normalized: number
  effective_n: number
  top5_pct: number
  n_positions: number
}
interface SnapshotDividends {
  total_12m: number | null
  by_month: Array<{ month: string; total: number | null }>
  top_payers: Array<{ asset_id: number; code: string; name: string; total: number | null }>
  yield_pct: number | null
}

interface PublicData {
  owner_name: string | null
  label: string | null
  show_values: boolean
  hide_holdings: boolean
  updated_at: string
  generated_at: string
  display_currency: string
  period: 'inception' | '12m' | 'ytd'
  period_from: string | null
  period_to: string
  inception: string | null
  total: number | null
  invested: number | null
  asset_count: number
  class_count: number
  performance: SnapshotPerformance | null
  inception_performance: SnapshotPerformance | null
  monthly: SnapshotMonthlyPoint[]
  benchmarks: SnapshotBenchmarks | null
  by_class: SnapshotClassValue[]
  by_geography: SnapshotGroupValue[]
  by_sector: SnapshotGroupValue[]
  by_currency: SnapshotGroupValue[]
  diversification: SnapshotDiversification
  top_assets: SnapshotAsset[]
  top_gainers: SnapshotAsset[]
  top_losers: SnapshotAsset[]
  dividends: SnapshotDividends
}

// ---------- Locale / formatting ----------
const LOCALE_MAP: Record<string, string> = { pt: 'pt-BR', en: 'en-US', fr: 'fr-FR' }

function fmtCurr(n: number | null, currency: string, locale: string): string {
  if (n == null) return '-'
  return new Intl.NumberFormat(locale, { style: 'currency', currency, maximumFractionDigits: 0 }).format(n)
}
function fmtDate(iso: string | null, locale: string): string {
  if (!iso) return '-'
  return new Date(iso).toLocaleDateString(locale, { day: '2-digit', month: 'long', year: 'numeric' })
}
function fmtPct(n: number | null, decimals = 1): string {
  if (n == null) return '-'
  return `${n.toFixed(decimals)}%`
}
function fmtSignedPct(n: number | null, decimals = 2): string {
  if (n == null) return '-'
  return `${n >= 0 ? '+' : ''}${n.toFixed(decimals)}%`
}
function fmtMonth(ym: string, locale: string): string {
  const [y, m] = ym.split('-').map(Number)
  return new Date(y, (m || 1) - 1, 1).toLocaleDateString(locale, { month: 'short', year: '2-digit' })
}
function periodLabel(period: PublicData['period'], s: T['sharePortfolio']): string {
  if (period === '12m') return s.period12m
  if (period === 'ytd') return s.periodYtd
  return s.periodInception
}
function resolveClassName(item: { name: string; name_key: string | null }, t: T): string {
  const classNames = (t.classes.names as Record<string, string>) ?? {}
  if (item.name_key && classNames[item.name_key]) return classNames[item.name_key]
  if (item.name === 'Sem classe') return t.classes.noClass
  return item.name
}
function countryLabel(g: SnapshotGroupValue, s: T['sharePortfolio']): string {
  const labels: Record<string, string> = { BR: s.countryBR, US: s.countryUS, EU: s.countryEU, CRYPTO: s.countryCrypto, OTHER: s.countryOther }
  return labels[g.key] ?? g.label
}
function hhiBadge(norm: number, d: T['diversification']): { text: string; color: string } {
  if (norm < 0.15) return { text: d.hhiLow, color: 'var(--arvo-green)' }
  if (norm < 0.40) return { text: d.hhiMedium, color: 'var(--arvo-ocre)' }
  return { text: d.hhiHigh, color: 'var(--arvo-red)' }
}
function severityTint(color: string): string {
  if (color === 'var(--arvo-green)') return 'var(--arvo-green-tint)'
  if (color === 'var(--arvo-ocre)') return 'var(--arvo-ocre-tint)'
  if (color === 'var(--arvo-red)') return 'var(--arvo-red-tint)'
  return 'var(--arvo-gold-tint)'
}

// ---------- Report-local chart defaults (page is always light, independent of app theme) ----------
const REPORT_GRID = 'rgba(13,13,13,0.06)'
const REPORT_AXIS_TICK = { fontSize: 10, fontFamily: 'var(--arvo-font-body)', fill: 'rgba(13,13,13,0.45)' }
const REPORT_AXIS_LINE = { stroke: 'rgba(13,13,13,0.10)' }
const REPORT_SERIES = {
  portfolio: '#0D0D0D',
  cdi: 'var(--arvo-gold)',
  ibov: 'var(--arvo-blue)',
  sp500: 'var(--arvo-terracotta)',
  green: 'var(--arvo-green)',
  red: 'var(--arvo-red)',
}

const PRINT_CSS = `
  @media print {
    .arvo-pdf-hide { display: none !important; }
    .arvo-pdf-nobreak { page-break-inside: avoid; break-inside: avoid; }
    .arvo-pdf-break { page-break-before: always; break-before: page; }
    @page { size: A4 portrait; margin: 12mm 12mm 12mm 12mm; }
    * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; color-adjust: exact !important; }
    body { margin: 0 !important; padding: 0 !important; background: #F4F3F1 !important; }
    .arvo-pdf-root { min-height: unset !important; }
    .arvo-pdf-header { padding-bottom: 28px !important; }
    .arvo-pdf-body { padding-top: 20px !important; padding-bottom: 20px !important; }
    .arvo-recharts-wrapper { overflow: visible !important; }
    tr { page-break-inside: avoid; break-inside: avoid; }
  }
`

export default function PublicPortfolioPage() {
  const { token } = useParams<{ token: string }>()
  const { t, locale } = useI18n()
  const s = t.sharePortfolio
  const dateLocale = LOCALE_MAP[locale] ?? 'pt-BR'

  const [data, setData] = useState<PublicData | null>(null)
  const [status, setStatus] = useState<'loading' | 'ok' | 'not_found' | 'pending'>('loading')

  const autoPrint = typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('print') === '1'

  useEffect(() => {
    if (!token) return
    fetch(`/api/public/portfolio/${token}`)
      .then(async r => {
        if (r.status === 404) { setStatus('not_found'); return }
        if (r.status === 503) { setStatus('pending'); return }
        const d = await r.json()
        setData(d)
        setStatus('ok')
      })
      .catch(() => setStatus('not_found'))
  }, [token])

  useEffect(() => {
    if (status === 'ok' && autoPrint) {
      const id = setTimeout(() => window.print(), 900)
      return () => clearTimeout(id)
    }
  }, [status, autoPrint])

  if (status === 'loading') return (
    <div style={{ minHeight: '100vh', background: '#0D0D0D', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <style dangerouslySetInnerHTML={{ __html: PRINT_CSS }} />
      <div style={{ width: 40, height: 40, border: '3px solid rgba(255,255,255,0.1)', borderTopColor: 'var(--arvo-gold)', borderRadius: '50%', animation: 'spin 0.9s linear infinite' }} />
      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
    </div>
  )

  if (status === 'not_found') return (
    <div style={{ minHeight: '100vh', background: '#0D0D0D', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16, padding: 32 }}>
      <style dangerouslySetInnerHTML={{ __html: PRINT_CSS }} />
      <img src="/brand/logo/arvo-symbol-offwhite.svg" width={36} height={36} alt="arvo" />
      <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: 15, fontFamily: 'var(--arvo-font-body)', textAlign: 'center' }}>{s.notFound}</p>
    </div>
  )

  if (status === 'pending') return (
    <div style={{ minHeight: '100vh', background: '#0D0D0D', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16, padding: 32 }}>
      <style dangerouslySetInnerHTML={{ __html: PRINT_CSS }} />
      <img src="/brand/logo/arvo-symbol-offwhite.svg" width={36} height={36} alt="arvo" />
      <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: 15, fontFamily: 'var(--arvo-font-body)', textAlign: 'center' }}>{s.snapshotPending}</p>
    </div>
  )

  if (!data) return null

  const currency = data.display_currency ?? 'BRL'
  const showVal = data.show_values

  return (
    <div className="arvo-pdf-root" style={{ minHeight: '100vh', background: '#F4F3F1', fontFamily: 'var(--arvo-font-body)' }}>
      <style dangerouslySetInnerHTML={{ __html: PRINT_CSS }} />

      {/* ── COVER ── */}
      <div className="arvo-pdf-header" style={{ background: '#0D0D0D', padding: '24px 32px 40px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 44 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <img src="/brand/logo/arvo-symbol-offwhite.svg" width={20} height={20} alt="" />
            <span style={{ fontFamily: 'var(--arvo-font-display)', fontSize: 14, letterSpacing: '0.30em', textIndent: '0.30em', color: 'rgba(255,255,255,0.9)', lineHeight: 1 }}>arvo</span>
            <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)', marginLeft: 8, letterSpacing: '0.12em', textTransform: 'uppercase' }}>Capital</span>
          </div>
          <div className="arvo-pdf-hide">
            <LanguageSelector />
          </div>
        </div>

        {data.owner_name && (
          <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.45)', letterSpacing: '0.18em', textTransform: 'uppercase', marginBottom: 12 }}>
            {data.owner_name}
          </div>
        )}
        <h1 style={{ fontFamily: 'var(--arvo-font-display)', fontSize: 'clamp(26px, 5vw, 40px)', color: '#fff', margin: '0 0 6px', fontWeight: 400, letterSpacing: '0.02em' }}>
          {s.reportTitle}
        </h1>
        <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.45)', margin: '0 0 36px' }}>
          {data.label || s.reportSubtitle}
        </p>

        <div style={{ display: 'flex', gap: 'clamp(20px, 5vw, 56px)', flexWrap: 'wrap', borderTop: '1px solid rgba(255,255,255,0.12)', paddingTop: 18 }}>
          <MetaItem label={s.baseDate} value={fmtDate(data.period_to, dateLocale)} />
          <MetaItem label={s.currency} value={currency} />
          <MetaItem label={s.period} value={periodLabel(data.period, s)} />
          <MetaItem label={s.generatedOn} value={fmtDate(data.generated_at, dateLocale)} />
        </div>
      </div>

      {/* ── BODY ── */}
      <div className="arvo-pdf-body" style={{ maxWidth: 880, margin: '0 auto', padding: '28px 16px 64px' }}>

        {!showVal && (
          <div className="arvo-pdf-nobreak" style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#fff', border: '1px solid rgba(13,13,13,0.08)', borderRadius: 10, padding: '10px 16px', marginBottom: 16, fontSize: 13, color: '#6B7280' }}>
            <Icon name="info" size={14} />
            {s.valuesHidden}
          </div>
        )}
        {data.hide_holdings && (
          <div className="arvo-pdf-nobreak" style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#fff', border: '1px solid rgba(13,13,13,0.08)', borderRadius: 10, padding: '10px 16px', marginBottom: 16, fontSize: 13, color: '#6B7280' }}>
            <Icon name="info" size={14} />
            {s.holdingsHidden}
          </div>
        )}

        <ExecutiveSummarySection data={data} s={s} currency={currency} dateLocale={dateLocale} />
        <EvolutionSection data={data} s={s} currency={currency} dateLocale={dateLocale} showVal={showVal} />
        <BenchmarksSection data={data} s={s} dateLocale={dateLocale} className="arvo-pdf-break" />
        <AllocationSection data={data} t={t} s={s} currency={currency} dateLocale={dateLocale} showVal={showVal} className="arvo-pdf-break" />
        <ConcentrationSection data={data} s={s} d={t.diversification} />
        <TopPositionsSection data={data} t={t} s={s} currency={currency} dateLocale={dateLocale} showVal={showVal} className="arvo-pdf-break" />
        <PerformanceHighlightsSection data={data} t={t} s={s} />
        <PassiveIncomeSection data={data} s={s} currency={currency} dateLocale={dateLocale} showVal={showVal} />
        <FooterSection data={data} s={s} currency={currency} dateLocale={dateLocale} />
      </div>

      {/* ── Floating PDF download button (hidden when printing) ── */}
      <button
        className="arvo-pdf-hide"
        onClick={() => window.print()}
        title={s.downloadPdf}
        style={{
          position: 'fixed',
          bottom: 'max(28px, calc(env(safe-area-inset-bottom, 0px) + 16px))',
          right: 28,
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '11px 18px',
          background: '#0D0D0D',
          color: '#fff',
          border: 'none',
          borderRadius: 24,
          fontSize: 13,
          fontFamily: 'var(--arvo-font-body)',
          fontWeight: 500,
          letterSpacing: '0.04em',
          cursor: 'pointer',
          boxShadow: '0 4px 16px rgba(0,0,0,0.22)',
          zIndex: 100,
          transition: 'opacity 0.2s, transform 0.2s',
        }}
        onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.opacity = '0.85' }}
        onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.opacity = '1' }}
      >
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M8 2v8M5 7l3 3 3-3M3 12h10" />
        </svg>
        {s.downloadPdf}
      </button>
    </div>
  )
}

// ============================================================
// Shared primitives
// ============================================================

function MetaItem({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)', textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: 4 }}>{label}</div>
      <div className="arvo-num" style={{ fontSize: 14, color: 'rgba(255,255,255,0.85)' }}>{value}</div>
    </div>
  )
}

function ReportSection({ title, subtitle, children, style, className }: { title: string; subtitle?: string; children: ReactNode; style?: CSSProperties; className?: string }) {
  return (
    <section className={`arvo-pdf-nobreak${className ? ' ' + className : ''}`} style={{ background: '#fff', borderRadius: 14, border: '1px solid rgba(13,13,13,0.07)', padding: '22px 24px', marginBottom: 20, boxShadow: '0 1px 3px rgba(0,0,0,0.03)', ...style }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, marginBottom: 18 }}>
        <h2 style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 12, fontWeight: 600, letterSpacing: '0.16em', textTransform: 'uppercase', color: '#9CA3AF', margin: 0 }}>{title}</h2>
        {subtitle && <span className="arvo-num" style={{ fontSize: 12, color: '#9CA3AF' }}>{subtitle}</span>}
      </div>
      {children}
    </section>
  )
}

function EmptyNote({ text }: { text: string }) {
  return <p style={{ fontSize: 14, color: '#9CA3AF', margin: 0, fontStyle: 'italic' }}>{text}</p>
}

function KpiBlock({ label, value, sub, deltaPct }: { label: string; value: string; sub?: string; deltaPct?: number | null }) {
  return (
    <div>
      <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#9CA3AF', marginBottom: 6 }}>{label}</div>
      <div className="arvo-num" style={{ fontFamily: 'var(--arvo-font-display)', fontSize: 'clamp(19px, 3vw, 26px)', color: '#0D0D0D', fontWeight: 400, lineHeight: 1.1 }}>{value}</div>
      {(sub != null || deltaPct != null) && (
        <div style={{ marginTop: 4, display: 'flex', gap: 8, alignItems: 'baseline', flexWrap: 'wrap' }}>
          {deltaPct != null && (
            <span className="arvo-num" style={{ fontSize: 13, fontWeight: 600, color: deltaPct >= 0 ? 'var(--arvo-green)' : 'var(--arvo-red)' }}>
              {fmtSignedPct(deltaPct)}
            </span>
          )}
          {sub != null && <span style={{ fontSize: 12, color: '#9CA3AF' }}>{sub}</span>}
        </div>
      )}
    </div>
  )
}

function MetricCard({ label, value, sub, badge, badgeColor }: { label: string; value: string; sub?: string; badge?: string; badgeColor?: string }) {
  return (
    <div>
      <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#9CA3AF', marginBottom: 6 }}>{label}</div>
      <div className="arvo-num" style={{ fontFamily: 'var(--arvo-font-display)', fontSize: 'clamp(19px, 3vw, 26px)', color: '#0D0D0D', fontWeight: 400, lineHeight: 1.1 }}>{value}</div>
      {sub && <div style={{ fontSize: 12, color: '#9CA3AF', marginTop: 4 }}>{sub}</div>}
      {badge && (
        <span style={{ display: 'inline-block', fontSize: 12, fontWeight: 600, color: badgeColor, background: severityTint(badgeColor ?? ''), padding: '2px 10px', borderRadius: 999, marginTop: 8 }}>
          {badge}
        </span>
      )}
    </div>
  )
}

function ChartLegend({ items }: { items: Array<{ color: string; label: string; dashed?: boolean }> }) {
  return (
    <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginTop: 12, justifyContent: 'center' }}>
      {items.map(it => (
        <div key={it.label} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ width: 14, height: it.dashed ? 0 : 2, borderTop: it.dashed ? `2px dashed ${it.color}` : `2px solid ${it.color}` }} />
          <span style={{ fontSize: 12, color: '#6B7280' }}>{it.label}</span>
        </div>
      ))}
    </div>
  )
}

function CountryBadge({ code }: { code: string }) {
  const style: CSSProperties = {
    width: 22, height: 22, minWidth: 22, borderRadius: '50%',
    background: '#0D0D0D', color: 'var(--arvo-gold)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontFamily: 'var(--arvo-font-body)', fontSize: 9, fontWeight: 600, letterSpacing: '0.02em',
    flexShrink: 0,
  }
  if (code === 'CRYPTO') return <div style={style}><Icon name="globe" size={11} /></div>
  if (code === 'OTHER') return <div style={style}><Icon name="file" size={11} /></div>
  return <div style={style}>{code}</div>
}

function AllocBarRow({ icon, color, label, pct, value, target, currency, dateLocale, showVal, s }: {
  icon?: ReactNode; color: string; label: string; pct: number; value: number | null; target?: number | null
  currency: string; dateLocale: string; showVal: boolean; s: T['sharePortfolio']
}) {
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4, gap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
          {icon ?? <span style={{ width: 9, height: 9, borderRadius: 2, background: color, flexShrink: 0 }} />}
          <span style={{ fontSize: 14, color: '#374151', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</span>
        </div>
        <div className="arvo-num" style={{ display: 'flex', gap: 10, alignItems: 'baseline', flexShrink: 0 }}>
          {showVal && value != null && <span style={{ fontSize: 12, color: '#9CA3AF' }}>{fmtCurr(value, currency, dateLocale)}</span>}
          {target != null && <span style={{ fontSize: 12, color: '#9CA3AF' }}>{s.target} {target.toFixed(0)}%</span>}
          <span style={{ fontSize: 14, fontWeight: 600, color: '#111827', minWidth: 42, textAlign: 'right' }}>{pct.toFixed(1)}%</span>
        </div>
      </div>
      <div style={{ position: 'relative', height: 4, background: 'rgba(0,0,0,0.06)', borderRadius: 2 }}>
        <div style={{ height: '100%', width: `${Math.min(pct, 100)}%`, background: color, borderRadius: 2, maxWidth: '100%' }} />
        {target != null && (
          <div style={{ position: 'absolute', top: -2, bottom: -2, left: `${Math.min(target, 100)}%`, width: 2, background: '#0D0D0D' }} />
        )}
      </div>
    </div>
  )
}

const th = (align: 'left' | 'right' = 'right'): CSSProperties => ({
  textAlign: align, fontSize: 10, fontWeight: 600, letterSpacing: '0.10em', textTransform: 'uppercase', color: '#9CA3AF', padding: '0 8px 8px', whiteSpace: 'nowrap',
})
const td = (align: 'left' | 'right' = 'right'): CSSProperties => ({
  textAlign: align, padding: '10px 8px', color: '#0D0D0D', verticalAlign: 'middle',
})

// ============================================================
// Section 2 — Executive summary
// ============================================================

function ExecutiveSummarySection({ data, s, currency, dateLocale }: { data: PublicData; s: T['sharePortfolio']; currency: string; dateLocale: string }) {
  const perf = data.performance
  const incPerf = data.inception_performance
  return (
    <ReportSection title={s.executiveSummary}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 24 }}>
        <KpiBlock label={s.totalWealth} value={fmtCurr(data.total, currency, dateLocale)} deltaPct={perf?.return_pct ?? null} sub={perf ? s.thisPeriod : undefined} />
        <KpiBlock label={s.periodReturn} value={fmtSignedPct(perf?.return_pct ?? null)} />
        <KpiBlock label={s.sinceInception} value={fmtSignedPct(incPerf?.return_pct ?? null)} />
        <KpiBlock label={s.contributions} value={fmtCurr(perf?.contributions ?? null, currency, dateLocale)} />
        <KpiBlock label={s.passiveIncome12m} value={fmtCurr(data.dividends.total_12m, currency, dateLocale)} />
        <KpiBlock label={s.assets} value={`${data.asset_count}`} sub={`${data.class_count} ${s.numClasses}`} />
      </div>
    </ReportSection>
  )
}

// ============================================================
// Section 3 — Wealth evolution (area)
// ============================================================

function EvolutionSection({ data, s, currency, dateLocale, showVal }: { data: PublicData; s: T['sharePortfolio']; currency: string; dateLocale: string; showVal: boolean }) {
  const subtitle = data.inception ? `${s.sinceInception}: ${fmtDate(data.inception, dateLocale)}` : undefined

  if (data.monthly.length === 0) {
    return (
      <ReportSection title={s.evolutionTitle} subtitle={subtitle}>
        <EmptyNote text={s.noEvolutionData} />
      </ReportSection>
    )
  }
  if (!showVal) {
    return (
      <ReportSection title={s.evolutionTitle} subtitle={subtitle}>
        <EmptyNote text={s.valuesHidden} />
      </ReportSection>
    )
  }

  const chartData = data.monthly.map(m => ({
    month: fmtMonth(m.month, dateLocale),
    total: m.total,
    contributions: m.contributions_cumulative,
  }))

  return (
    <ReportSection title={s.evolutionTitle} subtitle={subtitle}>
      <div className="arvo-recharts-wrapper" style={{ height: 260 }}>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="evoFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#0D0D0D" stopOpacity={0.14} />
                <stop offset="100%" stopColor="#0D0D0D" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke={REPORT_GRID} vertical={false} />
            <XAxis dataKey="month" tick={REPORT_AXIS_TICK} tickLine={false} axisLine={REPORT_AXIS_LINE} interval="preserveStartEnd" />
            <YAxis tick={REPORT_AXIS_TICK} tickLine={false} axisLine={false} width={56}
              tickFormatter={v => formatCompactCurrency(Number(v), currency, dateLocale)} />
            <Tooltip
              content={
                <ArvoTooltip
                  formatter={(v, _name, item) => [
                    new Intl.NumberFormat(dateLocale, { style: 'currency', currency, maximumFractionDigits: 0 }).format(v),
                    item.dataKey === 'contributions' ? s.contributionsAccum : s.patrimonyLabel,
                  ]}
                />
              }
            />
            <Area type="monotone" dataKey="total" stroke={REPORT_SERIES.portfolio} strokeWidth={2} fill="url(#evoFill)" />
            <Line type="stepAfter" dataKey="contributions" stroke="rgba(13,13,13,0.35)" strokeWidth={1.5} dot={false} strokeDasharray="4 2" connectNulls />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      <ChartLegend items={[
        { color: REPORT_SERIES.portfolio, label: s.patrimonyLabel },
        { color: 'rgba(13,13,13,0.35)', label: s.contributionsAccum, dashed: true },
      ]} />
    </ReportSection>
  )
}

// ============================================================
// Section 4 — Performance vs benchmarks
// ============================================================

function BenchmarksSection({ data, s, dateLocale, className }: { data: PublicData; s: T['sharePortfolio']; dateLocale: string; className?: string }) {
  const bm = data.benchmarks
  const hasMonthly = !!bm && bm.monthly.length > 0

  if (!bm || !hasMonthly) {
    return (
      <ReportSection title={s.benchmarksTitle} className={className}>
        <EmptyNote text={s.noBenchmarkData} />
      </ReportSection>
    )
  }

  const chartData = bm.monthly.map(m => ({
    month: fmtMonth(m.month, dateLocale),
    portfolio: m.portfolio_cum != null ? (m.portfolio_cum - 1) * 100 : null,
    cdi: m.cdi_cum != null ? (m.cdi_cum - 1) * 100 : null,
    ibov: m.ibov_cum != null ? (m.ibov_cum - 1) * 100 : null,
    sp500: m.sp500_cum != null ? (m.sp500_cum - 1) * 100 : null,
  }))

  const rows: Array<{ label: string; pct: SnapshotBenchmarkPct }> = [
    { label: s.thisPeriod, pct: bm.period },
    { label: s.sinceInception, pct: bm.since_inception },
  ]

  return (
    <ReportSection title={s.benchmarksTitle} className={className}>
      <table className="arvo-num" style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14, marginBottom: 20 }}>
        <thead>
          <tr style={{ borderBottom: '1px solid rgba(13,13,13,0.10)' }}>
            <th style={th('left')} />
            <th style={th()}>{s.portfolioLabel}</th>
            <th style={th()}>CDI</th>
            <th style={th()}>IBOV</th>
            <th style={th()}>S&amp;P 500</th>
            <th style={th()}>{s.alphaVsCdi}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(r => {
            const alpha = r.pct.portfolio_pct != null && r.pct.cdi_pct != null ? r.pct.portfolio_pct - r.pct.cdi_pct : null
            return (
              <tr key={r.label} style={{ borderBottom: '1px solid rgba(13,13,13,0.06)' }}>
                <td style={{ ...td('left'), fontFamily: 'var(--arvo-font-body)' }}>{r.label}</td>
                <td style={{ ...td(), fontWeight: 600 }}>{fmtSignedPct(r.pct.portfolio_pct)}</td>
                <td style={td()}>{fmtSignedPct(r.pct.cdi_pct)}</td>
                <td style={td()}>{fmtSignedPct(r.pct.ibov_pct)}</td>
                <td style={td()}>{fmtSignedPct(r.pct.sp500_pct)}</td>
                <td style={{ ...td(), fontWeight: 600, color: alpha == null ? '#0D0D0D' : alpha >= 0 ? 'var(--arvo-green)' : 'var(--arvo-red)' }}>
                  {fmtSignedPct(alpha)}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>

      <div className="arvo-recharts-wrapper" style={{ height: 220 }}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid stroke={REPORT_GRID} vertical={false} />
            <XAxis dataKey="month" tick={REPORT_AXIS_TICK} tickLine={false} axisLine={REPORT_AXIS_LINE} interval="preserveStartEnd" />
            <YAxis tick={REPORT_AXIS_TICK} tickLine={false} axisLine={false}
              tickFormatter={v => `${Number(v) > 0 ? '+' : ''}${Number(v).toFixed(0)}%`} />
            <Tooltip content={<ArvoTooltip formatter={(v, name) => [`${v >= 0 ? '+' : ''}${v.toFixed(2)}%`, name]} />} />
            <Line type="monotone" dataKey="portfolio" name={s.portfolioLabel} stroke={REPORT_SERIES.portfolio} strokeWidth={2} dot={false} connectNulls />
            <Line type="monotone" dataKey="cdi" name="CDI" stroke={REPORT_SERIES.cdi} strokeWidth={1.5} strokeDasharray="4 2" dot={false} connectNulls />
            <Line type="monotone" dataKey="ibov" name="IBOV" stroke={REPORT_SERIES.ibov} strokeWidth={1.5} strokeDasharray="4 2" dot={false} connectNulls />
            <Line type="monotone" dataKey="sp500" name="S&P500" stroke={REPORT_SERIES.sp500} strokeWidth={1.5} strokeDasharray="4 2" dot={false} connectNulls />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <ChartLegend items={[
        { color: REPORT_SERIES.portfolio, label: s.portfolioLabel },
        { color: REPORT_SERIES.cdi, label: 'CDI', dashed: true },
        { color: REPORT_SERIES.ibov, label: 'IBOV', dashed: true },
        { color: REPORT_SERIES.sp500, label: 'S&P 500', dashed: true },
      ]} />
    </ReportSection>
  )
}

// ============================================================
// Section 5 — Multi-dimensional allocation
// ============================================================

function AllocationSection({ data, t, s, currency, dateLocale, showVal, className }: {
  data: PublicData; t: T; s: T['sharePortfolio']; currency: string; dateLocale: string; showVal: boolean; className?: string
}) {
  const hasTargets = data.by_class.some(c => c.target_pct != null)

  return (
    <>
      <ReportSection title={s.allocation} className={className}>
        {data.by_class.length === 0 ? <EmptyNote text={t.common.noData} /> : (
          <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', alignItems: 'center' }}>
            <div className="arvo-recharts-wrapper" style={{ flex: '0 0 196px', height: 196 }}>
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={data.by_class} dataKey="pct" nameKey="name" cx="50%" cy="50%" innerRadius="58%" outerRadius="88%" paddingAngle={2} stroke="#fff" strokeWidth={2}>
                    {data.by_class.map((c, i) => <Cell key={i} fill={c.color} />)}
                    <Label
                      content={(props) => {
                        const vb = (props.viewBox as unknown as { cx?: number; cy?: number; x?: number; y?: number; width?: number; height?: number }) ?? {}
                        const cx = vb.cx ?? (vb.x ?? 0) + (vb.width ?? 0) / 2
                        const cy = vb.cy ?? (vb.y ?? 0) + (vb.height ?? 0) / 2
                        const [line1, line2] = s.totalWealth.toUpperCase().split(' ')
                        return (
                          <g>
                            <text x={cx} y={cy - 16} textAnchor="middle" fill="#9CA3AF" fontSize={8} fontFamily="var(--arvo-font-body)" letterSpacing="0.08em">{line1}</text>
                            <text x={cx} y={cy - 5} textAnchor="middle" fill="#9CA3AF" fontSize={8} fontFamily="var(--arvo-font-body)" letterSpacing="0.08em">{line2}</text>
                            <text x={cx} y={cy + 11} textAnchor="middle" fill="#0D0D0D" fontSize={13} fontFamily="var(--arvo-font-body)" fontWeight={600} className="arvo-num">
                              {fmtCurr(data.total, currency, dateLocale)}
                            </text>
                          </g>
                        )
                      }}
                      position="center"
                    />
                  </Pie>
                  <Tooltip content={<ArvoTooltip formatter={(v, _n, item) => [`${Number(v).toFixed(1)}%`, resolveClassName(item.payload as SnapshotClassValue, t)]} />} />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div style={{ flex: 1, minWidth: 200 }}>
              {data.by_class.map(c => (
                <AllocBarRow key={c.key} color={c.color} label={resolveClassName(c, t)} pct={c.pct} value={c.value}
                  target={hasTargets ? c.target_pct : null} currency={currency} dateLocale={dateLocale} showVal={showVal} s={s} />
              ))}
            </div>
          </div>
        )}
      </ReportSection>

      <div className="arvo-pdf-nobreak" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: 20, marginBottom: 20 }}>
        <ReportSection title={s.geography} style={{ marginBottom: 0 }}>
          {data.by_geography.length === 0 ? <EmptyNote text={t.common.noData} /> : data.by_geography.map(g => (
            <AllocBarRow key={g.key} icon={<CountryBadge code={g.key} />} color="#0D0D0D" label={countryLabel(g, s)} pct={g.pct} value={g.value}
              currency={currency} dateLocale={dateLocale} showVal={showVal} s={s} />
          ))}
        </ReportSection>

        <ReportSection title={s.bySector} style={{ marginBottom: 0 }}>
          {data.by_sector.length === 0 ? <EmptyNote text={t.common.noData} /> : data.by_sector.map((g, i) => (
            <AllocBarRow key={g.key} color={breakdownColor(i)} label={g.label} pct={g.pct} value={g.value}
              currency={currency} dateLocale={dateLocale} showVal={showVal} s={s} />
          ))}
        </ReportSection>

        <ReportSection title={s.byCurrency} style={{ marginBottom: 0 }}>
          {data.by_currency.length === 0 ? <EmptyNote text={t.common.noData} /> : data.by_currency.map((g, i) => (
            <AllocBarRow key={g.key} color={breakdownColor(i + 7)} label={g.label} pct={g.pct} value={g.value}
              currency={currency} dateLocale={dateLocale} showVal={showVal} s={s} />
          ))}
        </ReportSection>
      </div>
    </>
  )
}

// ============================================================
// Section 6 — Concentration & diversification
// ============================================================

function ConcentrationSection({ data, s, d }: { data: PublicData; s: T['sharePortfolio']; d: T['diversification'] }) {
  const div = data.diversification
  if (!div) return null
  const assetBadge = hhiBadge(div.hhi_asset_normalized, d)
  const geoBadge = hhiBadge(div.hhi_geography_normalized, d)
  const sectorBadge = hhiBadge(div.hhi_sector_normalized, d)

  return (
    <ReportSection title={s.concentrationTitle}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 24 }}>
        <MetricCard label={d.assetHhi} value={fmtPct(div.hhi_asset_normalized * 100)} badge={assetBadge.text} badgeColor={assetBadge.color} />
        <MetricCard label={d.geoHhi} value={fmtPct(div.hhi_geography_normalized * 100)} badge={geoBadge.text} badgeColor={geoBadge.color} />
        <MetricCard label={d.sectorHhi} value={fmtPct(div.hhi_sector_normalized * 100)} badge={sectorBadge.text} badgeColor={sectorBadge.color} />
        <MetricCard label={d.effectiveN} value={div.effective_n.toFixed(1)} sub={d.effectiveNDesc} />
        <MetricCard label={s.top5Concentration} value={fmtPct(div.top5_pct)} />
        <MetricCard label={s.positions} value={`${div.n_positions}`} />
      </div>
    </ReportSection>
  )
}

// ============================================================
// Section 7 — Top holdings table
// ============================================================

function TopPositionsSection({ data, t, s, currency, dateLocale, showVal, className }: {
  data: PublicData; t: T; s: T['sharePortfolio']; currency: string; dateLocale: string; showVal: boolean; className?: string
}) {
  if (data.hide_holdings || data.top_assets.length === 0) return null
  const maxPct = Math.max(1, ...data.top_assets.map(a => a.pct))

  return (
    <ReportSection title={s.topPositions} className={className}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
        <thead>
          <tr style={{ borderBottom: '1px solid rgba(13,13,13,0.10)' }}>
            <th style={th('left')}>{s.rank}</th>
            <th style={th('left')}>{s.ticker}</th>
            <th style={th('left')}>{s.assetClass}</th>
            <th style={th()}>{s.weight}</th>
            {showVal && <th style={th()}>{s.value}</th>}
            <th style={th()}>{s.returnPct}</th>
          </tr>
        </thead>
        <tbody>
          {data.top_assets.map((a, i) => (
            <tr key={a.id} style={{ borderBottom: '1px solid rgba(13,13,13,0.04)', background: i % 2 === 1 ? 'rgba(13,13,13,0.015)' : 'transparent' }}>
              <td style={{ ...td('left'), color: '#9CA3AF' }}>{i + 1}</td>
              <td style={td('left')}>
                <div style={{ fontWeight: 600 }}>{a.code}</div>
                <div style={{ fontSize: 12, color: '#9CA3AF', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 200 }}>{a.name}</div>
              </td>
              <td style={td('left')}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, color: '#374151' }}>
                  <span style={{ width: 8, height: 8, borderRadius: 2, background: a.class_color, flexShrink: 0 }} />
                  {resolveClassName({ name: a.class_name, name_key: a.class_name_key }, t)}
                </span>
              </td>
              <td className="arvo-num" style={td()}>
                <div>{a.pct.toFixed(1)}%</div>
                <div style={{ height: 2, background: 'rgba(0,0,0,0.06)', borderRadius: 1, marginTop: 4, width: 60, marginLeft: 'auto' }}>
                  <div style={{ height: '100%', width: `${(a.pct / maxPct) * 100}%`, background: a.class_color, borderRadius: 1 }} />
                </div>
              </td>
              {showVal && <td className="arvo-num" style={td()}>{fmtCurr(a.value, currency, dateLocale)}</td>}
              <td className="arvo-num" style={{ ...td(), fontWeight: 600, color: a.return_pct == null ? '#9CA3AF' : a.return_pct >= 0 ? 'var(--arvo-green)' : 'var(--arvo-red)' }}>
                {fmtSignedPct(a.return_pct)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </ReportSection>
  )
}

// ============================================================
// Section 8 — Performance highlights (gainers / losers)
// ============================================================

function PerformanceHighlightsSection({ data, t, s }: { data: PublicData; t: T; s: T['sharePortfolio'] }) {
  if (data.hide_holdings) return null
  const hasData = data.top_gainers.length > 0 || data.top_losers.length > 0
  if (!hasData) {
    return (
      <ReportSection title={s.performanceHighlights}>
        <EmptyNote text={s.noReturnData} />
      </ReportSection>
    )
  }
  return (
    <ReportSection title={s.performanceHighlights}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 24 }}>
        {data.top_gainers.length > 0 && <MoversList title={t.dashboard.topGainers} items={data.top_gainers} color="var(--arvo-green)" />}
        {data.top_losers.length > 0 && <MoversList title={t.dashboard.topLosers} items={data.top_losers} color="var(--arvo-red)" />}
      </div>
    </ReportSection>
  )
}

function MoversList({ title, items, color }: { title: string; items: SnapshotAsset[]; color: string }) {
  const maxAbs = Math.max(1, ...items.map(a => Math.abs(a.return_pct ?? 0)))
  return (
    <div>
      <h3 style={{ fontSize: 12, fontWeight: 600, letterSpacing: '0.10em', textTransform: 'uppercase', color: '#9CA3AF', margin: '0 0 12px' }}>{title}</h3>
      {items.map(a => (
        <div key={a.id} style={{ marginBottom: 10 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3, gap: 8 }}>
            <span style={{ fontSize: 14, fontWeight: 600, color: '#0D0D0D', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.code}</span>
            <span className="arvo-num" style={{ fontSize: 14, fontWeight: 600, color, flexShrink: 0 }}>{fmtSignedPct(a.return_pct)}</span>
          </div>
          <div style={{ height: 4, background: 'rgba(0,0,0,0.06)', borderRadius: 2 }}>
            <div style={{ height: '100%', width: `${Math.min((Math.abs(a.return_pct ?? 0) / maxAbs) * 100, 100)}%`, background: color, borderRadius: 2 }} />
          </div>
        </div>
      ))}
    </div>
  )
}

// ============================================================
// Section 9 — Passive income
// ============================================================

function PassiveIncomeSection({ data, s, currency, dateLocale, showVal }: { data: PublicData; s: T['sharePortfolio']; currency: string; dateLocale: string; showVal: boolean }) {
  const div = data.dividends
  const hasAnyData = div.total_12m != null || div.yield_pct != null || div.by_month.some(m => m.total != null) || div.top_payers.length > 0
  if (!hasAnyData) return null

  const avgMonthly = (showVal && div.by_month.length > 0)
    ? div.by_month.reduce((acc, m) => acc + (m.total ?? 0), 0) / div.by_month.length
    : null
  const maxMonth = Math.max(1, ...div.by_month.map(m => m.total ?? 0))

  return (
    <ReportSection title={s.passiveIncome}>
      <div style={{ display: 'flex', gap: 32, flexWrap: 'wrap', marginBottom: 20 }}>
        <KpiBlock label={s.passiveIncome12m} value={fmtCurr(div.total_12m, currency, dateLocale)} />
        {avgMonthly != null && <KpiBlock label={s.passiveMonthly} value={fmtCurr(avgMonthly, currency, dateLocale)} />}
        <KpiBlock label={s.yieldLabel} value={fmtPct(div.yield_pct)} />
      </div>

      {showVal && div.by_month.some(m => m.total != null) && (
        <div style={{ display: 'flex', gap: 4, alignItems: 'flex-end', height: 64, marginBottom: div.top_payers.length > 0 ? 20 : 0 }}>
          {div.by_month.map(m => (
            <div key={m.month} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, minWidth: 0 }}>
              <div style={{ width: '100%', background: REPORT_SERIES.cdi, borderRadius: '2px 2px 0 0', height: `${((m.total ?? 0) / maxMonth) * 52}px`, minHeight: (m.total ?? 0) > 0 ? 3 : 0 }} />
              <span style={{ fontSize: 9, color: '#9CA3AF' }}>{fmtMonth(m.month, dateLocale)}</span>
            </div>
          ))}
        </div>
      )}

      {div.top_payers.length > 0 && (
        <div>
          <h3 style={{ fontSize: 12, fontWeight: 600, letterSpacing: '0.10em', textTransform: 'uppercase', color: '#9CA3AF', margin: '0 0 10px' }}>{s.topPayers}</h3>
          {div.top_payers.map(p => (
            <div key={p.asset_id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', padding: '6px 0', borderBottom: '1px solid rgba(13,13,13,0.04)', gap: 12 }}>
              <span style={{ fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                <strong>{p.code}</strong> <span style={{ color: '#9CA3AF' }}>· {p.name}</span>
              </span>
              {showVal && <span className="arvo-num" style={{ fontSize: 14, fontWeight: 600, flexShrink: 0 }}>{fmtCurr(p.total, currency, dateLocale)}</span>}
            </div>
          ))}
        </div>
      )}
    </ReportSection>
  )
}

// ============================================================
// Section 10 — Institutional footer
// ============================================================

function FooterSection({ data, s, currency, dateLocale }: { data: PublicData; s: T['sharePortfolio']; currency: string; dateLocale: string }) {
  return (
    <div className="arvo-pdf-nobreak" style={{ textAlign: 'center', paddingTop: 32, marginTop: 8, borderTop: '1px solid rgba(0,0,0,0.08)' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, marginBottom: 12 }}>
        <img src="/brand/logo/arvo-symbol-black.svg" width={16} height={16} alt="" style={{ opacity: 0.35 }} />
        <span style={{ fontFamily: 'var(--arvo-font-display)', fontSize: 14, letterSpacing: '0.25em', color: '#9CA3AF' }}>arvo</span>
      </div>
      <p style={{ fontSize: 12, color: '#9CA3AF', maxWidth: 560, margin: '0 auto 8px', lineHeight: 1.6 }}>{s.disclaimer}</p>
      <p style={{ fontSize: 12, color: '#9CA3AF', maxWidth: 560, margin: '0 auto 16px', lineHeight: 1.6 }}>
        <strong>{s.methodology}:</strong> {s.methodologyNote.replace('{currency}', currency)}
      </p>
      <p style={{ fontSize: 12, color: '#9CA3AF', margin: '0 0 12px' }}>
        {s.generatedBy} Arvo Capital · {fmtDate(data.generated_at, dateLocale)}
      </p>
      <Link to="/" className="arvo-pdf-hide" style={{ fontSize: 13, fontWeight: 600, color: '#0D0D0D', textDecoration: 'none', letterSpacing: '0.04em' }}>
        {s.ctaCreateYours} →
      </Link>
    </div>
  )
}
