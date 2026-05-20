import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { usePortfolioValue, usePerformanceMonthly, usePerformanceInception } from '../hooks/usePortfolio'
import { useCurrency } from '../contexts/CurrencyContext'
import { useFavorites } from '../hooks/useFavorites'
import { useAchievementContext } from '../contexts/AchievementContext'
import ValueCards from '../components/ValueCards'
import AllocationChart from '../components/AllocationChart'
import AssetTable from '../components/AssetTable'
import FixedIncomeSetupModal from '../components/FixedIncomeSetupModal'
import type { PortfolioAsset } from '../lib/types'
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts'

function fmtMonthLabel(ym: string) {
  const [y, m] = ym.split('-')
  const names = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez']
  return `${names[parseInt(m) - 1]}/${y.slice(2)}`
}

export default function DashboardPage() {
  const { data, loading, error, refresh } = usePortfolioValue()
  const { favorites, toggleFavorite } = useFavorites()
  const [selectedAsset, setSelectedAsset] = useState<PortfolioAsset | null>(null)
  const navigate = useNavigate()
  const { triggerCheck } = useAchievementContext()

  const { convert, currency } = useCurrency()

  useEffect(() => {
    if (data?.total_brl != null) {
      triggerCheck(data.total_brl)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data?.total_brl])

  const inception = usePerformanceInception()
  const currentYM = new Date().toISOString().substring(0, 7)
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
        <div className="text-gray-400 text-sm animate-pulse">Calculando portfólio...</div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-xl p-6 text-red-700">
        <p className="font-medium">Erro ao carregar portfólio</p>
        <p className="text-sm mt-1">{error}</p>
        <button onClick={refresh} className="mt-3 text-sm underline">Tentar novamente</button>
      </div>
    )
  }

  if (!data) return null

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-gray-900">Dashboard</h1>
        <button
          onClick={refresh}
          className="text-sm text-gray-500 hover:text-[#001A70] flex items-center gap-1.5 transition-colors"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          Atualizar
        </button>
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
            chartLoading={chartLoading}
          />
        )
      })()}

      {(chartLoading || portfolioChartData.length > 1) && (
        <div className="bg-white border border-gray-100 rounded-2xl p-5 shadow-sm">
          <h2 className="font-semibold text-gray-800 mb-4">Evolução do portfólio</h2>
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
                    'Patrimônio',
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
          <p className="text-lg font-medium">Nenhum ativo com posição aberta</p>
          <p className="text-sm mt-1">Adicione ativos e registre suas compras para visualizar o portfólio.</p>
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
