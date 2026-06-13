import { useNavigate } from 'react-router-dom'
import { usePortfolioValue } from '../hooks/usePortfolio'
import { useFavorites } from '../hooks/useFavorites'
import { useCurrency } from '../contexts/CurrencyContext'
import { PageLoader } from '../components/ArvoLoader'
import { useI18n } from '../contexts/I18nContext'
import { PageTitle, EmptyState } from '../components/ui'

function StarIcon({ filled }: { filled: boolean }) {
  return (
    <svg
      className={`w-4 h-4 transition-colors ${filled ? 'text-amber-400' : 'text-[var(--arvo-fg-faint)] hover:text-amber-300'}`}
      fill={filled ? 'currentColor' : 'none'}
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={filled ? 0 : 1.5}
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M11.48 3.499a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.61l-4.725-2.885a.563.563 0 00-.586 0L6.982 20.54a.562.562 0 01-.84-.61l1.285-5.386a.562.562 0 00-.182-.557l-4.204-3.602a.562.562 0 01.321-.988l5.518-.442a.563.563 0 00.475-.345L11.48 3.5z" />
    </svg>
  )
}

export default function FavoritesPage() {
  const { data, loading } = usePortfolioValue()
  const { favorites, toggleFavorite } = useFavorites()
  const { fmt } = useCurrency()
  const { t } = useI18n()
  const navigate = useNavigate()

  const favoriteAssets = (data?.by_asset ?? []).filter(a => favorites.has(a.id))

  if (loading) {
    return (
      <PageLoader />
    )
  }

  return (
    <div className="space-y-6">
      <PageTitle eyebrow={t.dashboard.eyebrow} title={t.favorites.title} />

      {favoriteAssets.length === 0 ? (
        <EmptyState
          title={t.favorites.empty}
          description={t.favorites.emptyDescription}
          className="bg-[var(--arvo-surface)] border border-[var(--arvo-border)] rounded-2xl"
        />
      ) : (
        <div className="bg-[var(--arvo-surface)] border border-[var(--arvo-border)] rounded-2xl overflow-hidden">
          <div className="divide-y divide-[var(--arvo-border-soft)]">
            {favoriteAssets.map(asset => (
              <div
                key={asset.id}
                className="flex items-center gap-4 px-5 py-4 hover:bg-[var(--arvo-surface-2)] transition-colors"
              >
                <button
                  onClick={() => toggleFavorite(asset.id)}
                  className="shrink-0"
                  title={t.common.removeFromFavorites}
                >
                  <StarIcon filled />
                </button>
                <span
                  className="w-3 h-3 rounded-full shrink-0"
                  style={{ backgroundColor: asset.class_color }}
                />
                <button
                  onClick={() => navigate(`/assets/${asset.id}`)}
                  className="flex-1 min-w-0 text-left"
                >
                  <div className="font-medium text-[var(--arvo-fg)]">{asset.code}</div>
                  <div className="text-xs text-[var(--arvo-fg-soft)] truncate">{asset.name}</div>
                </button>
                <div className="text-right shrink-0">
                  <div className="font-semibold text-[var(--arvo-fg)]">{fmt(asset.value_brl)}</div>
                  <div className="text-xs text-[var(--arvo-fg-soft)]">{asset.class_name}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
