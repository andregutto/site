import { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { PageLoader } from '../components/ArvoLoader'
import { Button } from '../components/ui/Button'
import { usePortfolioValue } from '../hooks/usePortfolio'
import { useFavorites } from '../hooks/useFavorites'
import { useI18n } from '../contexts/I18nContext'
import AssetTable from '../components/AssetTable'
import ArchivedAssetsList from '../components/ArchivedAssetsList'
import FixedIncomeSetupModal from '../components/FixedIncomeSetupModal'
import DegradedTotalNote from '../components/DegradedTotalNote'
import type { PortfolioAsset } from '../lib/types'

type AssetView = 'all' | 'favorites' | 'archived'

export default function AssetsPage() {
  const { data, loading, error, refresh } = usePortfolioValue()
  const { favorites, toggleFavorite } = useFavorites()
  const { t } = useI18n()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const viewParam = searchParams.get('view')
  const view: AssetView = viewParam === 'favorites' || viewParam === 'archived' ? viewParam : 'all'
  const setView = (v: AssetView) => setSearchParams(v === 'all' ? {} : { view: v }, { replace: true })
  const [selectedAsset, setSelectedAsset] = useState<PortfolioAsset | null>(null)

  function handleAssetClick(asset: PortfolioAsset) {
    if (asset.needs_manual && asset.source === 'fixed_income') {
      setSelectedAsset(asset)
    } else {
      navigate(`/assets/${asset.id}`, { state: { total_brl: data?.total_brl ?? 0 } })
    }
  }

  if (error) {
    return (
      <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 12, padding: 24, color: '#b91c1c' }}>
        <p style={{ fontWeight: 600 }}>{t.dashboard.errorLoadingPortfolio}</p>
        <p style={{ fontSize: 14, marginTop: 4 }}>{error}</p>
        <button onClick={refresh} style={{ marginTop: 12, fontSize: 14, textDecoration: 'underline', background: 'none', border: 'none', cursor: 'pointer', color: '#b91c1c' }}>{t.dashboard.tryAgain}</button>
      </div>
    )
  }

  const allAssets = data?.by_asset ?? []
  const shownAssets = view === 'favorites' ? allAssets.filter(a => favorites.has(a.id)) : allAssets

  const tabs: { key: AssetView; label: string }[] = [
    { key: 'all',       label: t.nav.assets },
    { key: 'favorites', label: t.favorites.title },
    { key: 'archived',  label: t.archived.title },
  ]

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <h1 style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 18, letterSpacing: '0.06em', color: 'var(--arvo-fg)' }}>
            {t.nav.assets}
          </h1>
          <DegradedTotalNote degraded={data?.degraded} assets={data?.degraded_assets} />
        </div>
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => navigate('/portfolio/classes')}>
            {t.nav.classes} →
          </Button>
          <button
            onClick={refresh}
            style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 12, color: 'var(--arvo-fg-muted)', background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            {t.dashboard.refresh}
          </button>
        </div>
      </div>

      {/* Todos · Favoritos · Arquivados */}
      <div className="inline-flex items-center rounded-full p-0.5 gap-0.5" style={{ background: 'var(--arvo-chip-bg)' }}>
        {tabs.map(tab => (
          <button
            key={tab.key}
            onClick={() => setView(tab.key)}
            className="px-3.5 py-1.5 text-xs rounded-full transition-all"
            style={view === tab.key
              ? { fontFamily: 'var(--arvo-font-body)', background: 'var(--arvo-pill-active-bg)', color: 'var(--arvo-pill-active-fg)', letterSpacing: '0.04em' }
              : { fontFamily: 'var(--arvo-font-body)', color: 'var(--arvo-fg-soft)', letterSpacing: '0.04em' }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {view === 'archived' ? (
        <ArchivedAssetsList />
      ) : loading ? (
        <PageLoader />
      ) : shownAssets.length > 0 ? (
        <AssetTable
          assets={shownAssets}
          onAssetClick={handleAssetClick}
          favorites={favorites}
          onToggleFavorite={toggleFavorite}
        />
      ) : (
        <div className="rounded-2xl p-12 text-center" style={{ background: 'var(--arvo-surface)', border: '1px solid var(--arvo-border)' }}>
          <p style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 16, letterSpacing: '0.06em', color: 'var(--arvo-fg-soft)' }}>
            {view === 'favorites' ? t.favorites.empty : t.dashboard.noOpenPositions}
          </p>
          <p className="text-sm mt-1" style={{ fontFamily: "'Playfair Display', serif", fontStyle: 'italic', color: 'var(--arvo-fg-soft)', opacity: 0.7 }}>
            {view === 'favorites' ? t.favorites.emptyDescription : t.dashboard.addAssetsHint}
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
