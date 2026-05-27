import { useNavigate } from 'react-router-dom'
import { usePortfolioValue } from '../hooks/usePortfolio'
import { useFavorites } from '../hooks/useFavorites'
import { useCurrency } from '../contexts/CurrencyContext'
import { PageLoader } from '../components/ArvoLoader'

function StarIcon({ filled }: { filled: boolean }) {
  return (
    <svg
      className={`w-4 h-4 transition-colors ${filled ? 'text-amber-400' : 'text-gray-300 hover:text-amber-300'}`}
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
  const navigate = useNavigate()

  const favoriteAssets = (data?.by_asset ?? []).filter(a => favorites.has(a.id))

  if (loading) {
    return (
      <PageLoader />
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-gray-900">Favoritos</h1>
        <p className="text-sm text-gray-400 mt-0.5">Ativos marcados com estrela</p>
      </div>

      {favoriteAssets.length === 0 ? (
        <div className="bg-white border border-gray-100 rounded-2xl p-12 text-center">
          <div className="text-4xl mb-3">★</div>
          <p className="text-gray-500 font-medium">Nenhum favorito ainda</p>
          <p className="text-sm text-gray-400 mt-1">
            Clique na estrela ao lado de um ativo no Dashboard para adicioná-lo aqui.
          </p>
        </div>
      ) : (
        <div className="bg-white border border-gray-100 rounded-2xl overflow-hidden">
          <div className="divide-y divide-gray-50">
            {favoriteAssets.map(asset => (
              <div
                key={asset.id}
                className="flex items-center gap-4 px-5 py-4 hover:bg-gray-50 transition-colors"
              >
                <button
                  onClick={() => toggleFavorite(asset.id)}
                  className="shrink-0"
                  title="Remover dos favoritos"
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
                  <div className="font-medium text-gray-900">{asset.code}</div>
                  <div className="text-xs text-gray-400 truncate">{asset.name}</div>
                </button>
                <div className="text-right shrink-0">
                  <div className="font-semibold text-gray-900">{fmt(asset.value_brl)}</div>
                  <div className="text-xs text-gray-400">{asset.class_name}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
