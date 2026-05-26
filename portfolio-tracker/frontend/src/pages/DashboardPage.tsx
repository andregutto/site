import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { usePortfolioValue, usePerformanceMonthly, usePerformanceInception, usePerformanceSummary } from '../hooks/usePortfolio'
import { useDividendSummary, useDividendSync } from '../hooks/useDividends'
import { useCurrency } from '../contexts/CurrencyContext'
import { useFavorites } from '../hooks/useFavorites'
import { useAchievementContext } from '../contexts/AchievementContext'
import { useI18n } from '../contexts/I18nContext'
import ValueCards from '../components/ValueCards'
import AllocationChart from '../components/AllocationChart'
import AssetTable from '../components/AssetTable'
import FixedIncomeSetupModal from '../components/FixedIncomeSetupModal'
import type { PortfolioAsset } from '../lib/types'
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts'

function fmtMonthLabel(ym: string) {
  const [y, m] = ym.split('-')
  const names = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez']
  return `${names[parseInt(m) - 1]}/${y.slice(2)}`
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

  const { convert, fmt, currency } = useCurrency()
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
      case 'last_12m': { const d = new Date(); d.setMonth(d.getMonth() - 11); d.setDate(1); return d.toISOString().split('T')[0] }
      case 'ytd':     return `${currentYear}-01-01`
      case 'inception': return inception ? `${inception}-01` : `${currentYear}-01-01`
    }
  })()
  const divTo = now.toISOString().split('T')[0]
  const { data: divSummary, loading: divLoading } = useDividendSummary(divFrom, divTo)

  const { data: perfData, loading: chartLoading } = usePerformanceMonthly(inception ?? currentYM, currentYM)

  const portfolioChartData = (perfData?.monthly ?? [])
    .filter(m => m.total > 0)
    .map(m => ({ month: fmtMonthLabel(m.month), value: convert(m.total) }))

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
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-400 text-sm animate-pulse">{t.dashboard.calculating}</div>
      </div>
    )
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
        <h1 className="text-xl font-bold text-gray-900">Dashboard</h1>
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
              className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors ${
                disabled
                  ? 'bg-white text-gray-300 border-gray-100 cursor-not-allowed'
                  : periodMode === key
                    ? 'bg-[#001A70] text-white border-[#001A70]'
                    : 'bg-white text-gray-500 border-gray-200 hover:border-[#001A70] hover:text-[#001A70]'
              }`}
            >{label}</button>
          ))}
          <button
            onClick={refresh}
            className="text-sm text-gray-500 hover:text-[#001A70] flex items-center gap-1.5 transition-colors ml-1"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            {t.dashboard.refresh}
          </button>
        </div>
      </div>

      {/* Top cards row — Option A: main card (3 cols) + Mês + Ano */}
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
            chartLoading={chartLoading || periodLoading}
            period_pct={hasInvested ? periodReturnPct : null}
            period_label={periodLabel}
          />
        )
      })()}

      {(chartLoading || portfolioChartData.length > 1) && (
        <div className="bg-white border border-gray-100 rounded-2xl p-5 shadow-sm">
          <h2 className="font-semibold text-gray-800 mb-4">{t.dashboard.portfolioEvolution}</h2>
          <div className="h-48">
          {chartLoading && portfolioChartData.length === 0 ? (
            <div className="h-full flex items-end gap-1 px-2 pb-1">
              {[40, 55, 48, 62, 58, 70, 65, 80, 75, 88, 82, 95].map((h, i) => (
                <div key={i} className="flex-1 bg-gray-100 rounded-t animate-pulse" style={{ height: `${h}%` }} />
              ))}
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={portfolioChartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                <XAxis dataKey="month" tick={{ fontSize: 10, fill: '#9ca3af' }} interval="preserveStartEnd" />
                <YAxis
                  tick={{ fontSize: 10, fill: '#9ca3af' }}
                  tickFormatter={v => {
                    const n = typeof v === 'number' ? v : 0
                    return currency === 'BRL'
                      ? `${(n / 1000).toFixed(0)}k`
                      : n >= 1000 ? `${(n / 1000).toFixed(0)}k` : n.toFixed(0)
                  }}
                  width={52}
                />
                <Tooltip
                  formatter={(v) => [
                    new Intl.NumberFormat('pt-BR', { style: 'currency', currency, maximumFractionDigits: 0 }).format(typeof v === 'number' ? v : 0),
                    t.dashboard.patrimony,
                  ]}
                  contentStyle={{ borderRadius: 8, border: '1px solid #e5e7eb', fontSize: 12 }}
                />
                <Line type="monotone" dataKey="value" stroke="#001A70" strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
              </LineChart>
            </ResponsiveContainer>
          )}
          </div>
        </div>
      )}

      {/* Dividend section */}
      {(divLoading || (divSummary && divSummary.total_brl > 0)) && (
        <div className="bg-white border border-gray-100 rounded-2xl p-5 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-gray-800">{td.title ?? 'Dividendos'}</h2>
            <div className="flex items-center gap-2">
              {syncing && <span className="text-xs text-gray-400 animate-pulse">{td.autoSyncing ?? 'Atualizando...'}</span>}
              <button
                onClick={() => syncDividends(true)}
                disabled={syncing}
                className="text-xs text-gray-400 hover:text-[#001A70] transition-colors disabled:opacity-40"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
              </button>
            </div>
          </div>

          {divLoading ? (
            <div className="h-20 flex items-center justify-center">
              <div className="text-xs text-gray-400 animate-pulse">{td.syncing ?? 'Carregando...'}</div>
            </div>
          ) : divSummary && divSummary.total_brl > 0 ? (
            <div className="space-y-4">
              {/* Total + top payers */}
              <div className="flex flex-wrap gap-4">
                <div className="flex-1 min-w-[140px]">
                  <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">{td.totalReceived ?? 'Total recebido'}</p>
                  <p className="text-2xl font-bold text-green-600">{fmt(convert(divSummary.total_brl))}</p>
                  <p className="text-xs text-gray-400 mt-0.5">{periodLabel}</p>
                </div>
                <div className="flex-1 min-w-[200px]">
                  <p className="text-xs text-gray-400 uppercase tracking-wide mb-2">{td.topPayers ?? 'Maiores pagadores'}</p>
                  <div className="space-y-1.5">
                    {divSummary.by_asset.slice(0, 4).map(a => (
                      <div key={a.asset_id} className="flex items-center justify-between gap-2">
                        <span className="text-xs font-medium text-gray-700 truncate">{a.code}</span>
                        <div className="flex items-center gap-2">
                          <div className="w-24 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                            <div className="h-full bg-green-400 rounded-full" style={{ width: `${Math.min(100, (a.total_brl / divSummary.by_asset[0].total_brl) * 100)}%` }} />
                          </div>
                          <span className="text-xs text-gray-500 w-20 text-right">{fmt(convert(a.total_brl))}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Monthly bar chart */}
              {divSummary.by_month.length > 1 && (
                <div className="h-28">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={divSummary.by_month.map(m => ({ month: m.month.slice(5), value: convert(m.total_brl) }))}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" vertical={false} />
                      <XAxis dataKey="month" tick={{ fontSize: 10, fill: '#9ca3af' }} />
                      <YAxis tick={{ fontSize: 10, fill: '#9ca3af' }} width={40}
                        tickFormatter={v => currency === 'BRL' ? `${(v/1000).toFixed(0)}k` : String(Math.round(v))} />
                      <Tooltip
                        formatter={(v) => [new Intl.NumberFormat('pt-BR', { style: 'currency', currency, maximumFractionDigits: 0 }).format(typeof v === 'number' ? v : 0), td.title ?? 'Dividendos']}
                        contentStyle={{ borderRadius: 8, border: '1px solid #e5e7eb', fontSize: 12 }}
                      />
                      <Bar dataKey="value" fill="#16a34a" radius={[3, 3, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>
          ) : (
            <p className="text-sm text-gray-400">{td.noData ?? 'Nenhum dividendo no período'}</p>
          )}
        </div>
      )}

      {data.by_class.length > 0 && (
        <AllocationChart data={data.by_class} />
      )}

      {data.by_asset.length > 0 ? (
        <AssetTable
          assets={data.by_asset}
          onAssetClick={handleAssetClick}
          favorites={favorites}
          onToggleFavorite={toggleFavorite}
        />
      ) : (
        <div className="bg-white border border-gray-100 rounded-2xl p-12 text-center text-gray-400">
          <p className="text-lg font-medium">{t.dashboard.noOpenPositions}</p>
          <p className="text-sm mt-1">{t.dashboard.addAssetsHint}</p>
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
