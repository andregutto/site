import { useState, useEffect, useCallback } from 'react'
import { apiFetch } from '../lib/api'
import { useI18n } from '../contexts/I18nContext'
import { PageLoader } from '../components/ArvoLoader'
import { Icon, type IconName } from '../components/icons'
import { CLASS_ICON_KEYS, resolveClassIcon } from '../lib/classIcons'

interface AssetClass { id: number; name: string; name_key?: string | null; color: string; icon: string | null }

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

function useTypeLabel() {
  const { t } = useI18n()
  return (type: string): string => {
    if (type === 'fixed_income') return t.classes.fixedIncomeType
    if (type === 'manual') return t.classes.manualType
    return type
  }
}

function ColorPicker({ value, onChange }: { value: string; onChange: (c: string) => void }) {
  return (
    <div className="flex flex-wrap gap-1.5 mt-1.5">
      {COLOR_PALETTE.map(c => (
        <button
          key={c}
          type="button"
          onClick={() => onChange(c)}
          className={`w-6 h-6 rounded-full transition-transform hover:scale-110 ${value === c ? 'ring-2 ring-offset-1 ring-[var(--arvo-fg-muted)] scale-110' : ''}`}
          style={{ backgroundColor: c }}
        />
      ))}
    </div>
  )
}

function IconPicker({ value, onChange, color }: { value: string | null; onChange: (i: string | null) => void; color: string }) {
  const { t } = useI18n()
  return (
    <div className="mt-2">
      <div className="flex flex-wrap gap-1.5">
        <button
          type="button"
          onClick={() => onChange(null)}
          title={t.classes.noIcon}
          className={`w-8 h-8 rounded-lg flex items-center justify-center text-xs border transition-all hover:scale-110 ${
            value == null ? 'border-[var(--arvo-fg)] bg-[var(--arvo-fg)]/10 ring-1 ring-[var(--arvo-fg)]' : 'border-[var(--arvo-border)] bg-[var(--arvo-surface-2)]'
          }`}
        >—</button>
        {CLASS_ICON_KEYS.map(key => (
          <button
            key={key}
            type="button"
            onClick={() => onChange(key)}
            title={key}
            className={`w-8 h-8 rounded-lg flex items-center justify-center border transition-all hover:scale-110 ${
              value === key ? 'ring-2 ring-[var(--arvo-fg)] bg-[var(--arvo-fg)]/10 border-[var(--arvo-fg)] scale-110' : 'border-[var(--arvo-border)] hover:bg-[var(--arvo-surface-2)]'
            }`}
            style={{ color: value === key ? color : 'var(--arvo-fg-soft)' }}
          >
            <Icon name={key} size={16} />
          </button>
        ))}
      </div>
    </div>
  )
}

function ClassIconBadge({ icon, color, size = 28 }: { icon: IconName | null; color: string; size?: number }) {
  return (
    <div
      className="rounded-full flex items-center justify-center shrink-0"
      style={{ width: size, height: size, background: `${color}1A`, color }}
    >
      {icon
        ? <Icon name={icon} size={Math.round(size * 0.55)} />
        : <span className="font-semibold leading-none" style={{ fontSize: size * 0.5 }}>◆</span>}
    </div>
  )
}

export default function ClassesPage() {
  const { t } = useI18n()
  const classNames = (t.classes.names as Record<string, string>) ?? {}
  const resolveClassName = (cls: AssetClass) => {
    if (cls.name_key && classNames[cls.name_key]) return classNames[cls.name_key]
    if (cls.name === 'Sem classe') return t.classes.noClass
    return cls.name
  }
  const [classes,  setClasses]  = useState<AssetClass[]>([])
  const [assets,   setAssets]   = useState<AssetRow[]>([])
  const [loading,  setLoading]  = useState(true)
  const [showAssetsByClass, setShowAssetsByClass] = useState(false)

  // create form
  const [showCreate, setShowCreate] = useState(false)
  const [newName,    setNewName]    = useState('')
  const [newColor,   setNewColor]   = useState(COLOR_PALETTE[0])
  const [newIcon,    setNewIcon]    = useState<string | null>(null)
  const [creating,   setCreating]   = useState(false)
  const [createErr,  setCreateErr]  = useState<string | null>(null)

  // edit state per class id
  const [editId,    setEditId]    = useState<number | null>(null)
  const [editName,  setEditName]  = useState('')
  const [editColor, setEditColor] = useState('')
  const [editIcon,  setEditIcon]  = useState<string | null>(null)
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
    if (!newName.trim()) { setCreateErr(t.classes.nameRequired); return }
    setCreating(true); setCreateErr(null)
    try {
      await apiFetch<AssetClass>('/assets/classes', {
        method: 'POST',
        body: JSON.stringify({ name: newName.trim(), color: newColor, icon: newIcon }),
      })
      setNewName(''); setNewColor(COLOR_PALETTE[0]); setNewIcon(null); setShowCreate(false)
      await load()
    } catch (e) {
      setCreateErr(e instanceof Error ? e.message : 'Erro ao criar')
    } finally {
      setCreating(false)
    }
  }

  function startEdit(cls: AssetClass) {
    setEditId(cls.id); setEditName(cls.name); setEditColor(cls.color); setEditIcon(cls.icon); setEditErr(null)
  }

  async function handleSaveEdit(id: number) {
    if (!editName.trim()) { setEditErr(t.classes.nameRequired); return }
    setSavingId(id); setEditErr(null)
    try {
      await apiFetch(`/assets/classes/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ name: editName.trim(), color: editColor, icon: editIcon }),
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
    return <PageLoader />
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-[var(--arvo-fg)]">{t.classes.title}</h1>
        <button
          onClick={() => { setShowCreate(v => !v); setCreateErr(null) }}
          className="px-4 py-2 bg-[var(--arvo-fg)] text-[var(--arvo-pill-active-fg)] text-sm font-semibold rounded-xl hover:bg-[var(--arvo-fg)]/90 transition-colors"
        >
          {showCreate ? t.classes.cancel : t.classes.newClass}
        </button>
      </div>

      {/* Create form */}
      {showCreate && (
        <div className="bg-[var(--arvo-surface)] border border-[var(--arvo-border)] rounded-2xl p-5 shadow-sm space-y-3">
          <h2 className="font-semibold text-[var(--arvo-fg)] text-sm">{t.classes.newClassTitle}</h2>
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
                placeholder={t.classes.classNamePlaceholder}
                className="w-full border border-[var(--arvo-border)] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--arvo-fg)]/20"
                autoFocus
              />
              <ColorPicker value={newColor} onChange={setNewColor} />
              <div>
                <p className="text-xs text-[var(--arvo-fg-muted)] mb-1">{t.classes.icon}</p>
                <IconPicker value={newIcon} onChange={setNewIcon} color={newColor} />
              </div>
            </div>
          </div>
          {createErr && <p className="text-xs text-red-600">{createErr}</p>}
          <button
            onClick={handleCreate}
            disabled={creating}
            className="px-4 py-2 bg-[var(--arvo-fg)] text-[var(--arvo-pill-active-fg)] text-sm font-semibold rounded-xl hover:bg-[var(--arvo-fg)]/90 disabled:opacity-50 transition-colors"
          >{creating ? t.classes.creating : t.classes.create}</button>
        </div>
      )}

      {/* Classes list */}
      <div className="bg-[var(--arvo-surface)] border border-[var(--arvo-border)] rounded-2xl shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-[var(--arvo-border)]">
          <h2 className="font-semibold text-[var(--arvo-fg)]">{t.classes.manage}</h2>
        </div>

        {classes.length === 0 ? (
          <p className="text-center text-[var(--arvo-fg-soft)] text-sm py-8">{t.classes.empty}</p>
        ) : (
          <div className="divide-y divide-[var(--arvo-border-soft)]">
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
                            className="w-full border border-[var(--arvo-border)] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--arvo-fg)]/20"
                            autoFocus
                          />
                          <ColorPicker value={editColor} onChange={setEditColor} />
                          <div>
                            <p className="text-xs text-[var(--arvo-fg-muted)] mb-1">{t.classes.icon}</p>
                            <IconPicker value={editIcon} onChange={setEditIcon} color={editColor} />
                          </div>
                        </div>
                      </div>
                      {editErr && <p className="text-xs text-red-600">{editErr}</p>}
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleSaveEdit(cls.id)}
                          disabled={isSaving}
                          className="px-3 py-1.5 bg-[var(--arvo-fg)] text-[var(--arvo-pill-active-fg)] text-xs font-semibold rounded-lg disabled:opacity-50"
                        >{isSaving ? t.classes.saving : t.classes.save}</button>
                        <button
                          onClick={() => setEditId(null)}
                          className="px-3 py-1.5 text-xs text-[var(--arvo-fg-muted)] hover:text-[var(--arvo-fg)]"
                        >{t.classes.cancel}</button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center gap-3">
                      <ClassIconBadge icon={resolveClassIcon(cls.icon, cls.name)} color={cls.color} />
                      <span className="font-medium text-[var(--arvo-fg)] flex-1">{resolveClassName(cls)}</span>
                      <span className="text-xs text-[var(--arvo-fg-soft)] mr-2">
                        {count} {count === 1 ? t.classes.assetSingular : t.classes.assetPlural}
                      </span>
                      <button
                        onClick={() => startEdit(cls)}
                        className="text-xs text-[var(--arvo-fg)] hover:underline"
                      >{t.classes.edit}</button>
                      <button
                        onClick={() => handleDelete(cls.id, cls.name)}
                        className={`text-xs transition-colors ${
                          count > 0 ? 'text-[var(--arvo-fg-faint)] cursor-not-allowed' : 'text-[var(--arvo-fg-soft)] hover:text-red-500'
                        }`}
                        disabled={count > 0}
                        title={count > 0 ? t.classes.cannotDelete : t.classes.delete}
                      >{t.classes.delete}</button>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Assets by class */}
      <div className="bg-[var(--arvo-surface)] border border-[var(--arvo-border)] rounded-2xl shadow-sm overflow-hidden">
        <button
          onClick={() => setShowAssetsByClass(v => !v)}
          className="w-full px-5 py-4 border-b border-[var(--arvo-border)] text-left flex items-center justify-between hover:bg-[var(--arvo-surface-2)]/60 transition-colors"
        >
          <div>
            <h2 className="font-semibold text-[var(--arvo-fg)]">{t.classes.assetsByClass}</h2>
            <p className="text-xs text-[var(--arvo-fg-soft)] mt-0.5">{t.classes.assetsByClassHint}</p>
          </div>
          <svg
            className={`w-4 h-4 text-[var(--arvo-fg-soft)] transition-transform ${showAssetsByClass ? 'rotate-180' : ''}`}
            fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </button>

        {showAssetsByClass && <>
        {moveErr && (
          <div className="mx-5 mt-3 text-xs text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
            {moveErr}
          </div>
        )}

        <div className="divide-y divide-[var(--arvo-border)]">
          {/* Grouped by class */}
          {grouped.map(({ cls, assets: groupAssets }) => (
            <div key={cls.id}>
              <div className="px-5 py-2.5 bg-[var(--arvo-surface-2)]/60 flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: cls.color }} />
                <span className="text-xs font-semibold text-[var(--arvo-fg-muted)] uppercase tracking-wide">{resolveClassName(cls)}</span>
                <span className="text-xs text-[var(--arvo-fg-soft)]">({groupAssets.length})</span>
              </div>
              {groupAssets.length === 0 ? (
                <p className="px-5 py-3 text-xs text-[var(--arvo-fg-soft)] italic">{t.classes.noAssetsInClass}</p>
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
              <div className="px-5 py-2.5 bg-[var(--arvo-surface-2)]/60 flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-[var(--arvo-track-bg)]" />
                <span className="text-xs font-semibold text-[var(--arvo-fg-muted)] uppercase tracking-wide">{t.classes.noClass}</span>
                <span className="text-xs text-[var(--arvo-fg-soft)]">({unclassed.length})</span>
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
        </>}
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
  const { t } = useI18n()
  const typeLabel = useTypeLabel()
  return (
    <div className="px-5 py-3 flex items-center gap-3 border-t border-[var(--arvo-border-soft)] hover:bg-[var(--arvo-surface-2)]/50 transition-colors">
      <div className="flex-1 min-w-0">
        <div className="font-medium text-[var(--arvo-fg)] text-sm">{asset.code}</div>
        <div className="text-xs text-[var(--arvo-fg-soft)] truncate">{asset.name}</div>
      </div>
      <span className="text-xs text-[var(--arvo-fg-soft)] shrink-0 hidden sm:block">
        {typeLabel(asset.asset_type)}
      </span>
      <select
        value={asset.asset_classes?.id ?? ''}
        onChange={e => onMove(asset.id, e.target.value)}
        disabled={moving}
        className="border border-[var(--arvo-border)] rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-[var(--arvo-fg)]/20 bg-[var(--arvo-surface)] disabled:opacity-50 shrink-0"
      >
        <option value="">{t.classes.noClass}</option>
        {classes.map(c => (
          <option key={c.id} value={c.id}>{c.name}</option>
        ))}
      </select>
    </div>
  )
}
