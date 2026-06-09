import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts'
import { useI18n } from '../contexts/I18nContext'
import LanguageSelector from '../components/LanguageSelector'

interface ClassEntry  { name: string; key: string | null; color: string; pct: number; value: number | null }
interface AssetEntry  { code: string; name: string; pct: number; value_brl: number | null; class_name: string; class_color: string; exchange: string | null }
interface DivMonth    { month: string; amount: number }

interface PublicData {
  owner_name: string | null
  show_values: boolean
  updated_at: string
  total_brl: number | null
  asset_count: number
  generated_at: string
  by_class: ClassEntry[]
  top_assets: AssetEntry[]
  dividends_12m: number | null
  monthly_dividends: DivMonth[]
}

const COUNTRY_MAP: Record<string, { flag: string; color: string }> = {
  BR:     { flag: '🇧🇷', color: '#1B4FD8' },
  US:     { flag: '🇺🇸', color: '#E8A020' },
  EU:     { flag: '🇪🇺', color: '#16A34A' },
  CRYPTO: { flag: '🌐', color: '#9333EA' },
  OTHER:  { flag: '📋', color: '#94A3B8' },
}

function getCountryKey(exchange: string | null): string {
  const e = (exchange ?? '').toUpperCase()
  if (['BVMF', 'B3', 'BOVESPA', 'SAO'].some(x => e.startsWith(x))) return 'BR'
  if (['NYSE', 'NASDAQ', 'AMEX', 'NYSEARCA', 'NYQ', 'NMS', 'PCX', 'NGM', 'BATS', 'CBOE'].includes(e)) return 'US'
  if (['XPAR', 'XETR', 'XLON', 'LSE', 'EURONEXT', 'XAMS', 'XBRU', 'XMIL', 'XMAD', 'EPA', 'FRA'].includes(e)) return 'EU'
  return 'OTHER'
}

const LOCALE_MAP: Record<string, string> = { pt: 'pt-BR', en: 'en-US', fr: 'fr-FR' }
const SECTOR_PALETTE = ['#1B4FD8', '#E8A020', '#D63B2F', '#16A34A', '#9333EA', '#0891B2', '#EA580C', '#6B7280', '#0D9488', '#BE185D']

function fmtBRL(n: number, locale: string) {
  return new Intl.NumberFormat(locale, { style: 'currency', currency: 'BRL', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(n)
}
function fmtDate(iso: string, locale: string) {
  return new Date(iso).toLocaleDateString(locale, { day: '2-digit', month: 'long', year: 'numeric' })
}
function fmtPct(n: number) { return `${(n * 100).toFixed(1)}%` }

const MONTH_SHORT: Record<string, Record<string, string>> = {
  pt: { '01': 'Jan', '02': 'Fev', '03': 'Mar', '04': 'Abr', '05': 'Mai', '06': 'Jun', '07': 'Jul', '08': 'Ago', '09': 'Set', '10': 'Out', '11': 'Nov', '12': 'Dez' },
  en: { '01': 'Jan', '02': 'Feb', '03': 'Mar', '04': 'Apr', '05': 'May', '06': 'Jun', '07': 'Jul', '08': 'Aug', '09': 'Sep', '10': 'Oct', '11': 'Nov', '12': 'Dec' },
  fr: { '01': 'Jan', '02': 'Fév', '03': 'Mar', '04': 'Avr', '05': 'Mai', '06': 'Jun', '07': 'Jul', '08': 'Aoû', '09': 'Sep', '10': 'Oct', '11': 'Nov', '12': 'Déc' },
}
function shortMonth(ym: string, locale: string) { return MONTH_SHORT[locale]?.[ym.slice(5, 7)] ?? ym.slice(5, 7) }

export default function PublicPortfolioPage() {
  const { token } = useParams<{ token: string }>()
  const { t, locale } = useI18n()
  const s = t.sharePortfolio
  const dateLocale = LOCALE_MAP[locale] ?? 'pt-BR'

  const [data, setData] = useState<PublicData | null>(null)
  const [status, setStatus] = useState<'loading' | 'ok' | 'not_found' | 'pending'>('loading')

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

  if (status === 'loading') return (
    <div style={{ minHeight: '100vh', background: '#0D0D0D', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ width: 40, height: 40, border: '3px solid rgba(255,255,255,0.1)', borderTopColor: '#E8A020', borderRadius: '50%', animation: 'spin 0.9s linear infinite' }} />
      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
    </div>
  )

  if (status === 'not_found') return (
    <div style={{ minHeight: '100vh', background: '#0D0D0D', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16, padding: 32 }}>
      <img src="/brand/logo/arvo-symbol-offwhite.svg" width={36} height={36} alt="arvo" />
      <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: 15, fontFamily: 'var(--arvo-font-body)', textAlign: 'center' }}>{s.notFound}</p>
    </div>
  )

  if (status === 'pending') return (
    <div style={{ minHeight: '100vh', background: '#0D0D0D', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16, padding: 32 }}>
      <img src="/brand/logo/arvo-symbol-offwhite.svg" width={36} height={36} alt="arvo" />
      <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: 15, fontFamily: 'var(--arvo-font-body)', textAlign: 'center' }}>{s.snapshotPending}</p>
    </div>
  )

  if (!data) return null

  // Geo groups from top_assets
  const geoMap = new Map<string, { flag: string; color: string; pct: number }>()
  for (const a of data.top_assets) {
    const key = getCountryKey(a.exchange)
    const info = COUNTRY_MAP[key] ?? COUNTRY_MAP.OTHER
    const existing = geoMap.get(key)
    if (existing) existing.pct += a.pct
    else geoMap.set(key, { ...info, pct: a.pct })
  }
  const unaccounted = 1 - data.top_assets.reduce((s, a) => s + a.pct, 0)
  if (unaccounted > 0.001) {
    const ex = geoMap.get('OTHER')
    if (ex) ex.pct += unaccounted
    else geoMap.set('OTHER', { ...COUNTRY_MAP.OTHER, pct: unaccounted })
  }
  const geoGroups = [...geoMap.values()].sort((a, b) => b.pct - a.pct)

  const avgMonthly = data.monthly_dividends.length > 0
    ? data.monthly_dividends.reduce((s, m) => s + m.amount, 0) / data.monthly_dividends.length
    : 0

  const maxDiv = Math.max(...data.monthly_dividends.map(m => m.amount), 1)

  const countryLabel = (key: string) => {
    const labels: Record<string, string> = { BR: s.countryBR, US: s.countryUS, EU: s.countryEU, CRYPTO: s.countryCrypto, OTHER: s.countryOther }
    return labels[key] ?? key
  }

  const customTooltip = ({ active, payload }: { active?: boolean; payload?: Array<{ name: string; value: number; payload: { pct: number } }> }) => {
    if (!active || !payload?.length) return null
    const e = payload[0]
    return (
      <div style={{ background: '#1a1a1a', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, padding: '8px 12px', fontSize: 12, color: '#fff' }}>
        <div style={{ fontWeight: 600 }}>{e.name}</div>
        <div>{fmtPct(e.payload.pct)}</div>
      </div>
    )
  }

  return (
    <div style={{ minHeight: '100vh', background: '#F4F3F1', fontFamily: 'var(--arvo-font-body)' }}>

      {/* ── BRANDED HEADER ── */}
      <div style={{ background: '#0D0D0D', padding: '0', position: 'relative', overflow: 'hidden' }}>
        {/* Subtle gradient accent */}
        <div style={{ position: 'absolute', top: -120, left: '50%', transform: 'translateX(-50%)', width: 600, height: 300, background: 'radial-gradient(ellipse, rgba(27,79,216,0.18) 0%, transparent 70%)', pointerEvents: 'none' }} />

        {/* Top bar */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '20px 32px 0', position: 'relative' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <img src="/brand/logo/arvo-symbol-offwhite.svg" width={22} height={22} alt="" />
            <span style={{ fontFamily: 'var(--arvo-font-display)', fontSize: 14, letterSpacing: '0.30em', textIndent: '0.30em', color: 'rgba(255,255,255,0.9)', lineHeight: 1 }}>arvo</span>
            <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', marginLeft: 8, fontFamily: 'var(--arvo-font-body)', letterSpacing: '0.12em', textTransform: 'uppercase' }}>Capital</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', letterSpacing: '0.06em' }}>
              {s.generatedAt} {fmtDate(data.updated_at, dateLocale)}
            </span>
            <LanguageSelector />
          </div>
        </div>

        {/* Hero content */}
        <div style={{ textAlign: 'center', padding: '40px 32px 52px', position: 'relative' }}>
          {data.owner_name && (
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.45)', letterSpacing: '0.18em', textTransform: 'uppercase', marginBottom: 16, fontFamily: 'var(--arvo-font-body)' }}>
              {data.owner_name}
            </div>
          )}
          <h1 style={{ fontFamily: 'var(--arvo-font-display)', fontSize: 'clamp(22px, 5vw, 36px)', fontWeight: 400, color: '#fff', margin: '0 0 8px', letterSpacing: '0.04em', lineHeight: 1.1 }}>
            {s.reportTitle}
          </h1>
          <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.45)', margin: '0 0 36px', letterSpacing: '0.06em' }}>
            {s.reportSubtitle}
          </p>

          {/* Key metrics strip */}
          <div style={{ display: 'flex', justifyContent: 'center', gap: 'clamp(16px, 4vw, 48px)', flexWrap: 'wrap' }}>
            {data.total_brl != null && (
              <div>
                <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 6 }}>{s.totalWealth}</div>
                <div style={{ fontFamily: 'var(--arvo-font-display)', fontSize: 'clamp(28px, 6vw, 44px)', color: '#fff', fontWeight: 400, lineHeight: 1 }}>
                  {fmtBRL(data.total_brl, dateLocale)}
                </div>
              </div>
            )}
            <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', gap: 8 }}>
              <Pill value={`${data.asset_count}`} label={s.assets} />
              <Pill value={`${data.by_class.length}`} label={data.by_class.length === 1 ? 'classe' : 'classes'} />
            </div>
          </div>
        </div>

        {/* Bottom separator wave */}
        <svg viewBox="0 0 1440 40" style={{ display: 'block', marginBottom: -1 }} preserveAspectRatio="none">
          <path d="M0,40 L0,20 Q360,0 720,20 Q1080,40 1440,20 L1440,40 Z" fill="#F4F3F1" />
        </svg>
      </div>

      {/* ── BODY ── */}
      <div style={{ maxWidth: 900, margin: '0 auto', padding: '32px 16px 80px' }}>

        {/* Allocation + Geography — 2 columns */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 20, marginBottom: 20 }}>

          {/* Allocation */}
          <Section title={s.allocation}>
            <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
              <div style={{ flex: '0 0 140px', height: 140 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={data.by_class.map((c, i) => ({ ...c, fill: SECTOR_PALETTE[i % SECTOR_PALETTE.length] }))}
                      dataKey="pct" nameKey="name" innerRadius={40} outerRadius={64} paddingAngle={2}>
                      {data.by_class.map((_, i) => <Cell key={i} fill={SECTOR_PALETTE[i % SECTOR_PALETTE.length]} />)}
                    </Pie>
                    <Tooltip content={customTooltip as any} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                {data.by_class.map((c, i) => (
                  <AllocRow key={c.name} color={SECTOR_PALETTE[i % SECTOR_PALETTE.length]} label={c.name} pct={c.pct} value={c.value} locale={dateLocale} />
                ))}
              </div>
            </div>
          </Section>

          {/* Geography */}
          <Section title={s.geography}>
            <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
              <div style={{ flex: '0 0 140px', height: 140 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={geoGroups} dataKey="pct" nameKey="flag" innerRadius={40} outerRadius={64} paddingAngle={2}>
                      {geoGroups.map((g, i) => <Cell key={i} fill={g.color} />)}
                    </Pie>
                    <Tooltip content={customTooltip as any} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                {[...geoMap.entries()].sort(([, a], [, b]) => b.pct - a.pct).map(([key, g]) => (
                  <AllocRow key={key} color={g.color} label={`${g.flag}  ${countryLabel(key)}`} pct={g.pct} value={null} locale={dateLocale} />
                ))}
              </div>
            </div>
          </Section>
        </div>

        {/* Top positions */}
        <Section title={s.topPositions} style={{ marginBottom: 20 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 10 }}>
            {data.top_assets.map((a, i) => (
              <div key={a.code} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', background: '#FAFAF8', borderRadius: 10, border: '1px solid rgba(0,0,0,0.06)' }}>
                <div style={{ width: 28, height: 28, borderRadius: 6, background: a.class_color + '22', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: a.class_color }}>{i + 1}</span>
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                    <span style={{ fontSize: 13, fontWeight: 700, color: '#0D0D0D' }}>{a.code}</span>
                    <span style={{ fontSize: 13, fontWeight: 600, color: '#0D0D0D' }}>{fmtPct(a.pct)}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 2 }}>
                    <span style={{ fontSize: 11, color: '#6B7280', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 110 }}>{a.name}</span>
                    {a.value_brl != null && <span style={{ fontSize: 11, color: '#6B7280' }}>{fmtBRL(a.value_brl, dateLocale)}</span>}
                  </div>
                  <div style={{ height: 2, background: 'rgba(0,0,0,0.06)', borderRadius: 1, marginTop: 6 }}>
                    <div style={{ height: '100%', width: `${a.pct * 100 / (data.top_assets[0]?.pct ?? 1) * 100}%`, background: a.class_color, borderRadius: 1, maxWidth: '100%' }} />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </Section>

        {/* Passive income */}
        {(data.dividends_12m != null || data.monthly_dividends.length > 0) && (
          <Section title={s.passiveIncome} style={{ marginBottom: 20 }}>
            {data.dividends_12m != null && (
              <div style={{ display: 'flex', gap: 24, marginBottom: 20, flexWrap: 'wrap' }}>
                <div>
                  <div style={{ fontSize: 11, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>{s.passiveIncome12m}</div>
                  <div style={{ fontFamily: 'var(--arvo-font-display)', fontSize: 24, color: '#0D0D0D', fontWeight: 400 }}>{fmtBRL(data.dividends_12m, dateLocale)}</div>
                </div>
                {avgMonthly > 0 && (
                  <div>
                    <div style={{ fontSize: 11, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>{s.passiveMonthly}</div>
                    <div style={{ fontFamily: 'var(--arvo-font-display)', fontSize: 24, color: '#0D0D0D', fontWeight: 400 }}>{fmtBRL(avgMonthly, dateLocale)}</div>
                  </div>
                )}
              </div>
            )}
            {data.monthly_dividends.length > 0 ? (
              <div style={{ display: 'flex', gap: 4, alignItems: 'flex-end', height: 64, overflow: 'hidden' }}>
                {data.monthly_dividends.map(m => (
                  <div key={m.month} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, minWidth: 0 }}>
                    <div style={{ width: '100%', background: '#1B4FD8', borderRadius: '2px 2px 0 0', height: `${(m.amount / maxDiv) * 52}px`, minHeight: m.amount > 0 ? 3 : 0 }} />
                    <span style={{ fontSize: 9, color: '#9CA3AF', lineHeight: 1 }}>{shortMonth(m.month, locale)}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p style={{ fontSize: 13, color: '#9CA3AF', margin: 0 }}>{s.noPassiveIncome}</p>
            )}
          </Section>
        )}

        {/* Footer */}
        <div style={{ textAlign: 'center', paddingTop: 32, borderTop: '1px solid rgba(0,0,0,0.08)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, marginBottom: 6 }}>
            <img src="/brand/logo/arvo-symbol-black.svg" width={16} height={16} alt="" style={{ opacity: 0.35 }} />
            <span style={{ fontFamily: 'var(--arvo-font-display)', fontSize: 13, letterSpacing: '0.25em', color: '#9CA3AF' }}>arvo</span>
          </div>
          <p style={{ fontSize: 11, color: '#C4C4BF', margin: 0 }}>
            {s.generatedBy} Arvo Capital · {fmtDate(data.generated_at, dateLocale)}
          </p>
        </div>
      </div>
    </div>
  )
}

function Section({ title, children, style }: { title: string; children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={{ background: '#fff', borderRadius: 14, border: '1px solid rgba(0,0,0,0.07)', padding: '24px', boxShadow: '0 1px 3px rgba(0,0,0,0.04)', ...style }}>
      <h2 style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 12, fontWeight: 600, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.12em', margin: '0 0 18px' }}>{title}</h2>
      {children}
    </div>
  )
}

function Pill({ value, label }: { value: string; label: string }) {
  return (
    <div style={{ display: 'inline-flex', alignItems: 'baseline', gap: 5, background: 'rgba(255,255,255,0.08)', borderRadius: 20, padding: '5px 12px' }}>
      <span style={{ fontFamily: 'var(--arvo-font-display)', fontSize: 18, color: '#fff', lineHeight: 1 }}>{value}</span>
      <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.45)' }}>{label}</span>
    </div>
  )
}

function AllocRow({ color, label, pct, value, locale }: { color: string; label: string; pct: number; value: number | null; locale: string }) {
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3, gap: 6 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
          <div style={{ width: 8, height: 8, borderRadius: 2, background: color, flexShrink: 0 }} />
          <span style={{ fontSize: 12, color: '#374151', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</span>
        </div>
        <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
          {value != null && <span style={{ fontSize: 11, color: '#9CA3AF' }}>{fmtBRL(value, locale)}</span>}
          <span style={{ fontSize: 12, fontWeight: 600, color: '#111827' }}>{fmtPct(pct)}</span>
        </div>
      </div>
      <div style={{ height: 3, background: 'rgba(0,0,0,0.06)', borderRadius: 2 }}>
        <div style={{ height: '100%', width: `${pct * 100}%`, background: color, borderRadius: 2, maxWidth: '100%' }} />
      </div>
    </div>
  )
}
