import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { PageLoader } from '../components/ArvoLoader'
import { usePortfolioValue, usePerformanceMonthly, usePerformanceDaily, usePerformanceInception, usePerformanceSummary } from '../hooks/usePortfolio'
import { useDividendSummary, useDividendSync } from '../hooks/useDividends'
import { useCurrency } from '../contexts/CurrencyContext'
import { useFavorites } from '../hooks/useFavorites'
import { useAchievementContext } from '../contexts/AchievementContext'
import { useI18n } from '../contexts/I18nContext'
import { apiFetch } from '../lib/api'
import ValueCards from '../components/ValueCards'
import AllocationChart from '../components/AllocationChart'
import AssetTable from '../components/AssetTable'
import FixedIncomeSetupModal from '../components/FixedIncomeSetupModal'
import type { PortfolioAsset } from '../lib/types'
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts'

interface FreedomPlan {
  id: number; is_active: boolean
  initial_capital: number; monthly_contribution: number; monthly_return_rate: number
  currency: string; start_date: string | null; created_at: string
}

function fmtMonthLabel(ym: string) {
  const [y, m] = ym.split('-')
  const names = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez']
  return `${names[parseInt(m) - 1]}/${y.slice(2)}`
}

function fmtDayLabel(dateStr: string) {
  const [, m, d] = dateStr.split('-')
  const names = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez']
  return `${parseInt(d)}/${names[parseInt(m) - 1]}`
}

function localDate(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

type PeriodMode = 'current_month' | 'last_30d' | 'last_12m' | 'ytd' | 'inception'

function localYM(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

function addMonths(ym: string, n: number): string {
  const [y, m] = ym.split('-').map(Number)
  const d = new Date(y, m - 1 + n, 1)
  return localYM(d)
}

export default function DashboardPage() {
  const { data, loading, error, refresh } = usePortfolioValue()
  const { favorites, toggleFavorite } = useFavorites()
  const [selectedAsset, setSelectedAsset] = useState<PortfolioAsset | null>(null)
  const navigate = useNavigate()
  const { triggerCheck } = useAchievementContext()

  const { convert, fmt, currency, fxRates } = useCurrency()
  const { t } = useI18n()
  const td = (t as unknown as Record<string, Record<string, string>>).dividends ?? {}

  useEffect(() => {
    if (data?.total_brl != null) {
      triggerCheck(data.total_brl)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data?.total_brl])

  const inception = usePerformanceInception()
  const now = new Date()
  const currentYear = now.getFullYear()
  const currentYM = localYM(now)

  // Dividend sync — fires once per 6 h
  const { sync: syncDividends, syncing } = useDividendSync()
  const divSyncFired = useRef(false)
  useEffect(() => {
    if (divSyncFired.current) return
    divSyncFired.current = true
    syncDividends()
  }, [syncDividends])

  const [activePlan, setActivePlan] = useState<FreedomPlan | null>(null)
  const [showTarget, setShowTarget] = useState(false)
  useEffect(() => {
    apiFetch<FreedomPlan[]>('/finances/freedom-plans')
      .then(plans => setActivePlan(plans.find(p => p.is_active) ?? plans[0] ?? null))
      .catch(() => {})
  }, [])

  const [periodMode, setPeriodMode] = useState<PeriodMode>('ytd')

  const perfFrom = (() => {
    switch (periodMode) {
      case 'current_month': return currentYM
      case 'last_30d':      return addMonths(currentYM, -1)
      case 'last_12m':      return addMonths(currentYM, -11)
      case 'ytd':           return `${currentYear}-01`
      case 'inception':     return inception ?? `${currentYear}-01`
    }
  })()
  const perfTo = currentYM

  const periodLabel = (() => {
    switch (periodMode) {
      case 'current_month': return t.performance.currentMonth
      case 'last_30d':      return t.performance.last30d
      case 'last_12m':      return t.performance.last12m
      case 'ytd':           return 'YTD'
      case 'inception':     return t.performance.inception
    }
  })()

  const { data: periodSummary, loading: periodLoading } = usePerformanceSummary(perfFrom, perfTo)
  const periodReturnPct = periodSummary?.return_pct ?? null

  // Dividend date range (same period but as full dates)
  const divFrom = (() => {
    switch (periodMode) {
      case 'current_month': return `${currentYM}-01`
      case 'last_30d': { const d = new Date(); d.setDate(d.getDate() - 29); return d.toISOString().split('T')[0] }
      case 'last_12m': { const d = new Date(); d.setFullYear(d.getFullYear() - 1); return d.toISOString().split('T')[0] }
      case 'ytd':     return `${currentYear}-01-01`
      case 'inception': return inception ? `${inception}-01` : `${currentYear}-01-01`
    }
  })()
  const divTo = now.toISOString().split('T')[0]
  const { data: divSummary, loading: divLoading } = useDividendSummary(divFrom, divTo)

  const { data: perfData, loading: chartLoading } = usePerformanceMonthly(inception ?? currentYM, currentYM)

  const useDailyChart = periodMode === 'current_month' || periodMode === 'last_30d'
  const dailyFrom = useDailyChart
    ? periodMode === 'current_month'
      ? `${currentYM}-01`
      : localDate(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 29))
    : null
  const dailyTo = useDailyChart ? localDate(now) : null
  const { data: dailyData, loading: dailyLoading } = usePerformanceDaily(dailyFrom, dailyTo)

  // Target line: project freedom plan trajectory onto the chart
  const planStartDate = activePlan ? (activePlan.start_date ?? activePlan.created_at.slice(0, 10)) : null

  function targetAtDate(dateStr: string): number | null {
    if (!activePlan || !showTarget || !planStartDate) return null
    const t = (new Date(dateStr + 'T12:00:00').getTime() - new Date(planStartDate + 'T12:00:00').getTime()) / (30.4375 * 24 * 3600 * 1000)
    const brlPerUnit = activePlan.currency === 'BRL' ? 1 : (fxRates[activePlan.currency] ?? 1)
    const IC = convert(activePlan.initial_capital * brlPerUnit)
    const MC = convert(activePlan.monthly_contribution * brlPerUnit)
    const r  = activePlan.monthly_return_rate
    const v  = r === 0 ? IC + MC * t : IC * Math.pow(1 + r, t) + MC * (Math.pow(1 + r, t) - 1) / r
    return v > 0 ? v : null
  }

  const rawFiltered = (perfData?.monthly ?? []).filter(m => m.total > 0 && m.month >= perfFrom)
  const portfolioChartData = useDailyChart
    ? (dailyData?.daily ?? []).filter(d => d.total > 0).map(d => ({
        month: fmtDayLabel(d.date),
        value: convert(d.total),
        target: targetAtDate(d.date),
      }))
    : (rawFiltered.length >= 2 ? rawFiltered : (perfData?.monthly ?? []).filter(m => m.total > 0))
        .map(m => {
          const [y, mo] = m.month.split('-').map(Number)
          const lastDay = new Date(y, mo, 0).getDate()
          return {
            month: fmtMonthLabel(m.month),
            value: convert(m.total),
            target: targetAtDate(`${m.month}-${String(lastDay).padStart(2, '0')}`),
          }
        })

  function handleAssetClick(asset: PortfolioAsset) {
    if (asset.needs_manual && asset.source === 'fixed_income') {
      setSelectedAsset(asset)  // FixedIncomeSetupModal para RF sem configuração
    } else {
      navigate(`/assets/${asset.id}`, { state: { total_brl: data?.total_brl ?? 0 } })
    }
  }

  function handleModalClose() { setSelectedAsset(null) }
  function handleSaved() { setSelectedAsset(null); refresh() }

  if (loading) {
    return <PageLoader />
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-xl p-6 text-red-700">
        <p className="font-medium">{t.dashboard.errorLoadingPortfolio}</p>
        <p className="text-sm mt-1">{error}</p>
        <button onClick={refresh} className="mt-3 text-sm underline">{t.dashboard.tryAgain}</button>
      </div>
    )
  }

  if (!data) return null

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 style={{ fontFamily: "var(--arvo-font-body)", fontSize: 18, letterSpacing: '0.06em', color: 'var(--arvo-black)' }}>Dashboard</h1>
        <div className="flex flex-wrap items-center gap-2">
          {([
            { key: 'current_month' as PeriodMode, label: t.performance.currentMonth },
            { key: 'last_30d'      as PeriodMode, label: t.performance.last30d },
            { key: 'last_12m'      as PeriodMode, label: t.performance.last12m },
            { key: 'ytd'           as PeriodMode, label: 'YTD' },
            { key: 'inception'     as PeriodMode, label: t.performance.inception, disabled: !inception },
          ] as Array<{ key: PeriodMode; label: string; disabled?: boolean }>).map(({ key, label, disabled }) => (
            <button
              key={key}
              onClick={() => !disabled && setPeriodMode(key)}
              disabled={disabled}
              style={{
                fontFamily: "var(--arvo-font-body)",
                fontSize: 10,
                letterSpacing: '0.12em',
                textTransform: 'uppercase',
                padding: '6px 12px',
                borderRadius: 6,
                border: `1px solid ${disabled ? 'var(--arvo-border-soft)' : periodMode === key ? 'var(--arvo-black)' : 'var(--arvo-border)'}`,
                background: periodMode === key && !disabled ? 'var(--arvo-black)' : 'white',
                color: disabled ? 'rgba(13,13,13,0.25)' : periodMode === key ? 'var(--arvo-offwhite)' : 'rgba(13,13,13,0.55)',
                cursor: disabled ? 'not-allowed' : 'pointer',
                transition: 'all 0.2s',
              }}
            >{label}</button>
          ))}
          <button
            onClick={refresh}
            style={{ fontFamily: "var(--arvo-font-body)", fontSize: 11, color: 'rgba(13,13,13,0.60)', background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, marginLeft: 4 }}
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            {t.dashboard.refresh}
          </button>
        </div>
      </div>

      {/* Row 1: ValueCards */}
      <div className="grid grid-cols-1 gap-6">
        {(() => {
          const totalInvestedBrl = data.by_asset.reduce((s, a) => s + (a.invested_brl ?? 0), 0)
          const hasInvested = totalInvestedBrl > 0
          const gainLossBrl = hasInvested ? data.total_brl - totalInvestedBrl : null
          const gainLossPct = hasInvested && gainLossBrl != null ? (gainLossBrl / totalInvestedBrl) * 100 : null

          const currentYearStr = String(new Date().getFullYear())
          const januaryData = (perfData?.monthly ?? []).find(m => m.month === `${currentYearStr}-01`)
          const ytdStartValue = januaryData?.prev_total ?? 0
          const yearMonthsWithData = (perfData?.monthly ?? []).filter(m => m.month.startsWith(currentYearStr) && m.total > 0)
          const ytdEndValue = yearMonthsWithData.at(-1)?.total ?? 0
          const ytdContribs = (perfData?.monthly ?? []).filter(m => m.month.startsWith(currentYearStr)).reduce((s, m) => s + m.contributions, 0)
          const ytdReturn = ytdStartValue > 0 ? ((ytdEndValue - ytdStartValue - ytdContribs) / ytdStartValue) * 100 : null

          const currentMonthEntry = (perfData?.monthly ?? []).find(m => m.month === currentYM)
          const monthReturn = currentMonthEntry && currentMonthEntry.prev_total > 0
            ? ((currentMonthEntry.total - currentMonthEntry.prev_total - currentMonthEntry.contributions) / currentMonthEntry.prev_total) * 100
            : null

          return (
            <ValueCards
              total_brl={data.total_brl}
              generated_at={data.generated_at}
              invested_brl={hasInvested ? totalInvestedBrl : null}
              gain_brl={gainLossBrl}
              gain_pct={gainLossPct}
              month_pct={hasInvested ? monthReturn : null}
              ytd_pct={hasInvested ? ytdReturn : null}
              ytd_year={currentYearStr}
              chartLoading={chartLoading || dailyLoading || periodLoading}
              period_pct={hasInvested ? periodReturnPct : null}
              period_label={periodLabel}
            />
          )
        })()}
        {data.by_class.length > 0 && (
          <AllocationChart data={data.by_class} currency={currency} convert={convert} />
        )}
      </div>

      {/* Row 2: Evolution chart — full width */}
      {(chartLoading || portfolioChartData.length > 0) && (
        <div className="rounded-2xl p-5" style={{ background: 'white', border: '1px solid var(--arvo-border)' }}>
          <div className="flex items-center justify-between mb-3">
            <h2 style={{ fontFamily: "var(--arvo-font-body)", fontSize: 13, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--arvo-fg)' }}>{t.dashboard.portfolioEvolution}</h2>
            {activePlan && (
              <button
                onClick={() => setShowTarget(v => !v)}
                style={{
                  fontFamily: 'var(--arvo-font-body)', fontSize: 10, letterSpacing: '0.1em',
                  padding: '4px 10px', borderRadius: 6, border: `1px solid ${showTarget ? '#1B4FD8' : 'var(--arvo-border)'}`,
                  background: showTarget ? '#1B4FD8' : 'white',
                  color: showTarget ? 'white' : 'rgba(13,13,13,0.55)', cursor: 'pointer', transition: 'all 0.2s',
                }}
              >{(t.dashboard as unknown as Record<string,string>).targetLine ?? 'Meta'}</button>
            )}
          </div>
          <div className="h-52">
          {chartLoading ? (
            <div className="h-full flex items-end gap-1 px-2 pb-1">
              {[40, 55, 48, 62, 58, 70, 65, 80, 75, 88, 82, 95].map((h, i) => (
                <div key={i} className="flex-1 bg-gray-100 rounded-t animate-pulse" style={{ height: `${h}%` }} />
              ))}
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={portfolioChartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                <XAxis dataKey="month" tick={{ fontSize: 10, fill: 'rgba(13,13,13,0.55)' }} interval="preserveStartEnd" />
                <YAxis
                  tick={{ fontSize: 10, fill: 'rgba(13,13,13,0.55)' }}
                  tickFormatter={v => {
                    const n = typeof v === 'number' ? v : 0
                    return currency === 'BRL'
                      ? `${(n / 1000).toFixed(0)}k`
                      : n >= 1000 ? `${(n / 1000).toFixed(0)}k` : n.toFixed(0)
                  }}
                  width={52}
                  domain={['auto', 'auto']}
                />
                <Tooltip
                  formatter={(v, name) => [
                    new Intl.NumberFormat('pt-BR', { style: 'currency', currency, maximumFractionDigits: 0 }).format(typeof v === 'number' ? v : 0),
                    name,
                  ]}
                  contentStyle={{ borderRadius: 8, border: '1px solid var(--arvo-border)', fontSize: 12 }}
                />
                <Line type="monotone" dataKey="value" name={t.dashboard.patrimony} stroke="#0D0D0D" strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
                {showTarget && activePlan && <Line type="monotone" dataKey="target" name={(t.dashboard as unknown as Record<string,string>).targetLine ?? 'Meta'} stroke="#1B4FD8" strokeWidth={1.5} dot={false} strokeDasharray="5 3" connectNulls />}
              </LineChart>
            </ResponsiveContainer>
          )}
          </div>
        </div>
      )}

      {data.by_asset.length > 0 ? (
        <AssetTable
          assets={data.by_asset}
          onAssetClick={handleAssetClick}
          favorites={favorites}
          onToggleFavorite={toggleFavorite}
        />
      ) : (
        <div className="rounded-2xl p-12 text-center" style={{ background: 'white', border: '1px solid var(--arvo-border)' }}>
          <p style={{ fontFamily: "var(--arvo-font-body)", fontSize: 16, letterSpacing: '0.06em', color: 'var(--arvo-fg-soft)' }}>{t.dashboard.noOpenPositions}</p>
          <p className="text-sm mt-1" style={{ fontFamily: "'Playfair Display', serif", fontStyle: 'italic', color: 'var(--arvo-fg-soft)', opacity: 0.7 }}>{t.dashboard.addAssetsHint}</p>
        </div>
      )}

      {/* Dividend section — compact, after assets */}
      {(divLoading || (divSummary && divSummary.total_brl > 0)) && (
        <div className="rounded-2xl p-5" style={{ background: 'white', border: '1px solid var(--arvo-border)' }}>
          <div className="flex items-center justify-between mb-3">
            <h2 style={{ fontFamily: "var(--arvo-font-body)", fontSize: 13, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--arvo-fg)' }}>{td.title ?? 'Dividendos'}</h2>
            <div className="flex items-center gap-2">
              {syncing && <span className="text-xs animate-pulse" style={{ color: 'var(--arvo-fg-soft)' }}>{td.autoSyncing ?? 'Atualizando...'}</span>}
            </div>
          </div>

          {divLoading ? (
            <div className="h-14 flex items-center justify-center">
              <div className="text-xs animate-pulse" style={{ color: 'var(--arvo-fg-soft)' }}>{td.syncing ?? 'Carregando...'}</div>
            </div>
          ) : divSummary && divSummary.total_brl > 0 ? (
            <div className="flex flex-wrap gap-4 items-start">
              <div className="shrink-0">
                <p className="text-xs uppercase tracking-wide mb-0.5" style={{ color: 'var(--arvo-fg-soft)' }}>{td.totalReceived ?? 'Total recebido'}</p>
                <p className="text-xl font-bold" style={{ color: 'var(--arvo-green)' }}>{fmt(convert(divSummary.total_brl))}</p>
                <p className="text-xs mt-0.5" style={{ color: 'var(--arvo-fg-soft)' }}>{periodLabel}</p>
              </div>
              <div className="flex-1 min-w-[160px]">
                <p className="text-xs uppercase tracking-wide mb-1.5" style={{ color: 'var(--arvo-fg-soft)' }}>{td.topPayers ?? 'Maiores pagadores'}</p>
                <div className="space-y-1">
                  {divSummary.by_asset.slice(0, 3).map(a => (
                    <div key={a.asset_id} className="flex items-center justify-between gap-2">
                      <span className="text-xs font-medium truncate" style={{ color: 'var(--arvo-fg-muted)' }}>{a.code}</span>
                      <div className="flex items-center gap-2">
                        <div className="w-16 h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--arvo-border)' }}>
                          <div className="h-full rounded-full" style={{ background: 'var(--arvo-green)', width: `${Math.min(100, (a.total_brl / divSummary.by_asset[0].total_brl) * 100)}%` }} />
                        </div>
                        <span className="text-xs w-16 text-right" style={{ color: 'var(--arvo-fg-muted)' }}>{fmt(convert(a.total_brl))}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              {divSummary.by_month.length > 1 && (
                <div className="flex-1 min-w-[140px] h-20">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={divSummary.by_month.map(m => ({ month: m.month.slice(5), value: convert(m.total_brl) }))}>
                      <XAxis dataKey="month" tick={{ fontSize: 9, fill: 'rgba(13,13,13,0.55)' }} />
                      <YAxis hide />
                      <Tooltip
                        formatter={(v) => [new Intl.NumberFormat('pt-BR', { style: 'currency', currency, maximumFractionDigits: 0 }).format(typeof v === 'number' ? v : 0), td.title ?? 'Dividendos']}
                        contentStyle={{ borderRadius: 8, border: '1px solid var(--arvo-border)', fontSize: 12 }}
                      />
                      <Bar dataKey="value" fill="#1F8A5B" radius={[3, 3, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>
          ) : (
            <p className="text-sm" style={{ color: 'var(--arvo-fg-soft)' }}>{td.noData ?? 'Nenhum dividendo no período'}</p>
          )}
        </div>
      )}

      {/* Modal apenas para RF sem configuração */}
      {selectedAsset && (
        <FixedIncomeSetupModal
          asset={selectedAsset}
          onClose={handleModalClose}
          onSaved={handleSaved}
        />
      )}
    </div>
  )
}
