import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { usePortfolioValue } from '../hooks/usePortfolio'
import { useCurrency } from '../contexts/CurrencyContext'
import { apiFetch } from '../lib/api'
import InstitutionSelect from '../components/InstitutionSelect'

export default function InstitutionPage() {
  const { data, loading, refresh } = usePortfolioValue()
  const { fmt } = useCurrency()
  const navigate = useNavigate()

  const [editingId,    setEditingId]    = useState<number | null>(null)
  const [editingValue, setEditingValue] = useState('')
  const [saving,       setSaving]       = useState(false)
  const [expanded,     setExpanded]     = useState<Set<string>>(new Set())

  async function handleSave(assetId: number) {
    setSaving(true)
    try {
      await apiFetch(`/assets/${assetId}`, {
        method: 'PATCH',
        body: JSON.stringify({ exchange: editingValue.trim() || null }),
      })
      setEditingId(null)
      refresh()
    } catch { /* keep editing open */ } finally {
      setSaving(false)
    }
  }

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
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-gray-900">Por Instituição</h1>
        <Link
          to="/institutions"
          className="text-xs text-gray-400 hover:text-[#001A70] transition-colors flex items-center gap-1"
        >
          Gerenciar instituições ›
        </Link>
      </div>

      {groups.length === 0 ? (
        <div className="bg-white border border-gray-100 rounded-2xl p-12 text-center text-gray-400 shadow-sm">
          Nenhum ativo encontrado.
        </div>
      ) : (
        groups.map(group => {
          const isOpen = expanded.has(group.name)
          function toggle() {
            setExpanded(prev => {
              const next = new Set(prev)
              next.has(group.name) ? next.delete(group.name) : next.add(group.name)
              return next
            })
          }
          return (
          <div key={group.name} className="bg-white border border-gray-100 rounded-2xl overflow-hidden shadow-sm">
            <button
              onClick={toggle}
              className="w-full px-5 py-4 flex items-center justify-between hover:bg-gray-50 transition-colors text-left"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <h2 className="font-semibold text-gray-800">{group.name}</h2>
                  <span className="text-gray-300 text-xs">{isOpen ? '▲' : '▼'}</span>
                </div>
                <p className="text-xs text-gray-400 mt-0.5">
                  {group.assets.length} ativo{group.assets.length !== 1 ? 's' : ''}
                  {' · '}
                  {data.total_brl > 0 ? ((group.total / data.total_brl) * 100).toFixed(1) : '0'}% da carteira
                </p>
              </div>
              <div className="flex items-center gap-3 shrink-0 ml-4">
                <p className="font-bold text-gray-900">{fmt(group.total)}</p>
                {group.name !== 'Sem instituição' && (
                  <Link
                    to="/institutions"
                    state={{ focus: group.name }}
                    onClick={e => e.stopPropagation()}
                    className="text-xs text-gray-400 hover:text-[#001A70] border border-gray-200 hover:border-[#001A70] rounded-lg px-2.5 py-1 transition-colors"
                  >Editar</Link>
                )}
              </div>
            </button>

            {isOpen && (
            <div className="border-t border-gray-100 divide-y divide-gray-50">
              {group.assets.map(asset => (
                <div key={asset.id} className="px-5 py-3 flex items-center gap-3">
                  {editingId === asset.id ? (
                    <>
                      <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: asset.class_color }} />
                      <span className="text-sm font-medium text-gray-800 shrink-0 w-16">{asset.code}</span>
                      <div className="flex-1">
                        <InstitutionSelect
                          value={editingValue}
                          onChange={setEditingValue}
                          placeholder="Nome da instituição..."
                          autoFocus
                        />
                      </div>
                      <button
                        onClick={() => handleSave(asset.id)}
                        disabled={saving}
                        className="text-xs text-[#001A70] font-semibold disabled:opacity-50 shrink-0"
                      >OK</button>
                      <button onClick={() => setEditingId(null)} className="text-xs text-gray-400 shrink-0">✕</button>
                    </>
                  ) : (
                    <>
                      <button
                        onClick={() => navigate(`/assets/${asset.id}`, { state: { total_brl: data.total_brl } })}
                        className="flex-1 flex items-center gap-3 text-left min-w-0"
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
                      <button
                        onClick={() => { setEditingId(asset.id); setEditingValue(asset.exchange ?? '') }}
                        className="text-xs text-gray-400 hover:text-[#001A70] border border-gray-200 hover:border-[#001A70] rounded-lg px-2.5 py-1 transition-colors shrink-0"
                      >Mover</button>
                    </>
                  )}
                </div>
              ))}
            </div>
            )}
          </div>
        )})
      )}
    </div>
  )
}
