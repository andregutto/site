import { useNavigate } from 'react-router-dom'
import { usePortfolioValue } from '../hooks/usePortfolio'
import { useCurrency } from '../contexts/CurrencyContext'

export default function InstitutionPage() {
  const { data, loading } = usePortfolioValue()
  const { fmt } = useCurrency()
  const navigate = useNavigate()

  if (loading) {
    return <div className="text-center text-gray-400 text-sm py-12 animate-pulse">Carregando...</div>
  }

  if (!data) return null

  type AssetItem = (typeof data.by_asset)[number]

  const groupMap = new Map<string, AssetItem[]>()
  for (const asset of data.by_asset) {
    const key = asset.exchange?.trim() || 'Sem instituição'
    if (!groupMap.has(key)) groupMap.set(key, [])
    groupMap.get(key)!.push(asset)
  }

  const groups = [...groupMap.entries()]
    .map(([name, assets]) => ({
      name,
      assets: [...assets].sort((a, b) => b.value_brl - a.value_brl),
      total:  assets.reduce((s, a) => s + a.value_brl, 0),
    }))
    .sort((a, b) => b.total - a.total)

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold text-gray-900">Por Instituição</h1>

      {groups.length === 0 ? (
        <div className="bg-white border border-gray-100 rounded-2xl p-12 text-center text-gray-400 shadow-sm">
          Nenhum ativo encontrado.
        </div>
      ) : (
        groups.map(group => (
          <div key={group.name} className="bg-white border border-gray-100 rounded-2xl overflow-hidden shadow-sm">
            <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
              <div>
                <h2 className="font-semibold text-gray-800">{group.name}</h2>
                <p className="text-xs text-gray-400 mt-0.5">
                  {group.assets.length} ativo{group.assets.length !== 1 ? 's' : ''}
                  {' · '}
                  {data.total_brl > 0 ? ((group.total / data.total_brl) * 100).toFixed(1) : '0'}% da carteira
                </p>
              </div>
              <p className="font-bold text-gray-900">{fmt(group.total)}</p>
            </div>

            <div className="divide-y divide-gray-50">
              {group.assets.map(asset => (
                <button
                  key={asset.id}
                  onClick={() => navigate(`/assets/${asset.id}`, { state: { total_brl: data.total_brl } })}
                  className="w-full px-5 py-3 flex items-center gap-3 hover:bg-gray-50 transition-colors text-left"
                >
                  <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: asset.class_color }} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-800">{asset.code}</p>
                    <p className="text-xs text-gray-400 truncate">{asset.name}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-sm font-semibold text-gray-900">{fmt(asset.value_brl)}</p>
                    <p className="text-xs text-gray-400">
                      {data.total_brl > 0 ? ((asset.value_brl / data.total_brl) * 100).toFixed(1) : '0'}%
                    </p>
                  </div>
                </button>
              ))}
            </div>
          </div>
        ))
      )}
    </div>
  )
}
