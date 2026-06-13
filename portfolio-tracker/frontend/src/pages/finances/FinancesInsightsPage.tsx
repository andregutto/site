import { useState, useEffect } from 'react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts'
import { apiFetch } from '../../lib/api'
import { useI18n } from '../../contexts/I18nContext'
import { useCurrency } from '../../contexts/CurrencyContext'
import { usePortfolioValue } from '../../hooks/usePortfolio'
import { PageLoader } from '../../components/ArvoLoader'
import PageHeaderTabs from '../../components/PageHeaderTabs'
import { Icon } from '../../components/icons'

function _fmt(n: number, currency: string) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency, minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(n)
}

type Freq = 'weekly' | 'biweekly' | 'monthly' | 'quarterly' | 'biannual' | 'annual'

interface Subscription {
  key: string
  name: string
  frequency: Freq
  median_amount: number
  currency: string
  last_date: string
  annual_cost: number
  monthly_equivalent: number
  occurrences: number
  category: { id: number; name: string; icon: string; color: string } | null
}

interface DismissedSub { key: string; name: string; dismissed_at: string }

interface FeeCategory { id: string; name: string; icon: string; color: string; total: number; count: number }
interface FeeMonth { month: string; amount: number }
interface FeeScanResult { total: number; by_category: FeeCategory[]; monthly: FeeMonth[] }

const FREQ_COLORS: Record<Freq, string> = {
  weekly: '#6366f1',
  biweekly: '#8b5cf6',
  monthly: '#1B4FD8',
  quarterly: '#0891b2',
  biannual: '#059669',
  annual: '#d97706',
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

function formatDate(dateStr: string, locale: string) {
  return new Date(dateStr + 'T00:00:00').toLocaleDateString(
    locale === 'pt' ? 'pt-BR' : locale === 'fr' ? 'fr-FR' : 'en-GB',
    { day: '2-digit', month: 'short', year: 'numeric' }
  )
}

export default function FinancesInsightsPage() {
  const { t, locale } = useI18n()
  const { fmt, hideValues } = useCurrency()
  const { data: portfolio } = usePortfolioValue()
  const fmtSub = (n: number, cur: string) => hideValues ? '•••' : _fmt(n, cur)
  const f = t.fees

  const [tab, setTab] = useState<'subscriptions' | 'fees'>('subscriptions')
  const [loading, setLoading] = useState(true)
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([])
  const [dismissed, setDismissed] = useState<DismissedSub[]>([])
  const [showIgnored, setShowIgnored] = useState(false)

  const [feeResult, setFeeResult] = useState<FeeScanResult | null>(null)
  const [feeError, setFeeError] = useState<string | null>(null)

  useEffect(() => {
    async function loadSubscriptions() {
      let legacyKeys: string[] = []
      try { legacyKeys = JSON.parse(localStorage.getItem('arvo_dismissed_subs') ?? '[]') } catch { /* ignore */ }

      const [subsRes, dismissedRes] = await Promise.all([
        apiFetch<{ subscriptions: Subscription[] }>('/finances/subscriptions'),
        apiFetch<{ dismissed: DismissedSub[] }>('/finances/subscriptions/dismissed'),
      ])

      let dismissedList = dismissedRes.dismissed
      const knownKeys = new Set(dismissedList.map(d => d.key))
      const toMigrate = legacyKeys.filter(k => !knownKeys.has(k))
      if (toMigrate.length > 0) {
        await Promise.all(toMigrate.map(key => {
          const sub = subsRes.subscriptions.find(s => s.key === key)
          return apiFetch('/finances/subscriptions/dismiss', { method: 'POST', body: JSON.stringify({ key, name: sub?.name ?? '' }) })
        }))
        const refreshed = await apiFetch<{ dismissed: DismissedSub[] }>('/finances/subscriptions/dismissed')
        dismissedList = refreshed.dismissed
      }
      if (legacyKeys.length > 0) localStorage.removeItem('arvo_dismissed_subs')

      setSubscriptions(subsRes.subscriptions)
      setDismissed(dismissedList)
    }

    loadSubscriptions().catch(() => {}).finally(() => setLoading(false))

    apiFetch<FeeScanResult>('/finances/fee-scan')
      .then(setFeeResult)
      .catch(e => setFeeError(String(e)))
  }, [])

  async function dismissSub(sub: Subscription) {
    setSubscriptions(prev => prev.filter(s => s.key !== sub.key))
    setDismissed(prev => [{ key: sub.key, name: sub.name, dismissed_at: new Date().toISOString() }, ...prev])
    try {
      await apiFetch('/finances/subscriptions/dismiss', { method: 'POST', body: JSON.stringify({ key: sub.key, name: sub.name }) })
    } catch { /* ignore */ }
  }

  async function restoreSub(key: string) {
    setDismissed(prev => prev.filter(d => d.key !== key))
    try {
      await apiFetch(`/finances/subscriptions/dismiss/${encodeURIComponent(key)}`, { method: 'DELETE' })
      const refreshed = await apiFetch<{ subscriptions: Subscription[] }>('/finances/subscriptions')
      setSubscriptions(refreshed.subscriptions)
    } catch { /* ignore */ }
  }

  const freqLabel: Record<Freq, string> = {
    weekly:    t.finances.frequencyWeekly,
    biweekly:  t.finances.frequencyBiweekly,
    monthly:   t.finances.frequencyMonthly,
    quarterly: t.finances.frequencyQuarterly,
    biannual:  t.finances.frequencyBiannual,
    annual:    t.finances.frequencyAnnual,
  }

  const totalMonthly = subscriptions.reduce((s, sub) => s + sub.monthly_equivalent, 0)
  const totalAnnual  = subscriptions.reduce((s, sub) => s + sub.annual_cost, 0)
  const mainCurrency = subscriptions[0]?.currency ?? 'EUR'

  // ETFs in portfolio with known TER
  const etfsInPortfolio = (portfolio?.by_asset ?? []).flatMap(a => {
    const code = a.code.replace('.SA', '').toUpperCase()
    const known = ETF_TER[code]
    if (!known) return []
    const annualCost = a.value_brl * (known.ter / 100)
    return [{ code, name: known.name, ter: known.ter, value: a.value_brl, annualCost }]
  }).sort((a, b) => b.annualCost - a.annualCost)

  const etfTotalCost = etfsInPortfolio.reduce((s, e) => s + e.annualCost, 0)
  const avgMonthly = feeResult && feeResult.monthly.length > 0 ? feeResult.total / feeResult.monthly.length : 0

  if (loading) return <PageLoader />

  const TABS: { key: 'subscriptions' | 'fees'; label: string }[] = [
    { key: 'subscriptions', label: t.finances.navSubscriptions },
    { key: 'fees', label: t.finances.navFees },
  ]

  return (
    <div className="space-y-5">
      <PageHeaderTabs title={t.finances.insightsTitle} subtitle={t.finances.insightsSubtitle} tabs={TABS} activeTab={tab} onTabChange={setTab} marginBottom={0} />

      {/* ── Subscriptions ────────────────────────────────────────── */}
      {tab === 'subscriptions' && (
      <div className="space-y-3">
        <div>
          <h2 className="text-sm font-semibold text-[var(--arvo-fg)]">{t.finances.subscriptionsTitle}</h2>
          <p className="text-xs text-[var(--arvo-fg-soft)] mt-0.5">{t.finances.subscriptionsSubtitle}</p>
        </div>

        {subscriptions.length === 0 ? (
          <div className="bg-[var(--arvo-surface)] rounded-2xl border border-[var(--arvo-border)] shadow-sm p-12 text-center">
            <Icon name="search" size={40} className="mx-auto mb-3 text-[var(--arvo-fg-faint)]" />
            <p className="text-sm font-medium text-[var(--arvo-fg)]">{t.finances.noSubscriptions}</p>
            <p className="text-xs text-[var(--arvo-fg-soft)] mt-1 max-w-xs mx-auto">{t.finances.noSubscriptionsHint}</p>
          </div>
        ) : (
          <>
            {/* Summary strip */}
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-[var(--arvo-surface)] rounded-2xl border border-[var(--arvo-border)] shadow-sm px-5 py-4">
                <p className="text-xs text-[var(--arvo-fg-soft)] uppercase tracking-wide font-medium mb-1">
                  {t.finances.subscriptionsTotalMonthly}
                </p>
                <p className="text-2xl font-bold arvo-num" style={{ color: 'var(--arvo-fg)', fontFamily: 'var(--arvo-font-body)' }}>
                  {fmtSub(totalMonthly, mainCurrency)}
                </p>
                <p className="text-xs text-[var(--arvo-fg-soft)] mt-0.5">
                  {subscriptions.length} {subscriptions.length === 1 ? t.finances.navSubscriptions.replace(/s$/, '') : t.finances.navSubscriptions}
                </p>
              </div>
              <div className="bg-[var(--arvo-surface)] rounded-2xl border border-[var(--arvo-border)] shadow-sm px-5 py-4">
                <p className="text-xs text-[var(--arvo-fg-soft)] uppercase tracking-wide font-medium mb-1">
                  {t.finances.subscriptionsTotalAnnual}
                </p>
                <p className="text-2xl font-bold arvo-num" style={{ color: 'var(--arvo-fg)', fontFamily: 'var(--arvo-font-body)' }}>
                  {fmtSub(totalAnnual, mainCurrency)}
                </p>
                <p className="text-xs text-[var(--arvo-fg-soft)] mt-0.5">{t.finances.perYear}</p>
              </div>
            </div>

            {/* Subscription cards */}
            <div className="space-y-2">
              {subscriptions.map(sub => (
                <div key={sub.key} className="bg-[var(--arvo-surface)] rounded-2xl border border-[var(--arvo-border)] shadow-sm px-4 sm:px-5 py-4 flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4">
                  {/* Icon + Info */}
                  <div className="flex items-center gap-3 sm:gap-4 flex-1 min-w-0">
                    <div
                      className="w-10 h-10 rounded-xl flex items-center justify-center text-lg shrink-0"
                      style={{ background: `${FREQ_COLORS[sub.frequency]}14` }}
                    >
                      {sub.category ? sub.category.icon : <Icon name="repeat" size={18} style={{ color: FREQ_COLORS[sub.frequency] }} />}
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className="text-sm font-semibold text-[var(--arvo-fg)] truncate">{sub.name}</span>
                        <span
                          className="text-xs font-medium px-1.5 py-0.5 rounded-full shrink-0"
                          style={sub.frequency === 'monthly'
                            ? { background: 'var(--arvo-gold-tint)', color: 'var(--arvo-gold-text)' }
                            : { background: `${FREQ_COLORS[sub.frequency]}18`, color: FREQ_COLORS[sub.frequency] }}
                        >
                          {freqLabel[sub.frequency]}
                        </span>
                      </div>
                      <p className="text-xs text-[var(--arvo-fg-soft)]">
                        {t.finances.lastCharged}: {formatDate(sub.last_date, locale)}
                        {sub.category && <span className="ml-2 text-[var(--arvo-fg-faint)]">·</span>}
                        {sub.category && <span className="ml-2">{sub.category.name}</span>}
                      </p>
                    </div>
                  </div>

                  {/* Amounts + Dismiss */}
                  <div className="flex items-center justify-between sm:justify-end gap-3 sm:gap-6 sm:shrink-0">
                    <div className="text-left sm:text-right shrink-0">
                      <p className="text-base font-bold text-[var(--arvo-fg)] arvo-num">{fmtSub(sub.median_amount, sub.currency)}</p>
                      <p className="text-xs text-[var(--arvo-fg-soft)] arvo-num">{fmtSub(sub.annual_cost, sub.currency)}{t.finances.perYear}</p>
                    </div>

                    <button
                      onClick={() => dismissSub(sub)}
                      className="text-[11px] font-medium shrink-0 px-2.5 py-1.5 rounded-lg border border-[var(--arvo-border)] text-[var(--arvo-fg-soft)] hover:text-[var(--arvo-fg-muted)] hover:border-[var(--arvo-fg-soft)] hover:bg-[var(--arvo-surface-2)] transition-colors whitespace-nowrap"
                      title={t.finances.subscriptionDismissHint}
                    >
                      {t.finances.subscriptionDismiss}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}

        {/* Ignored subscriptions */}
        {dismissed.length > 0 && (
          <div>
            <button
              onClick={() => setShowIgnored(v => !v)}
              className="text-xs font-medium text-[var(--arvo-fg-soft)] hover:text-[var(--arvo-fg-muted)] transition-colors"
            >
              {showIgnored ? t.finances.hideIgnored : t.finances.viewIgnored} ({dismissed.length})
            </button>
            {showIgnored && (
              <div className="mt-2 space-y-1.5">
                {dismissed.map(d => (
                  <div key={d.key} className="bg-[var(--arvo-surface)] rounded-xl border border-[var(--arvo-border)] px-4 py-2.5 flex items-center justify-between gap-3">
                    <span className="text-sm text-[var(--arvo-fg-muted)] truncate">{d.name || d.key}</span>
                    <button
                      onClick={() => restoreSub(d.key)}
                      className="text-xs font-medium shrink-0"
                      style={{ color: '#1B4FD8' }}
                    >
                      {t.finances.subscriptionRestore}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
      )}

      {/* ── Fees ─────────────────────────────────────────────────── */}
      {tab === 'fees' && (
      <div className="space-y-3">
        <div>
          <h2 className="text-sm font-semibold text-[var(--arvo-fg)]">{f.title}</h2>
          <p className="text-xs text-[var(--arvo-fg-soft)] mt-0.5">{f.subtitle}</p>
        </div>

        {feeError ? (
          <div className="bg-[var(--arvo-surface)] rounded-2xl border border-[var(--arvo-border)] shadow-sm p-6 text-center text-sm" style={{ color: '#D63B2F' }}>
            {feeError}
          </div>
        ) : (
          <>
            {/* KPIs */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="bg-[var(--arvo-surface)] rounded-2xl border border-[var(--arvo-border)] shadow-sm px-5 py-4">
                <p className="text-xs text-[var(--arvo-fg-soft)] uppercase tracking-wide font-medium mb-1">{f.totalFees}</p>
                <p className="text-2xl font-bold arvo-num" style={{ color: '#D63B2F', fontFamily: 'var(--arvo-font-body)' }}>{fmt(feeResult?.total ?? 0)}</p>
              </div>
              <div className="bg-[var(--arvo-surface)] rounded-2xl border border-[var(--arvo-border)] shadow-sm px-5 py-4">
                <p className="text-xs text-[var(--arvo-fg-soft)] uppercase tracking-wide font-medium mb-1">{f.avgMonthly}</p>
                <p className="text-2xl font-bold arvo-num" style={{ color: 'var(--arvo-fg)', fontFamily: 'var(--arvo-font-body)' }}>{fmt(avgMonthly)}</p>
              </div>
              {etfTotalCost > 0 && (
                <div className="bg-[var(--arvo-surface)] rounded-2xl border border-[var(--arvo-border)] shadow-sm px-5 py-4">
                  <p className="text-xs text-[var(--arvo-fg-soft)] uppercase tracking-wide font-medium mb-1">{f.etfTotalCost}</p>
                  <p className="text-2xl font-bold arvo-num" style={{ color: '#E8A020', fontFamily: 'var(--arvo-font-body)' }}>{fmt(etfTotalCost)}</p>
                </div>
              )}
            </div>

            {/* Breakdown + monthly trend */}
            {feeResult && feeResult.by_category.length > 0 ? (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <div className="bg-[var(--arvo-surface)] rounded-2xl border border-[var(--arvo-border)] shadow-sm p-6">
                  <h3 className="text-sm font-semibold text-[var(--arvo-fg)] mb-4">{f.byCategory}</h3>
                  {feeResult.by_category.map(cat => (
                    <div key={cat.id} className="flex items-center gap-3 mb-3.5 last:mb-0">
                      <span className="text-xl leading-none shrink-0">{cat.icon}</span>
                      <div className="flex-1 min-w-0">
                        <div className="flex justify-between items-baseline gap-2 mb-1">
                          <span className="text-sm font-medium text-[var(--arvo-fg)] truncate">{cat.name}</span>
                          <span className="text-xs font-semibold shrink-0 arvo-num" style={{ color: '#D63B2F' }}>{fmt(cat.total)}</span>
                        </div>
                        <div className="h-1 rounded-full bg-[var(--arvo-track-bg)]">
                          <div className="h-full rounded-full" style={{ width: `${(cat.total / (feeResult?.total ?? 1)) * 100}%`, background: cat.color || CHART_COLOR }} />
                        </div>
                        <div className="text-xs text-[var(--arvo-fg-soft)] mt-0.5">{cat.count} {f.occurrences}</div>
                      </div>
                    </div>
                  ))}
                </div>

                {feeResult.monthly.length > 1 && (
                  <div className="bg-[var(--arvo-surface)] rounded-2xl border border-[var(--arvo-border)] shadow-sm p-6">
                    <h3 className="text-sm font-semibold text-[var(--arvo-fg)] mb-4">{f.monthlyTrend}</h3>
                    <ResponsiveContainer width="100%" height={180}>
                      <BarChart data={feeResult.monthly} margin={{ left: 0, right: 8, top: 4, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--arvo-border)" />
                        <XAxis dataKey="month" tickFormatter={shortMonth} tick={{ fontSize: 11, fill: 'var(--arvo-fg-soft)' }} axisLine={false} tickLine={false} />
                        <YAxis tickFormatter={v => (hideValues ? '•••' : fmt(Number(v)).replace(/[^0-9.,kKmM]/g, ''))} tick={{ fontSize: 11, fill: 'var(--arvo-fg-soft)' }} axisLine={false} tickLine={false} width={50} />
                        <Tooltip
                          formatter={(v: unknown) => [fmt(Number(v)), f.totalFees]}
                          labelFormatter={(label: unknown) => shortMonth(String(label))}
                          contentStyle={{ fontSize: 12, border: '1px solid var(--arvo-border)', borderRadius: 8 }}
                        />
                        <Bar dataKey="amount" radius={[3, 3, 0, 0]}>
                          {feeResult.monthly.map((_, i) => <Cell key={i} fill={CHART_COLOR} />)}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </div>
            ) : (
              <div className="bg-[var(--arvo-surface)] rounded-2xl border border-[var(--arvo-border)] shadow-sm p-8 text-center">
                <Icon name="check" size={28} className="mx-auto mb-3" style={{ color: 'var(--arvo-green)' }} />
                <div className="text-sm font-semibold text-[var(--arvo-fg)] mb-1">{f.noFees}</div>
                <div className="text-xs text-[var(--arvo-fg-soft)] max-w-sm mx-auto">{f.noFeesHint}</div>
              </div>
            )}

            {/* ETF expense ratios */}
            <div className="bg-[var(--arvo-surface)] rounded-2xl border border-[var(--arvo-border)] shadow-sm p-6">
              <h3 className="text-sm font-semibold text-[var(--arvo-fg)]">{f.etfTitle}</h3>
              <p className="text-xs text-[var(--arvo-fg-soft)] mt-0.5 mb-4">{f.etfSubtitle}</p>

              {etfsInPortfolio.length === 0 ? (
                <div className="text-center py-4 text-sm text-[var(--arvo-fg-soft)]">{f.noEtfs}</div>
              ) : (
                <div>
                  <div className="grid gap-2 pb-2.5 mb-2 border-b border-[var(--arvo-border)]" style={{ gridTemplateColumns: '64px 1fr 56px 80px 80px' }}>
                    {[f.etfCode, f.etfName, f.etfTer, f.etfValue, f.etfAnnualCost].map(h => (
                      <div key={h} className="text-xs font-semibold text-[var(--arvo-fg-soft)] uppercase tracking-wide">{h}</div>
                    ))}
                  </div>
                  {etfsInPortfolio.map(etf => (
                    <div key={etf.code} className="grid gap-2 py-2.5 border-b border-[var(--arvo-border)]" style={{ gridTemplateColumns: '64px 1fr 56px 80px 80px' }}>
                      <div className="text-sm font-bold text-[var(--arvo-fg)]">{etf.code}</div>
                      <div className="text-xs text-[var(--arvo-fg-soft)] overflow-hidden text-ellipsis whitespace-nowrap">{etf.name}</div>
                      <div className="text-xs font-semibold arvo-num" style={{ color: '#E8A020' }}>{etf.ter.toFixed(3)}%</div>
                      <div className="text-xs text-[var(--arvo-fg-soft)] text-right arvo-num">{fmt(etf.value)}</div>
                      <div className="text-xs font-medium text-right arvo-num" style={{ color: '#D63B2F' }}>{fmt(etf.annualCost)}</div>
                    </div>
                  ))}
                  <div className="flex justify-end items-baseline gap-2 mt-3">
                    <span className="text-xs text-[var(--arvo-fg-soft)]">{f.etfTotalCost}</span>
                    <span className="text-base font-bold arvo-num" style={{ color: '#D63B2F' }}>{fmt(etfTotalCost)}</span>
                  </div>
                </div>
              )}
            </div>
          </>
        )}
      </div>
      )}
    </div>
  )
}
