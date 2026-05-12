import { useState, useEffect, useCallback } from 'react'
import { apiFetch } from '../lib/api'

interface AssetClass { id: number; name: string; color: string }

interface AssetRow {
  id: number
  code: string
  name: string
  asset_type: string
  currency: string
  asset_classes: { id: number; name: string; color: string } | null
}

const COLOR_PALETTE = [
  '#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6',
  '#EC4899', '#06B6D4', '#F97316', '#84CC16', '#6366F1',
  '#14B8A6', '#F43F5E', '#A855F7', '#0EA5E9', '#22C55E',
]

const TYPE_LABEL: Record<string, string> = {
  ticker:       'Ticker',
  fixed_income: 'Renda fixa',
  manual:       'Manual',
}

function ColorPicker({ value, onChange }: { value: string; onChange: (c: string) => void }) {
  return (
    <div className="flex flex-wrap gap-1.5 mt-1.5">
      {COLOR_PALETTE.map(c => (
        <button
          key={c}
          type="button"
          onClick={() => onChange(c)}
          className={`w-6 h-6 rounded-full transition-transform hover:scale-110 ${value === c ? 'ring-2 ring-offset-1 ring-gray-600 scale-110' : ''}`}
          style={{ backgroundColor: c }}
        />
      ))}
    </div>
  )
}

export default function ClassesPage() {
  const [classes,  setClasses]  = useState<AssetClass[]>([])
  const [assets,   setAssets]   = useState<AssetRow[]>([])
  const [loading,  setLoading]  = useState(true)

  // create form
  const [showCreate, setShowCreate] = useState(false)
  const [newName,    setNewName]    = useState('')
  const [newColor,   setNewColor]   = useState(COLOR_PALETTE[0])
  const [creating,   setCreating]   = useState(false)
  const [createErr,  setCreateErr]  = useState<string | null>(null)

  // edit state per class id
  const [editId,    setEditId]    = useState<number | null>(null)
  const [editName,  setEditName]  = useState('')
  const [editColor, setEditColor] = useState('')
  const [savingId,  setSavingId]  = useState<number | null>(null)
  const [editErr,   setEditErr]   = useState<string | null>(null)

  // moving asset: assetId → pending classId string
  const [movingId,    setMovingId]    = useState<number | null>(null)
  const [moveErr,     setMoveErr]     = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [cls, assetList] = await Promise.all([
        apiFetch<AssetClass[]>('/assets/classes'),
        apiFetch<AssetRow[]>('/assets'),
      ])
      setClasses(cls)
      setAssets(assetList)
    } catch {}
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  async function handleCreate() {
    if (!newName.trim()) { setCreateErr('Informe um nome.'); return }
    setCreating(true); setCreateErr(null)
    try {
      await apiFetch<AssetClass>('/assets/classes', {
        method: 'POST',
        body: JSON.stringify({ name: newName.trim(), color: newColor }),
      })
      setNewName(''); setNewColor(COLOR_PALETTE[0]); setShowCreate(false)
      await load()
    } catch (e) {
      setCreateErr(e instanceof Error ? e.message : 'Erro ao criar')
    } finally {
      setCreating(false)
    }
  }

  function startEdit(cls: AssetClass) {
    setEditId(cls.id); setEditName(cls.name); setEditColor(cls.color); setEditErr(null)
  }

  async function handleSaveEdit(id: number) {
    if (!editName.trim()) { setEditErr('Informe um nome.'); return }
    setSavingId(id); setEditErr(null)
    try {
      await apiFetch(`/assets/classes/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ name: editName.trim(), color: editColor }),
      })
      setEditId(null)
      await load()
    } catch (e) {
      setEditErr(e instanceof Error ? e.message : 'Erro ao salvar')
    } finally {
      setSavingId(null)
    }
  }

  async function handleDelete(id: number, name: string) {
    if (!confirm(`Excluir a classe "${name}"?`)) return
    try {
      await apiFetch(`/assets/classes/${id}`, { method: 'DELETE' })
      await load()
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Erro ao excluir')
    }
  }

  async function handleMoveAsset(assetId: number, classIdStr: string) {
    const classId = classIdStr === '' ? null : Number(classIdStr)
    setMovingId(assetId); setMoveErr(null)
    try {
      await apiFetch(`/assets/${assetId}`, {
        method: 'PATCH',
        body: JSON.stringify({ asset_class_id: classId }),
      })
      setAssets(prev => prev.map(a =>
        a.id === assetId
          ? { ...a, asset_classes: classId == null ? null : (classes.find(c => c.id === classId) ?? a.asset_classes) }
          : a
      ))
    } catch (e) {
      setMoveErr(e instanceof Error ? e.message : 'Erro ao mover ativo')
    } finally {
      setMovingId(null)
    }
  }

  // Group assets by class
  const grouped = classes.map(cls => ({
    cls,
    assets: assets.filter(a => a.asset_classes?.id === cls.id),
  }))
  const unclassed = assets.filter(a => a.asset_classes == null)

  if (loading) {
    return <div className="text-center text-gray-400 text-sm py-12 animate-pulse">Carregando...</div>
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-gray-900">Classes de Ativos</h1>
        <button
          onClick={() => { setShowCreate(v => !v); setCreateErr(null) }}
          className="px-4 py-2 bg-[#001A70] text-white text-sm font-semibold rounded-xl hover:bg-[#001A70]/90 transition-colors"
        >
          {showCreate ? 'Cancelar' : '+ Nova classe'}
        </button>
      </div>

      {/* Create form */}
      {showCreate && (
        <div className="bg-white border border-gray-100 rounded-2xl p-5 shadow-sm space-y-3">
          <h2 className="font-semibold text-gray-800 text-sm">Nova classe</h2>
          <div className="flex gap-3 items-start">
            <div
              className="w-8 h-8 rounded-full shrink-0 mt-1 border-2 border-white shadow"
              style={{ backgroundColor: newColor }}
            />
            <div className="flex-1 space-y-2">
              <input
                type="text"
                value={newName}
                onChange={e => setNewName(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleCreate() }}
                placeholder="Nome da classe"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#001A70]/20"
                autoFocus
              />
              <ColorPicker value={newColor} onChange={setNewColor} />
            </div>
          </div>
          {createErr && <p className="text-xs text-red-600">{createErr}</p>}
          <button
            onClick={handleCreate}
            disabled={creating}
            className="px-4 py-2 bg-[#001A70] text-white text-sm font-semibold rounded-xl hover:bg-[#001A70]/90 disabled:opacity-50 transition-colors"
          >{creating ? 'Criando...' : 'Criar'}</button>
        </div>
      )}

      {/* Classes list */}
      <div className="bg-white border border-gray-100 rounded-2xl shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100">
          <h2 className="font-semibold text-gray-800">Gerenciar classes</h2>
        </div>

        {classes.length === 0 ? (
          <p className="text-center text-gray-400 text-sm py-8">Nenhuma classe criada ainda.</p>
        ) : (
          <div className="divide-y divide-gray-50">
            {classes.map(cls => {
              const count = assets.filter(a => a.asset_classes?.id === cls.id).length
              const isEditing = editId === cls.id
              const isSaving  = savingId === cls.id

              return (
                <div key={cls.id} className="px-5 py-4">
                  {isEditing ? (
                    <div className="space-y-2">
                      <div className="flex gap-3 items-start">
                        <div
                          className="w-8 h-8 rounded-full shrink-0 mt-1 border-2 border-white shadow"
                          style={{ backgroundColor: editColor }}
                        />
                        <div className="flex-1 space-y-2">
                          <input
                            type="text"
                            value={editName}
                            onChange={e => setEditName(e.target.value)}
                            onKeyDown={e => { if (e.key === 'Enter') handleSaveEdit(cls.id) }}
                            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#001A70]/20"
                            autoFocus
                          />
                          <ColorPicker value={editColor} onChange={setEditColor} />
                        </div>
                      </div>
                      {editErr && <p className="text-xs text-red-600">{editErr}</p>}
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleSaveEdit(cls.id)}
                          disabled={isSaving}
                          className="px-3 py-1.5 bg-[#001A70] text-white text-xs font-semibold rounded-lg disabled:opacity-50"
                        >{isSaving ? 'Salvando...' : 'Salvar'}</button>
                        <button
                          onClick={() => setEditId(null)}
                          className="px-3 py-1.5 text-xs text-gray-500 hover:text-gray-700"
                        >Cancelar</button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center gap-3">
                      <span
                        className="w-4 h-4 rounded-full shrink-0"
                        style={{ backgroundColor: cls.color }}
                      />
                      <span className="font-medium text-gray-800 flex-1">{cls.name}</span>
                      <span className="text-xs text-gray-400 mr-2">
                        {count} {count === 1 ? 'ativo' : 'ativos'}
                      </span>
                      <button
                        onClick={() => startEdit(cls)}
                        className="text-xs text-[#001A70] hover:underline"
                      >Editar</button>
                      <button
                        onClick={() => handleDelete(cls.id, cls.name)}
                        className={`text-xs transition-colors ${
                          count > 0 ? 'text-gray-200 cursor-not-allowed' : 'text-gray-400 hover:text-red-500'
                        }`}
                        disabled={count > 0}
                        title={count > 0 ? 'Mova os ativos antes de excluir' : 'Excluir'}
                      >Excluir</button>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Assets by class */}
      <div className="bg-white border border-gray-100 rounded-2xl shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100">
          <h2 className="font-semibold text-gray-800">Ativos por classe</h2>
          <p className="text-xs text-gray-400 mt-0.5">Use o seletor para mover um ativo para outra classe.</p>
        </div>

        {moveErr && (
          <div className="mx-5 mt-3 text-xs text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
            {moveErr}
          </div>
        )}

        <div className="divide-y divide-gray-100">
          {/* Grouped by class */}
          {grouped.map(({ cls, assets: groupAssets }) => (
            <div key={cls.id}>
              <div className="px-5 py-2.5 bg-gray-50/60 flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: cls.color }} />
                <span className="text-xs font-semibold text-gray-600 uppercase tracking-wide">{cls.name}</span>
                <span className="text-xs text-gray-400">({groupAssets.length})</span>
              </div>
              {groupAssets.length === 0 ? (
                <p className="px-5 py-3 text-xs text-gray-400 italic">Nenhum ativo nesta classe.</p>
              ) : (
                groupAssets.map(asset => (
                  <AssetClassRow
                    key={asset.id}
                    asset={asset}
                    classes={classes}
                    moving={movingId === asset.id}
                    onMove={handleMoveAsset}
                  />
                ))
              )}
            </div>
          ))}

          {/* Unclassed */}
          {unclassed.length > 0 && (
            <div>
              <div className="px-5 py-2.5 bg-gray-50/60 flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-gray-300" />
                <span className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Sem classe</span>
                <span className="text-xs text-gray-400">({unclassed.length})</span>
              </div>
              {unclassed.map(asset => (
                <AssetClassRow
                  key={asset.id}
                  asset={asset}
                  classes={classes}
                  moving={movingId === asset.id}
                  onMove={handleMoveAsset}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function AssetClassRow({
  asset, classes, moving, onMove,
}: {
  asset: AssetRow
  classes: AssetClass[]
  moving: boolean
  onMove: (assetId: number, classId: string) => void
}) {
  return (
    <div className="px-5 py-3 flex items-center gap-3 border-t border-gray-50 hover:bg-gray-50/50 transition-colors">
      <div className="flex-1 min-w-0">
        <div className="font-medium text-gray-900 text-sm">{asset.code}</div>
        <div className="text-xs text-gray-400 truncate">{asset.name}</div>
      </div>
      <span className="text-xs text-gray-400 shrink-0 hidden sm:block">
        {TYPE_LABEL[asset.asset_type] ?? asset.asset_type}
      </span>
      <select
        value={asset.asset_classes?.id ?? ''}
        onChange={e => onMove(asset.id, e.target.value)}
        disabled={moving}
        className="border border-gray-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-[#001A70]/20 bg-white disabled:opacity-50 shrink-0"
      >
        <option value="">Sem classe</option>
        {classes.map(c => (
          <option key={c.id} value={c.id}>{c.name}</option>
        ))}
      </select>
    </div>
  )
}
