import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { PageLoader } from '../components/ArvoLoader'
import { Button } from '../components/ui/Button'
import { usePortfolioValue } from '../hooks/usePortfolio'
import { useFavorites } from '../hooks/useFavorites'
import { useI18n } from '../contexts/I18nContext'
import AssetTable from '../components/AssetTable'
import FixedIncomeSetupModal from '../components/FixedIncomeSetupModal'
import type { PortfolioAsset } from '../lib/types'

export default function AssetsPage() {
  const { data, loading, error, refresh } = usePortfolioValue()
  const { favorites, toggleFavorite } = useFavorites()
  const { t } = useI18n()
  const navigate = useNavigate()
  const [selectedAsset, setSelectedAsset] = useState<PortfolioAsset | null>(null)

  function handleAssetClick(asset: PortfolioAsset) {
    if (asset.needs_manual && asset.source === 'fixed_income') {
      setSelectedAsset(asset)
    } else {
      navigate(`/assets/${asset.id}`, { state: { total_brl: data?.total_brl ?? 0 } })
    }
  }

  if (loading) return <PageLoader />

  if (error) {
    return (
      <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 12, padding: 24, color: '#b91c1c' }}>
        <p style={{ fontWeight: 600 }}>{t.dashboard.errorLoadingPortfolio}</p>
        <p style={{ fontSize: 14, marginTop: 4 }}>{error}</p>
        <button onClick={refresh} style={{ marginTop: 12, fontSize: 14, textDecoration: 'underline', background: 'none', border: 'none', cursor: 'pointer', color: '#b91c1c' }}>{t.dashboard.tryAgain}</button>
      </div>
    )
  }

  if (!data) return null

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 18, letterSpacing: '0.06em', color: 'var(--arvo-fg)' }}>
          {t.nav.assets}
        </h1>
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => navigate('/portfolio/classes')}>
            {t.nav.classes} →
          </Button>
          <button
            onClick={refresh}
            style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 11, color: 'var(--arvo-fg-muted)', background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            {t.dashboard.refresh}
          </button>
        </div>
      </div>

      {data.by_asset.length > 0 ? (
        <AssetTable
          assets={data.by_asset}
          onAssetClick={handleAssetClick}
          favorites={favorites}
          onToggleFavorite={toggleFavorite}
        />
      ) : (
        <div className="rounded-2xl p-12 text-center" style={{ background: 'var(--arvo-surface)', border: '1px solid var(--arvo-border)' }}>
          <p style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 16, letterSpacing: '0.06em', color: 'var(--arvo-fg-soft)' }}>
            {t.dashboard.noOpenPositions}
          </p>
          <p className="text-sm mt-1" style={{ fontFamily: "'Playfair Display', serif", fontStyle: 'italic', color: 'var(--arvo-fg-soft)', opacity: 0.7 }}>
            {t.dashboard.addAssetsHint}
          </p>
        </div>
      )}

      {selectedAsset && (
        <FixedIncomeSetupModal
          asset={selectedAsset}
          onClose={() => setSelectedAsset(null)}
          onSaved={() => { setSelectedAsset(null); refresh() }}
        />
      )}
    </div>
  )
}
