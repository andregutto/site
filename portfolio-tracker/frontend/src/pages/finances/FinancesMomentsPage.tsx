import { useState, useEffect, useCallback, useRef } from 'react'
import { apiFetch } from '../../lib/api'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { useI18n } from '../../contexts/I18nContext'

interface Moment {
  id: number
  name: string
  description: string | null
  icon: string
  color: string
  start_date: string | null
  end_date: string | null
  cover_image_url: string | null
  share_token: string | null
  share_expires_at: string | null
  share_hide_descriptions: boolean
  created_at: string
}

interface ShareInfo {
  share_token: string
  share_expires_at: string | null
  share_hide_descriptions: boolean
}

interface MomentDetail {
  moment: Moment
  transactions: { id: number; date: string; description: string; amount: number; currency: string; finance_categories: { name: string; icon: string; color: string } | null }[]
  summary: { total: number; by_category: { name: string; icon: string; color: string; total: number }[] }
}

interface MomentPickerRow {
  id: number; name: string; icon: string; color: string
}

const ICONS = ['✨', '✈️', '🎉', '🎂', '🏖️', '🏔️', '🎭', '🎵', '🍽️', '🏠', '💒', '🎓', '🛒', '⚽', '🎮', '🚗', '💊', '🎁']
const COLORS = ['#7C3AED', '#2563EB', '#16A34A', '#DC2626', '#D97706', '#0891B2', '#DB2777', '#65A30D', '#9333EA', '#EA580C']

function fmt(n: number, currency: string) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency, minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(n)
}

function fmtDate(d: string) {
  return new Date(d + 'T00:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })
}

// ── Form ──────────────────────────────────────────────────────────────────────

type MomentFormData = Omit<Moment, 'id' | 'created_at' | 'share_token' | 'share_expires_at' | 'share_hide_descriptions'>

interface FormProps {
  initial?: Partial<Moment>
  onSave: (data: MomentFormData) => Promise<void>
  onCancel: () => void
  saving: boolean
  userId: string
}

function MomentForm({ initial, onSave, onCancel, saving, userId }: FormProps) {
  const { t } = useI18n()
  const [name,         setName]         = useState(initial?.name ?? '')
  const [description,  setDescription]  = useState(initial?.description ?? '')
  const [icon,         setIcon]         = useState(initial?.icon ?? '✨')
  const [color,        setColor]        = useState(initial?.color ?? '#7C3AED')
  const [startDate,    setStartDate]    = useState(initial?.start_date ?? '')
  const [endDate,      setEndDate]      = useState(initial?.end_date ?? '')
  const [photoPreview, setPhotoPreview] = useState<string | null>(initial?.cover_image_url ?? null)
  const [photoFile,    setPhotoFile]    = useState<File | null>(null)
  const [uploading,    setUploading]    = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setPhotoFile(file)
    setPhotoPreview(URL.createObjectURL(file))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    let coverImageUrl = initial?.cover_image_url ?? null

    if (photoFile) {
      setUploading(true)
      try {
        const ext = photoFile.name.split('.').pop() ?? 'jpg'
        const path = `${userId}/${Date.now()}.${ext}`
        const { error } = await supabase.storage.from('moment-photos').upload(path, photoFile, { upsert: true })
        if (!error) {
          const { data } = supabase.storage.from('moment-photos').getPublicUrl(path)
          coverImageUrl = data.publicUrl
        }
      } finally {
        setUploading(false)
      }
    }

    await onSave({
      name, description: description || null, icon, color,
      start_date: startDate || null, end_date: endDate || null,
      cover_image_url: coverImageUrl,
    })
  }

  const fieldCls = 'w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#001A70]/20'
  const labelCls = 'block text-xs text-gray-500 mb-1'

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2">
          <label className={labelCls}>{t.common.name}</label>
          <input required value={name} onChange={e => setName(e.target.value)} className={fieldCls} placeholder="Viagem Paris, Aniversário João…" />
        </div>

        <div className="col-span-2">
          <label className={labelCls}>{t.common.description} (opcional)</label>
          <input value={description} onChange={e => setDescription(e.target.value)} className={fieldCls} />
        </div>

        {/* Photo */}
        <div className="col-span-2">
          <label className={labelCls}>Foto (opcional)</label>
          <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={onFileChange} />
          {photoPreview ? (
            <div className="relative group w-full h-32 rounded-xl overflow-hidden">
              <img src={photoPreview} alt="Capa" className="w-full h-full object-cover" />
              <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors flex items-center justify-center gap-2 opacity-0 group-hover:opacity-100">
                <button type="button" onClick={() => fileInputRef.current?.click()}
                  className="text-xs text-white bg-black/50 rounded-lg px-3 py-1.5">Trocar</button>
                <button type="button" onClick={() => { setPhotoPreview(null); setPhotoFile(null) }}
                  className="text-xs text-white bg-red-500/70 rounded-lg px-3 py-1.5">Remover</button>
              </div>
            </div>
          ) : (
            <button type="button" onClick={() => fileInputRef.current?.click()}
              className="w-full h-20 border-2 border-dashed border-gray-200 rounded-xl flex flex-col items-center justify-center gap-1 text-gray-400 hover:border-[#001A70]/40 hover:text-[#001A70] transition-colors">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909M13.5 12a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0z" />
              </svg>
              <span className="text-xs">Adicionar foto</span>
            </button>
          )}
        </div>

        <div className="col-span-2">
          <label className={labelCls}>{t.finances.momentIcon}</label>
          <div className="flex flex-wrap gap-1.5">
            {ICONS.map(ic => (
              <button
                key={ic} type="button"
                onClick={() => setIcon(ic)}
                className={`text-lg w-9 h-9 rounded-lg flex items-center justify-center border-2 transition-colors ${icon === ic ? 'border-[#001A70] bg-[#001A70]/10' : 'border-transparent bg-gray-100'}`}
              >{ic}</button>
            ))}
          </div>
        </div>

        <div className="col-span-2">
          <label className={labelCls}>{t.finances.momentColor}</label>
          <div className="flex gap-2">
            {COLORS.map(c => (
              <button
                key={c} type="button"
                onClick={() => setColor(c)}
                style={{ backgroundColor: c }}
                className={`w-7 h-7 rounded-full border-2 transition-all ${color === c ? 'border-gray-900 scale-110' : 'border-transparent'}`}
              />
            ))}
          </div>
        </div>

        <div>
          <label className={labelCls}>Início (opcional)</label>
          <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className={fieldCls} />
        </div>
        <div>
          <label className={labelCls}>Fim (opcional)</label>
          <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className={fieldCls} />
        </div>
      </div>

      <div className="flex gap-2">
        <button type="submit" disabled={saving || uploading}
          className="flex-1 bg-[#001A70] text-white text-sm py-2 rounded-xl hover:opacity-80 transition-opacity disabled:opacity-40">
          {uploading ? t.finances.uploadingPhoto : saving ? '…' : t.common.save}
        </button>
        <button type="button" onClick={onCancel} className="px-4 text-sm text-gray-500 hover:text-gray-700 transition-colors">
          {t.common.cancel}
        </button>
      </div>
    </form>
  )
}

// ── Share modal ───────────────────────────────────────────────────────────────

const EXPIRY_VALUES = [7, 30, 90, null] as const

interface ShareModalProps {
  moment: Moment
  onClose: () => void
  onRevoke: () => void
  onUpdate: (info: ShareInfo) => void
}

function ShareModal({ moment, onClose, onRevoke, onUpdate }: ShareModalProps) {
  const { t } = useI18n()
  const baseUrl = window.location.origin
  const EXPIRY_OPTIONS = [
    { label: t.finances.shareExpiry7,    value: 7    },
    { label: t.finances.shareExpiry30,   value: 30   },
    { label: t.finances.shareExpiry90,   value: 90   },
    { label: t.finances.shareExpiryNone, value: null },
  ] as const
  const [info,       setInfo]       = useState<ShareInfo | null>(
    moment.share_token ? { share_token: moment.share_token, share_expires_at: moment.share_expires_at, share_hide_descriptions: moment.share_hide_descriptions } : null
  )
  const [loading,    setLoading]    = useState(!moment.share_token)
  const [copied,     setCopied]     = useState(false)
  const [revoking,   setRevoking]   = useState(false)

  const shareUrl = info ? `${baseUrl}/share/momento/${info.share_token}` : ''

  useEffect(() => {
    if (info) return
    // auto-generate on open
    apiFetch<ShareInfo>(`/finances/moments/${moment.id}/share`, {
      method: 'POST',
      body: JSON.stringify({ hide_descriptions: false, expires_in_days: 30 }),
    }).then(d => {
      setInfo(d)
      setLoading(false)
      copyToClipboard(`${baseUrl}/share/momento/${d.share_token}`)
      onUpdate(d)
    })
  }, [])

  function copyToClipboard(url: string) {
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2500)
    })
  }

  async function updateSetting(patch: Partial<{ hide_descriptions: boolean; expires_in_days: number | null }>) {
    if (!info) return
    const updated = await apiFetch<ShareInfo>(`/finances/moments/${moment.id}/share`, {
      method: 'PATCH',
      body: JSON.stringify(patch),
    })
    setInfo(updated)
    onUpdate(updated)
  }

  async function revoke() {
    if (!confirm(t.finances.shareRevokeConfirm)) return
    setRevoking(true)
    await apiFetch(`/finances/moments/${moment.id}/share`, { method: 'DELETE' })
    onRevoke()
    onClose()
  }

  const currentExpiry = info?.share_expires_at
    ? Math.round((new Date(info.share_expires_at).getTime() - Date.now()) / 86_400_000)
    : null

  const selectedDays = EXPIRY_OPTIONS.find(o => {
    if (o.value === null && currentExpiry === null) return true
    if (o.value !== null && currentExpiry !== null && Math.abs(o.value - currentExpiry) <= 3) return true
    return false
  })?.value ?? 30

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={onClose}>
      <div className="bg-white w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl shadow-xl p-6 space-y-5" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-gray-900">{t.finances.shareTitle} {moment.icon} {moment.name}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>

        {loading ? (
          <div className="text-center py-4 text-sm text-gray-400 animate-pulse">{t.finances.shareGenerating}</div>
        ) : (
          <>
            {/* Link */}
            <div>
              <p className="text-xs text-gray-500 mb-1.5">{t.finances.shareLink}</p>
              <div className="flex items-center gap-2">
                <input readOnly value={shareUrl} className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-xs text-gray-600 bg-gray-50 truncate focus:outline-none" />
                <button
                  onClick={() => copyToClipboard(shareUrl)}
                  className={`px-3 py-2 rounded-lg text-xs font-medium transition-colors shrink-0 ${copied ? 'bg-emerald-100 text-emerald-700' : 'bg-[#001A70] text-white hover:opacity-80'}`}
                >
                  {copied ? t.finances.shareCopied : t.finances.shareCopy}
                </button>
              </div>
            </div>

            {/* Hide descriptions */}
            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={info?.share_hide_descriptions ?? false}
                onChange={e => updateSetting({ hide_descriptions: e.target.checked })}
                className="mt-0.5 w-4 h-4 accent-[#001A70]"
              />
              <div>
                <p className="text-sm text-gray-700 font-medium">{t.finances.shareHideDesc}</p>
                <p className="text-xs text-gray-400 mt-0.5">{t.finances.shareHideDescSub}</p>
              </div>
            </label>

            {/* Expiry */}
            <div>
              <p className="text-xs text-gray-500 mb-2">{t.finances.shareExpiry}</p>
              <div className="flex flex-wrap gap-2">
                {EXPIRY_OPTIONS.map(opt => (
                  <button
                    key={String(opt.value)}
                    onClick={() => updateSetting({ expires_in_days: opt.value })}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                      selectedDays === opt.value
                        ? 'bg-[#001A70] text-white border-[#001A70]'
                        : 'border-gray-200 text-gray-600 hover:border-gray-300'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Revoke */}
            <div className="pt-2 border-t border-gray-100">
              <button
                onClick={revoke}
                disabled={revoking}
                className="text-xs text-red-500 hover:text-red-700 transition-colors disabled:opacity-50"
              >
                🔴 {t.finances.shareRevoke}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

// ── Assign to moment modal ────────────────────────────────────────────────────

interface AssignModalProps {
  momentId: number
  moments: MomentPickerRow[]
  transactionId: number
  currentMomentId: number | null
  onDone: () => void
  onClose: () => void
}

function AssignModal({ momentId: _momentId, moments, transactionId, currentMomentId, onDone, onClose }: AssignModalProps) {
  const { t } = useI18n()
  const [saving, setSaving] = useState(false)

  async function assign(mid: number | null) {
    setSaving(true)
    try {
      await apiFetch(`/finances/transactions/${transactionId}`, { method: 'PATCH', body: JSON.stringify({ moment_id: mid }) })
      onDone()
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-xs p-5" onClick={e => e.stopPropagation()}>
        <h3 className="font-semibold text-gray-900 mb-3 text-sm">{t.finances.assignMoment}</h3>
        <div className="space-y-1">
          {moments.map(m => (
            <button key={m.id} disabled={saving}
              onClick={() => assign(m.id === currentMomentId ? null : m.id)}
              className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors ${m.id === currentMomentId ? 'bg-[#001A70]/10 text-[#001A70]' : 'hover:bg-gray-50 text-gray-700'}`}>
              <span className="text-base">{m.icon}</span>
              <span>{m.name}</span>
              {m.id === currentMomentId && <span className="ml-auto text-xs">✓</span>}
            </button>
          ))}
          {currentMomentId && (
            <button disabled={saving} onClick={() => assign(null)}
              className="w-full text-left px-3 py-2 rounded-lg text-sm text-gray-400 hover:bg-gray-50 transition-colors">
              {t.finances.noMoment}
            </button>
          )}
        </div>
        <button onClick={onClose} className="mt-3 w-full text-center text-xs text-gray-400 hover:text-gray-600 transition-colors">
          {t.common.cancel}
        </button>
      </div>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function FinancesMomentsPage() {
  const { t } = useI18n()
  const { user } = useAuth()
  const [moments,     setMoments]     = useState<Moment[]>([])
  const [loading,     setLoading]     = useState(true)
  const [showForm,    setShowForm]    = useState(false)
  const [editing,     setEditing]     = useState<Moment | null>(null)
  const [saving,      setSaving]      = useState(false)
  const [expanded,    setExpanded]    = useState<number | null>(null)
  const [detail,      setDetail]      = useState<MomentDetail | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [pickerMoments, setPickerMoments] = useState<MomentPickerRow[]>([])
  const [assignTarget,  setAssignTarget]  = useState<{ txId: number; currentMomentId: number | null } | null>(null)
  const [sharingMoment, setSharingMoment] = useState<Moment | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [data, picker] = await Promise.all([
        apiFetch<Moment[]>('/finances/moments'),
        apiFetch<MomentPickerRow[]>('/finances/moments-for-picker'),
      ])
      setMoments(data)
      setPickerMoments(picker)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  async function loadDetail(id: number) {
    setDetailLoading(true)
    try {
      const d = await apiFetch<MomentDetail>(`/finances/moments/${id}`)
      setDetail(d)
    } finally {
      setDetailLoading(false)
    }
  }

  function toggleExpand(id: number) {
    if (expanded === id) {
      setExpanded(null)
      setDetail(null)
    } else {
      setExpanded(id)
      setDetail(null)
      loadDetail(id)
    }
  }

  async function saveMoment(data: MomentFormData) {
    setSaving(true)
    try {
      if (editing) {
        await apiFetch(`/finances/moments/${editing.id}`, { method: 'PATCH', body: JSON.stringify(data) })
      } else {
        await apiFetch('/finances/moments', { method: 'POST', body: JSON.stringify(data) })
      }
      setShowForm(false)
      setEditing(null)
      await load()
    } finally {
      setSaving(false)
    }
  }

  async function deleteMoment(id: number) {
    if (!confirm(t.finances.momentConfirmDelete)) return
    await apiFetch(`/finances/moments/${id}`, { method: 'DELETE' })
    if (expanded === id) { setExpanded(null); setDetail(null) }
    await load()
  }

  if (loading) {
    return (
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-12 text-center text-gray-400 text-sm">
        {t.common.loading}
      </div>
    )
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">{t.finances.momentsTitle}</h1>
          <p className="text-sm text-gray-400 mt-0.5">{t.finances.momentsSubtitle}</p>
        </div>
        <button
          onClick={() => { setEditing(null); setShowForm(true) }}
          className="px-3 py-1.5 bg-[#001A70] text-white text-sm rounded-lg hover:opacity-80 transition-opacity"
        >
          + {t.finances.newMoment}
        </button>
      </div>

      {/* Create/edit form */}
      {showForm && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
          <h3 className="font-semibold text-gray-900 mb-4 text-sm">
            {editing ? t.finances.editMoment : t.finances.newMoment}
          </h3>
          <MomentForm
            initial={editing ?? undefined}
            onSave={saveMoment}
            onCancel={() => { setShowForm(false); setEditing(null) }}
            saving={saving}
            userId={user?.id ?? ''}
          />
        </div>
      )}

      {/* Empty state */}
      {moments.length === 0 && !showForm && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-12 text-center">
          <p className="text-4xl mb-4">✨</p>
          <p className="text-gray-700 font-medium mb-1">{t.finances.momentEmptyTitle}</p>
          <p className="text-sm text-gray-400 mb-5">{t.finances.momentEmptyBody}</p>
          <button
            onClick={() => setShowForm(true)}
            className="px-5 py-2 bg-[#001A70] text-white text-sm rounded-xl hover:opacity-80 transition-opacity"
          >
            {t.finances.momentCreateFirst}
          </button>
        </div>
      )}

      {/* Moments list */}
      <div className="space-y-3">
        {moments.map(m => (
          <div key={m.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            {/* Cover photo or color gradient */}
            {m.cover_image_url ? (
              <div className="h-28 overflow-hidden">
                <img src={m.cover_image_url} alt={m.name} className="w-full h-full object-cover" />
              </div>
            ) : (
              <div className="h-16 flex items-center justify-center text-3xl" style={{ background: `linear-gradient(135deg, ${m.color}30 0%, ${m.color}60 100%)` }}>
                {m.icon}
              </div>
            )}
            {/* Moment header */}
            <div
              className="flex items-center gap-3 px-5 py-4 cursor-pointer hover:bg-gray-50 transition-colors"
              onClick={() => toggleExpand(m.id)}
            >
              <div className="w-10 h-10 rounded-xl flex items-center justify-center text-xl shrink-0" style={{ backgroundColor: m.color + '20' }}>
                {m.icon}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-gray-900 text-sm truncate">{m.name}</p>
                {(m.start_date || m.description) && (
                  <p className="text-xs text-gray-400 mt-0.5 truncate">
                    {m.start_date && m.end_date
                      ? `${fmtDate(m.start_date)} – ${fmtDate(m.end_date)}`
                      : m.start_date
                      ? `a partir de ${fmtDate(m.start_date)}`
                      : m.description}
                  </p>
                )}
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  onClick={e => { e.stopPropagation(); setSharingMoment(m) }}
                  className={`p-1.5 transition-colors rounded-lg hover:bg-gray-100 ${m.share_token ? 'text-[#001A70]' : 'text-gray-400 hover:text-gray-700'}`}
                  title="Compartilhar"
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
                  </svg>
                </button>
                <button
                  onClick={e => { e.stopPropagation(); setEditing(m); setShowForm(true) }}
                  className="p-1.5 text-gray-400 hover:text-gray-700 transition-colors rounded-lg hover:bg-gray-100"
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                  </svg>
                </button>
                <button
                  onClick={e => { e.stopPropagation(); deleteMoment(m.id) }}
                  className="p-1.5 text-gray-400 hover:text-red-500 transition-colors rounded-lg hover:bg-red-50"
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </button>
                <svg className={`w-4 h-4 text-gray-400 transition-transform ${expanded === m.id ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                </svg>
              </div>
            </div>

            {/* Expanded detail */}
            {expanded === m.id && (
              <div className="border-t border-gray-100 px-5 py-4 space-y-4">
                {detailLoading && <p className="text-center text-sm text-gray-400">{t.common.loading}</p>}
                {detail && detail.moment.id === m.id && (
                  <>
                    {/* Summary */}
                    <div className="flex items-center gap-4 flex-wrap">
                      <div>
                        <p className="text-xs text-gray-400">{t.finances.momentTotal}</p>
                        <p className="text-xl font-bold text-gray-900">
                          {fmt(detail.summary.total, detail.transactions[0]?.currency ?? 'EUR')}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-400">{t.finances.momentTransactions}</p>
                        <p className="text-xl font-bold text-gray-700">{detail.transactions.filter(tx => tx.amount < 0).length}</p>
                      </div>
                    </div>

                    {/* Category breakdown */}
                    {detail.summary.by_category.length > 0 && (
                      <div className="space-y-1.5">
                        {detail.summary.by_category.map(cat => {
                          const pct = detail.summary.total > 0 ? (cat.total / detail.summary.total) * 100 : 0
                          return (
                            <div key={cat.name} className="flex items-center gap-2">
                              <span className="text-sm w-5 text-center">{cat.icon}</span>
                              <span className="text-xs text-gray-600 w-28 truncate">{cat.name}</span>
                              <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                                <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: cat.color }} />
                              </div>
                              <span className="text-xs text-gray-500 w-16 text-right">
                                {fmt(cat.total, detail.transactions[0]?.currency ?? 'EUR')}
                              </span>
                            </div>
                          )
                        })}
                      </div>
                    )}

                    {/* Transactions */}
                    {detail.transactions.length > 0 ? (
                      <div className="space-y-0 border border-gray-100 rounded-xl overflow-hidden">
                        {detail.transactions.map((tx, i) => (
                          <div key={tx.id} className={`flex items-center gap-3 px-4 py-2.5 text-sm ${i > 0 ? 'border-t border-gray-50' : ''}`}>
                            <span className="text-gray-400 text-xs w-16 shrink-0">{fmtDate(tx.date)}</span>
                            <span className="text-xs">{tx.finance_categories?.icon ?? '❓'}</span>
                            <span className="flex-1 text-gray-700 truncate text-xs">{tx.description}</span>
                            <span className={`text-xs font-semibold ${tx.amount < 0 ? 'text-gray-900' : 'text-emerald-600'}`}>
                              {fmt(Math.abs(tx.amount), tx.currency)}
                            </span>
                            <button
                              onClick={() => setAssignTarget({ txId: tx.id, currentMomentId: m.id })}
                              className="ml-1 p-1 text-gray-300 hover:text-[#001A70] transition-colors"
                              title={t.finances.assignMoment}
                            >
                              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A2 2 0 013 12V7a0 0 0 010 0V7a4 4 0 014-4z" />
                              </svg>
                            </button>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs text-gray-400 text-center py-4">
                        Nenhuma transação neste Momento ainda.
                        Vá em <strong>Transações</strong> e atribua gastos a este Momento.
                      </p>
                    )}
                  </>
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Share modal */}
      {sharingMoment && (
        <ShareModal
          moment={sharingMoment}
          onClose={() => setSharingMoment(null)}
          onRevoke={() => {
            setMoments(ms => ms.map(m => m.id === sharingMoment.id ? { ...m, share_token: null, share_expires_at: null } : m))
          }}
          onUpdate={info => {
            setMoments(ms => ms.map(m => m.id === sharingMoment.id ? { ...m, ...info } : m))
            setSharingMoment(prev => prev ? { ...prev, ...info } : null)
          }}
        />
      )}

      {/* Assign modal */}
      {assignTarget && (
        <AssignModal
          momentId={assignTarget.currentMomentId ?? 0}
          moments={pickerMoments}
          transactionId={assignTarget.txId}
          currentMomentId={assignTarget.currentMomentId}
          onDone={async () => { setAssignTarget(null); await loadDetail(expanded!) }}
          onClose={() => setAssignTarget(null)}
        />
      )}
    </div>
  )
}
