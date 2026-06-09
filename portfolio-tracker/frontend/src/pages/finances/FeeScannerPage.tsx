import { useEffect, useState } from 'react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts'
import { apiFetch } from '../../lib/api'
import { useCurrency } from '../../contexts/CurrencyContext'
import { useI18n } from '../../contexts/I18nContext'
import { usePortfolioValue } from '../../hooks/usePortfolio'

interface FeeCategory { id: string; name: string; icon: string; color: string; total: number; count: number }
interface FeeMonth { month: string; amount: number }
interface FeeScanResult { total: number; by_category: FeeCategory[]; monthly: FeeMonth[] }

// Known ETF expense ratios (TER) — annual %
const ETF_TER: Record<string, { ter: number; name: string }> = {
  // Brazilian ETFs
  BOVA11: { ter: 0.10, name: 'iShares IBOVESPA' },
  IVVB11: { ter: 0.23, name: 'iShares S&P 500' },
  SMAL11: { ter: 0.50, name: 'iShares Small Cap' },
  DIVO11: { ter: 0.39, name: 'iShares Dividendos' },
  HASH11: { ter: 0.69, name: 'Hashdex Cripto' },
  XFIX11: { ter: 0.30, name: 'iShares Renda Fixa' },
  PIBB11: { ter: 0.059, name: 'iShares IBrX-50' },
  BOVV11: { ter: 0.03, name: 'iShares IBOVESPA (Itaú)' },
  SPXI11: { ter: 0.20, name: 'iShares S&P500 (BRL)' },
  NASD11: { ter: 0.50, name: 'Hashdex NASDAQ' },
  GOLD11: { ter: 0.35, name: 'iShares Ouro' },
  BRAX11: { ter: 0.30, name: 'iShares IBrX-100' },
  FIND11: { ter: 0.50, name: 'iShares Financeiro' },
  MATB11: { ter: 0.30, name: 'iShares Materiais Básicos' },
  ECOO11: { ter: 0.30, name: 'iShares Carbono Neutro' },
  GOVE11: { ter: 0.20, name: 'iShares Governança' },
  BBSD11: { ter: 0.50, name: 'Invesco S&P 500 Low Vol' },
  ISUS11: { ter: 0.45, name: 'iShares Sustentabilidade' },
  ACWI11: { ter: 0.45, name: 'iShares MSCI World' },
  EURP11: { ter: 0.45, name: 'iShares MSCI Europa' },
  // US ETFs
  VOO:  { ter: 0.03, name: 'Vanguard S&P 500' },
  VTI:  { ter: 0.03, name: 'Vanguard Total Stock' },
  VEA:  { ter: 0.05, name: 'Vanguard Dev. Markets' },
  VWO:  { ter: 0.08, name: 'Vanguard Emerging Mkts' },
  SPY:  { ter: 0.0945, name: 'SPDR S&P 500' },
  IVV:  { ter: 0.03, name: 'iShares S&P 500' },
  QQQ:  { ter: 0.20, name: 'Invesco QQQ NASDAQ' },
  BND:  { ter: 0.03, name: 'Vanguard Total Bond' },
  GLD:  { ter: 0.40, name: 'SPDR Gold Shares' },
  SLV:  { ter: 0.50, name: 'iShares Silver' },
  VNQ:  { ter: 0.12, name: 'Vanguard REIT' },
  SCHB: { ter: 0.03, name: 'Schwab US Broad Market' },
  SCHF: { ter: 0.06, name: 'Schwab Intl Equity' },
  AGG:  { ter: 0.03, name: 'iShares US Bonds' },
  EEM:  { ter: 0.68, name: 'iShares MSCI Emerg.' },
  LQD:  { ter: 0.14, name: 'iShares Corp Bond' },
  XLF:  { ter: 0.09, name: 'SPDR Financials' },
  XLE:  { ter: 0.09, name: 'SPDR Energy' },
  XLK:  { ter: 0.09, name: 'SPDR Technology' },
  ACWI: { ter: 0.32, name: 'iShares MSCI ACWI' },
  IEMG: { ter: 0.09, name: 'iShares Core Emerg.' },
  VIG:  { ter: 0.06, name: 'Vanguard Dividend Growth' },
  SCHD: { ter: 0.06, name: 'Schwab US Dividend' },
}

const CHART_COLOR = '#1B4FD8'
const MONTH_LABEL_PT: Record<string, string> = {
  '01': 'Jan', '02': 'Fev', '03': 'Mar', '04': 'Abr',
  '05': 'Mai', '06': 'Jun', '07': 'Jul', '08': 'Ago',
  '09': 'Set', '10': 'Out', '11': 'Nov', '12': 'Dez',
}

function shortMonth(ym: string): string {
  const [, m] = ym.split('-')
  return MONTH_LABEL_PT[m] ?? m
}

export default function FeeScannerPage() {
  const { t } = useI18n()
  const { fmt, hideValues } = useCurrency()
  const { data: portfolio } = usePortfolioValue()
  const f = t.fees

  const [result, setResult] = useState<FeeScanResult | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    apiFetch<FeeScanResult>('/finances/fee-scan')
      .then(setResult)
      .catch(e => setError(String(e)))
      .finally(() => setLoading(false))
  }, [])

  const fmtVal = (n: number) => hideValues ? '•••' : fmt(n)

  // ETFs in portfolio with known TER
  const etfsInPortfolio = (portfolio?.by_asset ?? []).flatMap(a => {
    const code = a.code.replace('.SA', '').toUpperCase()
    const known = ETF_TER[code]
    if (!known) return []
    const annualCost = a.value_brl * (known.ter / 100)
    return [{ code, name: known.name, ter: known.ter, value: a.value_brl, annualCost }]
  }).sort((a, b) => b.annualCost - a.annualCost)

  const etfTotalCost = etfsInPortfolio.reduce((s, e) => s + e.annualCost, 0)

  if (loading) return (
    <div style={{ padding: 32, textAlign: 'center', color: 'var(--arvo-fg-soft)', fontFamily: 'var(--arvo-font-body)' }}>...</div>
  )

  if (error) return (
    <div style={{ padding: 32, textAlign: 'center', color: '#D63B2F', fontFamily: 'var(--arvo-font-body)' }}>{error}</div>
  )

  const avgMonthly = result && result.monthly.length > 0
    ? result.total / result.monthly.length
    : 0

  return (
    <div style={{ maxWidth: 800, margin: '0 auto', padding: '24px 16px 64px', fontFamily: 'var(--arvo-font-body)' }}>

      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontFamily: 'var(--arvo-font-display)', fontSize: 22, fontWeight: 700, color: 'var(--arvo-black)', margin: '0 0 4px' }}>{f.title}</h1>
        <p style={{ fontSize: 13, color: 'var(--arvo-fg-soft)', margin: 0 }}>{f.subtitle}</p>
      </div>

      {/* Summary KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginBottom: 20 }}>
        <div style={{ background: '#fff', borderRadius: 12, border: '1px solid var(--arvo-border)', padding: '20px' }}>
          <div style={{ fontSize: 11, fontWeight: 500, color: 'var(--arvo-fg-soft)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>{f.totalFees}</div>
          <div style={{ fontSize: 28, fontWeight: 700, color: '#D63B2F', lineHeight: 1 }}>{fmtVal(result?.total ?? 0)}</div>
        </div>
        <div style={{ background: '#fff', borderRadius: 12, border: '1px solid var(--arvo-border)', padding: '20px' }}>
          <div style={{ fontSize: 11, fontWeight: 500, color: 'var(--arvo-fg-soft)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>{f.avgMonthly}</div>
          <div style={{ fontSize: 28, fontWeight: 700, color: 'var(--arvo-black)', lineHeight: 1 }}>{fmtVal(avgMonthly)}</div>
        </div>
        {etfTotalCost > 0 && (
          <div style={{ background: '#fff', borderRadius: 12, border: '1px solid var(--arvo-border)', padding: '20px' }}>
            <div style={{ fontSize: 11, fontWeight: 500, color: 'var(--arvo-fg-soft)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>{f.etfTotalCost}</div>
            <div style={{ fontSize: 28, fontWeight: 700, color: '#E8A020', lineHeight: 1 }}>{fmtVal(etfTotalCost)}</div>
          </div>
        )}
      </div>

      {/* Fee breakdown */}
      {result && result.by_category.length > 0 ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, marginBottom: 20 }}>
          <div style={{ background: '#fff', borderRadius: 12, border: '1px solid var(--arvo-border)', padding: '24px' }}>
            <h2 style={{ fontSize: 15, fontWeight: 600, margin: '0 0 20px', color: 'var(--arvo-black)' }}>{f.byCategory}</h2>
            {result.by_category.map(cat => (
              <div key={cat.id} style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
                <span style={{ fontSize: 20, lineHeight: 1, flexShrink: 0 }}>{cat.icon}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 4 }}>
                    <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--arvo-black)' }}>{cat.name}</span>
                    <span style={{ fontSize: 12, color: '#D63B2F', fontWeight: 600 }}>{fmtVal(cat.total)}</span>
                  </div>
                  <div style={{ height: 4, background: 'var(--arvo-border)', borderRadius: 2 }}>
                    <div style={{ height: '100%', width: `${(cat.total / (result?.total ?? 1)) * 100}%`, background: cat.color || CHART_COLOR, borderRadius: 2 }} />
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--arvo-fg-soft)', marginTop: 3 }}>{cat.count} {f.occurrences}</div>
                </div>
              </div>
            ))}
          </div>

          {/* Monthly trend */}
          {result.monthly.length > 1 && (
            <div style={{ background: '#fff', borderRadius: 12, border: '1px solid var(--arvo-border)', padding: '24px' }}>
              <h2 style={{ fontSize: 15, fontWeight: 600, margin: '0 0 20px', color: 'var(--arvo-black)' }}>{f.monthlyTrend}</h2>
              <ResponsiveContainer width="100%" height={180}>
                <BarChart data={result.monthly} margin={{ left: 0, right: 8, top: 4, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--arvo-border)" />
                  <XAxis dataKey="month" tickFormatter={shortMonth} tick={{ fontSize: 11, fill: 'var(--arvo-fg-soft)' }} axisLine={false} tickLine={false} />
                  <YAxis tickFormatter={v => (hideValues ? '•••' : fmt(Number(v)).replace(/[^0-9.,kKmM]/g, ''))} tick={{ fontSize: 11, fill: 'var(--arvo-fg-soft)' }} axisLine={false} tickLine={false} width={50} />
                  <Tooltip
                    formatter={(v: unknown) => [fmtVal(Number(v)), f.totalFees]}
                    labelFormatter={(label: unknown) => shortMonth(String(label))}
                    contentStyle={{ fontSize: 12, border: '1px solid var(--arvo-border)', borderRadius: 8 }}
                  />
                  <Bar dataKey="amount" radius={[3, 3, 0, 0]}>
                    {result.monthly.map((_, i) => <Cell key={i} fill={CHART_COLOR} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      ) : (
        !loading && (
          <div style={{ background: '#fff', borderRadius: 12, border: '1px solid var(--arvo-border)', padding: '32px', textAlign: 'center', marginBottom: 20 }}>
            <div style={{ fontSize: 32, marginBottom: 12 }}>✅</div>
            <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--arvo-black)', marginBottom: 6 }}>{f.noFees}</div>
            <div style={{ fontSize: 13, color: 'var(--arvo-fg-soft)', maxWidth: 360, margin: '0 auto', lineHeight: 1.5 }}>{f.noFeesHint}</div>
          </div>
        )
      )}

      {/* ETF expense ratios */}
      <div style={{ background: '#fff', borderRadius: 12, border: '1px solid var(--arvo-border)', padding: '24px' }}>
        <h2 style={{ fontSize: 15, fontWeight: 600, margin: '0 0 4px', color: 'var(--arvo-black)' }}>{f.etfTitle}</h2>
        <p style={{ fontSize: 12, color: 'var(--arvo-fg-soft)', margin: '0 0 20px' }}>{f.etfSubtitle}</p>

        {etfsInPortfolio.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '16px 0', color: 'var(--arvo-fg-soft)', fontSize: 13 }}>{f.noEtfs}</div>
        ) : (
          <div>
            <div style={{ display: 'grid', gridTemplateColumns: '64px 1fr 56px 80px 80px', gap: 8, paddingBottom: 10, borderBottom: '1px solid var(--arvo-border)', marginBottom: 8 }}>
              {[f.etfCode, f.etfName, f.etfTer, f.etfValue, f.etfAnnualCost].map(h => (
                <div key={h} style={{ fontSize: 11, fontWeight: 600, color: 'var(--arvo-fg-soft)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{h}</div>
              ))}
            </div>
            {etfsInPortfolio.map(etf => (
              <div key={etf.code} style={{ display: 'grid', gridTemplateColumns: '64px 1fr 56px 80px 80px', gap: 8, padding: '10px 0', borderBottom: '1px solid var(--arvo-border)' }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--arvo-black)' }}>{etf.code}</div>
                <div style={{ fontSize: 12, color: 'var(--arvo-fg-soft)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{etf.name}</div>
                <div style={{ fontSize: 12, color: '#E8A020', fontWeight: 600 }}>{etf.ter.toFixed(3)}%</div>
                <div style={{ fontSize: 12, color: 'var(--arvo-fg-soft)', textAlign: 'right' }}>{fmtVal(etf.value)}</div>
                <div style={{ fontSize: 12, color: '#D63B2F', fontWeight: 500, textAlign: 'right' }}>{fmtVal(etf.annualCost)}</div>
              </div>
            ))}
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 12, gap: 8, alignItems: 'baseline' }}>
              <span style={{ fontSize: 12, color: 'var(--arvo-fg-soft)' }}>{f.etfTotalCost}</span>
              <span style={{ fontSize: 16, fontWeight: 700, color: '#D63B2F' }}>{fmtVal(etfTotalCost)}</span>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
