import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { usePortfolioValue } from '../hooks/usePortfolio'
import ValueCards from '../components/ValueCards'
import AllocationChart from '../components/AllocationChart'
import AssetTable from '../components/AssetTable'
import ManualValueModal from '../components/ManualValueModal'
import FixedIncomeSetupModal from '../components/FixedIncomeSetupModal'
import type { PortfolioAsset } from '../lib/types'

export default function DashboardPage() {
  const { data, loading, error, refresh } = usePortfolioValue()
  const [selectedAsset, setSelectedAsset] = useState<PortfolioAsset | null>(null)
  const navigate = useNavigate()

  function handleAssetClick(asset: PortfolioAsset) {
    // Ticker assets with pricing failure → go to detail page (archive or inspect)
    // True manual/RF assets with missing data → open setup modal
    if (asset.needs_manual && (asset.source === 'manual' || asset.source === 'fixed_income')) {
      setSelectedAsset(asset)
    } else {
      navigate(`/assets/${asset.id}`, { state: { total_brl: data?.total_brl ?? 0 } })
    }
  }

  function handleModalClose() { setSelectedAsset(null) }
  function handleSaved() { setSelectedAsset(null); refresh() }

  // Qual modal abrir
  const isFixedIncome = selectedAsset?.source === 'fixed_income'

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

      <ValueCards
        total_brl={data.total_brl}
        total_usd={data.total_usd}
        total_eur={data.total_eur}
        generated_at={data.generated_at}
      />

      {data.by_class.length > 0 && (
        <AllocationChart data={data.by_class} />
      )}

      {data.by_asset.length > 0 ? (
        <AssetTable assets={data.by_asset} onAssetClick={handleAssetClick} />
      ) : (
        <div className="bg-white border border-gray-100 rounded-2xl p-12 text-center text-gray-400">
          <p className="text-lg font-medium">Nenhum ativo com posição aberta</p>
          <p className="text-sm mt-1">Adicione ativos e registre suas compras para visualizar o portfólio.</p>
        </div>
      )}

      {/* Modais */}
      {selectedAsset && !isFixedIncome && (
        <ManualValueModal
          asset={selectedAsset}
          onClose={handleModalClose}
          onSaved={handleSaved}
        />
      )}
      {selectedAsset && isFixedIncome && (
        <FixedIncomeSetupModal
          asset={selectedAsset}
          onClose={handleModalClose}
          onSaved={handleSaved}
        />
      )}
    </div>
  )
}
