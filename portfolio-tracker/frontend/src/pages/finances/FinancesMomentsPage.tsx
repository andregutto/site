import { useState, useEffect, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { apiFetch } from '../../lib/api'
import { supabase } from '../../lib/supabase'
import { normalizeStorageUrl } from '../../lib/storageUrl'
import { useAuth } from '../../contexts/AuthContext'
import { useI18n } from '../../contexts/I18nContext'
import { useTheme } from '../../contexts/ThemeContext'
import { Icon } from '../../components/icons'
import { MOMENT_ICON_KEYS, resolveMomentIcon } from '../../lib/momentIcons'
import { useActiveFriends } from '../../hooks/useActiveFriends'
import Avatar from '../voyage/_shared/Avatar'
import { RoleChip, StatusChip } from '../voyage/_shared/Chips'
import PendingInvitesBanner from '../../components/PendingInvitesBanner'

const RED = '#D63B2F'
// Brand palette (Azul Arara, Terracota, Ocre Tucano, Verde Maritaca, Dourado) — dark siblings
// are softer/lighter so the per-user spending chart doesn't read as neon on dark surfaces.
const USER_COLORS_LIGHT = ['#1B4FD8', '#A36A52', '#E8A020', '#1F8A5B', '#C8B89A']
const USER_COLORS_DARK  = ['#7FA3F0', '#D9A88F', '#F0C878', '#7BC9A4', '#C8B89A']
const ALLOWED_PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']

// Downscale + re-encode only when the file actually needs it (too big for the bucket, or a
// format the bucket rejects like HEIC). Otherwise upload the original untouched — the earlier
// blanket compression (1920px/0.85) visibly degraded photos that never needed shrinking.
const MAX_UPLOAD_BYTES = 8 * 1024 * 1024
async function compressImage(file: File, maxDim = 3000, quality = 0.95): Promise<File> {
  if (file.size <= MAX_UPLOAD_BYTES && ALLOWED_PHOTO_TYPES.includes(file.type)) return file
  const bitmap = await createImageBitmap(file)
  const scale = Math.min(1, maxDim / Math.max(bitmap.width, bitmap.height))
  const w = Math.round(bitmap.width * scale)
  const h = Math.round(bitmap.height * scale)
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  if (!ctx) return file
  ctx.drawImage(bitmap, 0, 0, w, h)
  const blob: Blob | null = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', quality))
  if (!blob) return file
  const name = file.name.replace(/\.[^.]+$/, '') + '.jpg'
  return new File([blob], name, { type: 'image/jpeg' })
}

export interface Moment {
  id: number
  user_id: string
  name: string
  description: string | null
  icon: string
  color: string
  start_date: string | null
  end_date: string | null
  budget: number | null
  cover_image_url: string | null
  cover_image_position: string | null
  share_token: string | null
  share_expires_at: string | null
  share_hide_descriptions: boolean
  created_at: string
  moment_type: 'trip' | 'party' | 'dinner' | 'other'
  linked_trip_id?: number | null
}

export interface ShareInfo {
  share_token: string
  share_expires_at: string | null
  share_hide_descriptions: boolean
}

export interface ByUser {
  user_id: string
  total: number
  display?: { name?: string; email?: string; avatar_url?: string }
}

export interface MomentDetail {
  moment: Moment
  transactions: { id: number; date: string; description: string; amount: number; currency: string; notes: string | null; reimbursement_group_id: string | null; user_id: string; has_split?: boolean; finance_categories: { name: string; name_key: string | null; icon: string; color: string } | null }[]
  reimbursement_groups: Record<string, string>
  summary: { total: number; by_category: { name: string; name_key: string | null; icon: string; color: string; total: number }[]; by_user: ByUser[] }
}

export interface MomentMember {
  id: number
  user_id: string | null
  invite_email: string | null
  role: 'owner' | 'editor' | 'viewer'
  status: 'pending' | 'active' | 'left'
  joined_at: string | null
  display?: { name?: string; email?: string; avatar_url?: string }
}

export interface MomentPickerRow {
  id: number; name: string; icon: string; color: string
}

// Azul arara, terracota, ocre, verde, dourado — paleta limitada aos tons da marca.
const COLORS = ['#1B4FD8', '#A36A52', '#E8A020', '#1F8A5B', '#C8B89A']

export function _fmt(n: number, currency: string) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency, minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(n)
}

export function fmtDate(d: string) {
  return new Date(d + 'T00:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })
}

// ── Form ──────────────────────────────────────────────────────────────────────

export type MomentFormData = Omit<Moment, 'id' | 'user_id' | 'created_at' | 'share_token' | 'share_expires_at' | 'share_hide_descriptions'>

interface FormProps {
  initial?: Partial<Moment>
  onSave: (data: MomentFormData, opts?: { createTripLinked?: boolean }) => Promise<void>
  onCancel: () => void
  saving: boolean
  userId: string
}

type MomentKind = 'trip' | 'party' | 'dinner' | 'other'

export function MomentForm({ initial, onSave, onCancel, saving, userId }: FormProps) {
  const { t } = useI18n()
  const [momentKind,   setMomentKind]   = useState<MomentKind>(initial?.moment_type ?? 'other')
  const [autoCreateTrip, setAutoCreateTrip] = useState(true)
  const [name,         setName]         = useState(initial?.name ?? '')
  const [description,  setDescription]  = useState(initial?.description ?? '')
  const [icon,         setIcon]         = useState(initial?.icon ?? 'sparkle')
  const [color,        setColor]        = useState(initial?.color ?? '#1B4FD8')
  const [startDate,    setStartDate]    = useState(initial?.start_date ?? '')
  const [endDate,      setEndDate]      = useState(initial?.end_date ?? '')
  const [budget,       setBudget]       = useState(initial?.budget != null ? String(initial.budget) : '')
  const [photoPreview, setPhotoPreview] = useState<string | null>(initial?.cover_image_url ?? null)
  const [photoFile,    setPhotoFile]    = useState<File | null>(null)
  const [uploading,    setUploading]    = useState(false)
  const [photoPos,     setPhotoPos]     = useState(() => {
    const raw = initial?.cover_image_position ?? '50% 50%'
    const [x, y] = raw.split(' ').map(v => parseFloat(v))
    return { x: isNaN(x) ? 50 : x, y: isNaN(y) ? 50 : y }
  })
  const [isDragging,   setIsDragging]   = useState(false)
  const [photoError,   setPhotoError]   = useState<string | true | null>(null)
  const fileInputRef  = useRef<HTMLInputElement>(null)
  const photoContainerRef = useRef<HTMLDivElement>(null)
  const dragStart = useRef<{ mx: number; my: number; px: number; py: number } | null>(null)

  async function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setPhotoError(null)
    try {
      const toUpload = await compressImage(file)
      setPhotoFile(toUpload)
      setPhotoPreview(URL.createObjectURL(toUpload))
      setPhotoPos({ x: 50, y: 50 })
    } catch {
      // createImageBitmap can't decode some formats (notably HEIC/HEIF from iPhones) in
      // Chrome/Firefox. Falling back to the raw file would just fail at upload time with an
      // opaque 400 (the bucket only allows jpeg/png/webp/gif), so surface it clearly instead.
      if (ALLOWED_PHOTO_TYPES.includes(file.type)) {
        setPhotoFile(file)
        setPhotoPreview(URL.createObjectURL(file))
        setPhotoPos({ x: 50, y: 50 })
      } else {
        setPhotoError('unsupported-format')
        if (fileInputRef.current) fileInputRef.current.value = ''
      }
    }
  }

  function onDragStart(e: React.MouseEvent | React.TouchEvent) {
    const point = 'touches' in e ? e.touches[0] : e
    dragStart.current = { mx: point.clientX, my: point.clientY, px: photoPos.x, py: photoPos.y }
    setIsDragging(true)
    e.preventDefault()
  }

  function onDragMove(e: MouseEvent | TouchEvent) {
    if (!dragStart.current || !photoContainerRef.current) return
    const point = 'touches' in e ? (e as TouchEvent).touches[0] : (e as MouseEvent)
    const rect = photoContainerRef.current.getBoundingClientRect()
    const dx = ((point.clientX - dragStart.current.mx) / rect.width) * 100
    const dy = ((point.clientY - dragStart.current.my) / rect.height) * 100
    setPhotoPos({
      x: Math.min(100, Math.max(0, dragStart.current.px - dx)),
      y: Math.min(100, Math.max(0, dragStart.current.py - dy)),
    })
  }

  function onDragEnd() {
    dragStart.current = null
    setIsDragging(false)
  }

  useEffect(() => {
    if (!isDragging) return
    window.addEventListener('mousemove', onDragMove)
    window.addEventListener('mouseup', onDragEnd)
    window.addEventListener('touchmove', onDragMove, { passive: false })
    window.addEventListener('touchend', onDragEnd)
    return () => {
      window.removeEventListener('mousemove', onDragMove)
      window.removeEventListener('mouseup', onDragEnd)
      window.removeEventListener('touchmove', onDragMove)
      window.removeEventListener('touchend', onDragEnd)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isDragging])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    let coverImageUrl = initial?.cover_image_url ?? null

    if (photoFile) {
      setUploading(true)
      setPhotoError(null)
      try {
        // Make sure the auth token isn't stale (long editing sessions can let it expire)
        // before hitting the storage API directly with the browser's session.
        await supabase.auth.getSession()
        const ext = photoFile.name.split('.').pop() ?? 'jpg'
        const path = `${userId}/${Date.now()}.${ext}`
        const { error } = await supabase.storage.from('moment-photos')
          .upload(path, photoFile, { upsert: true, contentType: photoFile.type || 'image/jpeg' })
        if (!error) {
          const { data } = supabase.storage.from('moment-photos').getPublicUrl(path)
          coverImageUrl = normalizeStorageUrl(data.publicUrl)
        } else {
          console.error('[moment-photo-upload] failed:', error, { name: photoFile.name, type: photoFile.type, size: photoFile.size })
          setPhotoError(error.message || true)
        }
      } catch (ex) {
        console.error('[moment-photo-upload] threw:', ex, { name: photoFile.name, type: photoFile.type, size: photoFile.size })
        setPhotoError((ex as Error).message || true)
      } finally {
        setUploading(false)
      }
    }

    await onSave({
      name, description: description || null, icon, color,
      start_date: startDate || null, end_date: endDate || null,
      budget: budget !== '' ? Number(budget) : null,
      cover_image_url: coverImageUrl,
      cover_image_position: `${photoPos.x.toFixed(1)}% ${photoPos.y.toFixed(1)}%`,
      moment_type: momentKind,
    }, { createTripLinked: !initial && momentKind === 'trip' && autoCreateTrip })
  }

  const fieldCls = 'w-full border border-[var(--arvo-border)] rounded-[3px] px-3 py-2 text-sm bg-[var(--arvo-surface)] text-[var(--arvo-fg)] focus:outline-none focus:border-[var(--arvo-gold)] focus:ring-2 focus:ring-[var(--arvo-gold)]/25'
  const labelCls = 'block text-xs text-[var(--arvo-fg-muted)] mb-1'

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

        <div className="col-span-2">
          <label className={labelCls}>{t.finances.momentKindLabel}</label>
          <div className="flex flex-wrap gap-1.5">
            {(['trip', 'party', 'dinner', 'other'] as MomentKind[]).map(k => (
              <button
                key={k} type="button"
                onClick={() => setMomentKind(k)}
                className={`px-3 py-1.5 rounded-full text-xs border transition-colors ${momentKind === k ? 'border-[var(--arvo-fg)] bg-[var(--arvo-fg)]/10 text-[var(--arvo-fg)]' : 'border-[var(--arvo-border)] text-[var(--arvo-fg-muted)]'}`}
              >
                {k === 'trip' ? t.finances.momentKindTrip : k === 'party' ? t.finances.momentKindParty : k === 'dinner' ? t.finances.momentKindDinner : t.finances.momentKindOther}
              </button>
            ))}
          </div>
        </div>

        {!initial && momentKind === 'trip' && (
          <div className="col-span-2 flex items-center justify-between gap-3 py-1">
            <div>
              <p className="text-sm text-[var(--arvo-fg)]">{t.finances.momentAutoCreateTrip}</p>
              <p className="text-xs text-[var(--arvo-fg-muted)] mt-0.5">{t.finances.momentAutoCreateTripHint}</p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={autoCreateTrip}
              onClick={() => setAutoCreateTrip(v => !v)}
              style={{
                flexShrink: 0, width: 44, height: 26, borderRadius: 999, border: 'none', cursor: 'pointer',
                padding: 2, display: 'flex', alignItems: 'center',
                justifyContent: autoCreateTrip ? 'flex-end' : 'flex-start',
                background: autoCreateTrip ? '#D63B2F' : 'var(--arvo-border)',
                transition: 'background 160ms ease',
              }}
            >
              <span style={{ width: 22, height: 22, borderRadius: '50%', background: '#fff', boxShadow: '0 1px 3px rgba(0,0,0,0.25)', display: 'block' }} />
            </button>
          </div>
        )}

        {/* Photo */}
        <div className="col-span-2">
          <label className={labelCls}>{t.finances.momentPhotoLabel}</label>
          <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={onFileChange} />
          {photoPreview ? (
            <div className="space-y-1">
              <div
                ref={photoContainerRef}
                className="relative w-full h-36 rounded-xl overflow-hidden select-none"
                style={{ cursor: isDragging ? 'grabbing' : 'grab' }}
                onMouseDown={onDragStart}
                onTouchStart={onDragStart}
              >
                <img
                  src={photoPreview}
                  alt="Capa"
                  draggable={false}
                  className="w-full h-full object-cover pointer-events-none"
                  style={{ objectPosition: `${photoPos.x}% ${photoPos.y}%` }}
                />
                {/* Overlay with action buttons — hide while dragging */}
                {!isDragging && (
                  <div className="absolute inset-0 bg-black/0 hover:bg-black/30 transition-colors flex items-end justify-end gap-2 p-2">
                    <button type="button" onClick={e => { e.stopPropagation(); fileInputRef.current?.click() }}
                      onMouseDown={e => e.stopPropagation()}
                      className="text-xs text-white bg-black/50 rounded-lg px-2.5 py-1 opacity-0 group-hover:opacity-100 hover:opacity-100 transition-opacity">
                      {t.finances.momentPhotoChange}
                    </button>
                    <button type="button"
                      onClick={e => { e.stopPropagation(); setPhotoPreview(null); setPhotoFile(null) }}
                      onMouseDown={e => e.stopPropagation()}
                      className="text-xs text-white bg-red-500/70 rounded-lg px-2.5 py-1 opacity-0 group-hover:opacity-100 hover:opacity-100 transition-opacity">
                      {t.finances.momentPhotoRemove}
                    </button>
                  </div>
                )}
                {/* Drag hint */}
                <div className="absolute top-2 left-1/2 -translate-x-1/2 pointer-events-none">
                  <span className="text-[10px] text-white/70 bg-black/40 rounded px-2 py-0.5 tracking-wide">
                    {t.finances.momentPhotoDragHint}
                  </span>
                </div>
              </div>
              <div className="flex justify-end gap-2 px-0.5">
                <button type="button" onClick={() => fileInputRef.current?.click()}
                  className="text-xs text-[var(--arvo-fg-soft)] hover:text-[var(--arvo-fg)] transition-colors">{t.finances.momentPhotoChangeLabel}</button>
                <span className="text-[var(--arvo-fg-faint)]">·</span>
                <button type="button" onClick={() => { setPhotoPreview(null); setPhotoFile(null) }}
                  className="text-xs text-[var(--arvo-fg-soft)] hover:text-red-500 transition-colors">{t.finances.momentPhotoRemove}</button>
              </div>
            </div>
          ) : (
            <button type="button" onClick={() => fileInputRef.current?.click()}
              className="w-full h-20 border-2 border-dashed border-[var(--arvo-border)] rounded-xl flex flex-col items-center justify-center gap-1 text-[var(--arvo-fg-soft)] hover:border-[var(--arvo-fg)]/40 hover:text-[var(--arvo-fg)] transition-colors">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909M13.5 12a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0z" />
              </svg>
              <span className="text-xs">{t.finances.momentPhotoAdd}</span>
            </button>
          )}
        </div>

        <div className="col-span-2">
          <label className={labelCls}>{t.finances.momentIcon}</label>
          <div className="flex flex-wrap gap-1.5">
            {MOMENT_ICON_KEYS.map(ic => (
              <button
                key={ic} type="button"
                onClick={() => setIcon(ic)}
                className={`w-9 h-9 rounded-lg flex items-center justify-center border-2 transition-colors ${icon === ic ? 'border-[var(--arvo-fg)] bg-[var(--arvo-fg)]/10 text-[var(--arvo-fg)]' : 'border-transparent bg-[var(--arvo-track-bg)] text-[var(--arvo-fg-muted)]'}`}
              ><Icon name={ic} size={18} /></button>
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
                className={`w-7 h-7 rounded-full border-2 transition-all ${color === c ? 'border-[var(--arvo-fg)] scale-110' : 'border-transparent'}`}
              />
            ))}
          </div>
        </div>

        <div>
          <label className={labelCls}>{t.finances.momentStartDate}</label>
          <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className={fieldCls} />
        </div>
        <div>
          <label className={labelCls}>{t.finances.momentEndDate}</label>
          <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className={fieldCls} />
        </div>

        <div className="col-span-2">
          <label className={labelCls}>{t.finances.momentBudget} (opcional)</label>
          <input
            type="number"
            min="0"
            step="0.01"
            value={budget}
            onChange={e => setBudget(e.target.value)}
            className={fieldCls}
            placeholder="0,00"
          />
        </div>
      </div>

      {photoError && (
        <p className="text-xs text-amber-600 bg-amber-50 rounded-lg px-3 py-2">
          {photoError === 'unsupported-format' ? t.finances.momentPhotoUnsupportedFormat : (
            <>
              {t.finances.momentPhotoUploadError}
              {typeof photoError === 'string' && ` (${photoError})`}
            </>
          )}
        </p>
      )}
      <div className="flex gap-2">
        <button type="submit" disabled={saving || uploading}
          className="flex-1 bg-[var(--arvo-fg)] text-[var(--arvo-pill-active-fg)] text-sm py-2 rounded-xl hover:opacity-80 transition-opacity disabled:opacity-40">
          {uploading ? t.finances.uploadingPhoto : saving ? '…' : t.common.save}
        </button>
        <button type="button" onClick={onCancel} className="px-4 text-sm text-[var(--arvo-fg-muted)] hover:text-[var(--arvo-fg)] transition-colors">
          {t.common.cancel}
        </button>
      </div>
    </form>
  )
}

// ── Share modal ───────────────────────────────────────────────────────────────



interface ShareModalProps {
  moment: Moment
  onClose: () => void
  onRevoke: () => void
  onUpdate: (info: ShareInfo) => void
}

export function ShareModal({ moment, onClose, onRevoke, onUpdate }: ShareModalProps) {
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
      <div className="bg-[var(--arvo-surface)] w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl shadow-xl p-6 space-y-5" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-[var(--arvo-fg)] flex items-center gap-1.5">
            <span>{t.finances.shareTitle}</span>
            <Icon name={resolveMomentIcon(moment.icon)} size={16} style={{ color: moment.color }} />
            <span>{moment.name}</span>
          </h3>
          <button onClick={onClose} className="text-[var(--arvo-fg-soft)] hover:text-[var(--arvo-fg-muted)] transition-colors">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>

        {loading ? (
          <div className="text-center py-4 text-sm text-[var(--arvo-fg-soft)] animate-pulse">{t.finances.shareGenerating}</div>
        ) : (
          <>
            {/* Link */}
            <div>
              <p className="text-xs text-[var(--arvo-fg-muted)] mb-1.5">{t.finances.shareLink}</p>
              <div className="flex items-center gap-2">
                <input readOnly value={shareUrl} className="flex-1 border border-[var(--arvo-border)] rounded-lg px-3 py-2 text-xs text-[var(--arvo-fg-muted)] bg-[var(--arvo-surface)] truncate focus:outline-none" />
                <button
                  onClick={() => copyToClipboard(shareUrl)}
                  className={`px-3 py-2 rounded-lg text-xs font-medium transition-colors shrink-0 ${copied ? 'bg-emerald-100 text-emerald-700' : 'bg-[var(--arvo-fg)] text-[var(--arvo-pill-active-fg)] hover:opacity-80'}`}
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
                className="mt-0.5 w-4 h-4 accent-[#0D0D0D]"
              />
              <div>
                <p className="text-sm text-[var(--arvo-fg)] font-medium">{t.finances.shareHideDesc}</p>
                <p className="text-xs text-[var(--arvo-fg-soft)] mt-0.5">{t.finances.shareHideDescSub}</p>
              </div>
            </label>

            {/* Expiry */}
            <div>
              <p className="text-xs text-[var(--arvo-fg-muted)] mb-2">{t.finances.shareExpiry}</p>
              <div className="flex flex-wrap gap-2">
                {EXPIRY_OPTIONS.map(opt => (
                  <button
                    key={String(opt.value)}
                    onClick={() => updateSetting({ expires_in_days: opt.value })}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                      selectedDays === opt.value
                        ? 'bg-[var(--arvo-fg)] text-[var(--arvo-pill-active-fg)] border-[var(--arvo-fg)]'
                        : 'border-[var(--arvo-border)] text-[var(--arvo-fg-muted)] hover:border-[var(--arvo-border)]'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Revoke */}
            <div className="pt-2 border-t border-[var(--arvo-border)]">
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

export function AssignModal({ momentId: _momentId, moments, transactionId, currentMomentId, onDone, onClose }: AssignModalProps) {
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
      <div className="bg-[var(--arvo-surface)] rounded-2xl shadow-xl w-full max-w-xs p-5" onClick={e => e.stopPropagation()}>
        <h3 className="font-semibold text-[var(--arvo-fg)] mb-3 text-sm">{t.finances.assignMoment}</h3>
        <div className="space-y-1">
          {moments.map(m => (
            <button key={m.id} disabled={saving}
              onClick={() => assign(m.id === currentMomentId ? null : m.id)}
              className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors ${m.id === currentMomentId ? 'bg-[var(--arvo-fg)]/10 text-[var(--arvo-fg)]' : 'hover:bg-[var(--arvo-surface-2)] text-[var(--arvo-fg)]'}`}>
              <Icon name={resolveMomentIcon(m.icon)} size={16} style={{ color: m.color }} />
              <span>{m.name}</span>
              {m.id === currentMomentId && <span className="ml-auto text-xs">✓</span>}
            </button>
          ))}
          {currentMomentId && (
            <button disabled={saving} onClick={() => assign(null)}
              className="w-full text-left px-3 py-2 rounded-lg text-sm text-[var(--arvo-fg-soft)] hover:bg-[var(--arvo-surface-2)] transition-colors">
              {t.finances.noMoment}
            </button>
          )}
        </div>
        <button onClick={onClose} className="mt-3 w-full text-center text-xs text-[var(--arvo-fg-soft)] hover:text-[var(--arvo-fg-muted)] transition-colors">
          {t.common.cancel}
        </button>
      </div>
    </div>
  )
}

// ── Collaborators panel (convidar/gerir colaboradores de um momento) ─────────

interface MomentInviteFriend { email: string; name?: string; avatar_url?: string; user_id: string | null }
interface MomentInviteSuggestion { user_id: string; username: string; name?: string; avatar_url?: string }

export function MembersPanel({ momentId, ownerId }: { momentId: number; ownerId: string }) {
  const { t } = useI18n()
  const { user } = useAuth()
  const [members, setMembers]     = useState<MomentMember[]>([])
  const [loading, setLoading]     = useState(true)
  const [inviteValue, setInviteValue] = useState('')
  const [inviting, setInviting]   = useState(false)
  const [error, setError]         = useState('')
  const [removing, setRemoving]   = useState<number | null>(null)
  const friends: MomentInviteFriend[] = useActiveFriends()
  const [suggestions, setSuggestions] = useState<MomentInviteSuggestion[]>([])
  const [showSuggestions, setShowSuggestions] = useState(false)

  const isOwner = user?.id === ownerId
  // Convidar mais gente não é só privilégio do dono — um editor ativo também pode
  // (o backend já permitia isso em POST /moments/:id/invite; só a UI estava restrita ao dono).
  const myMembership = members.find(m => m.user_id === user?.id)
  const canInvite = isOwner || (myMembership?.status === 'active' && myMembership.role === 'editor')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const d = await apiFetch<{ members: MomentMember[] }>(`/finances/moments/${momentId}/members`)
      setMembers(d.members)
    } catch {
      setMembers([])
    } finally {
      setLoading(false)
    }
  }, [momentId])

  useEffect(() => { load() }, [load])

  const isEmailLike = /\S+@\S+\.\S+/.test(inviteValue)

  useEffect(() => {
    const q = inviteValue.trim().replace(/^@/, '')
    if (isEmailLike || q.length < 2) { setSuggestions([]); return }
    const handle = setTimeout(() => {
      apiFetch<MomentInviteSuggestion[]>(`/people/search?q=${encodeURIComponent(q)}`)
        .then(r => { setSuggestions(r); setShowSuggestions(true) })
        .catch(() => setSuggestions([]))
    }, 300)
    return () => clearTimeout(handle)
  }, [inviteValue, isEmailLike])

  async function sendInvite(payload: { email?: string; username?: string }) {
    setInviting(true)
    setError('')
    try {
      await apiFetch(`/finances/moments/${momentId}/invite`, { method: 'POST', body: JSON.stringify(payload) })
      setInviteValue('')
      setSuggestions([])
      setShowSuggestions(false)
      await load()
    } catch (ex: unknown) {
      setError((ex as Error).message ?? t.finances.momentInviteError)
    } finally {
      setInviting(false)
    }
  }

  async function invite(e: React.FormEvent) {
    e.preventDefault()
    const value = inviteValue.trim()
    if (!value) return
    await sendInvite(isEmailLike ? { email: value } : { username: value.replace(/^@/, '') })
  }

  async function revoke(m: MomentMember) {
    const name = m.display?.name ?? m.display?.email ?? m.invite_email ?? ''
    if (!confirm(t.finances.momentRevokeConfirm.replace('{name}', name))) return
    setRemoving(m.id)
    try {
      await apiFetch(`/finances/moments/${momentId}/members/${m.id}`, { method: 'DELETE' })
      await load()
    } finally {
      setRemoving(null)
    }
  }

  const activeMembers = members.filter(m => m.status !== 'left')

  return (
    <div>
      {loading ? (
        <p className="text-xs text-[var(--arvo-fg-soft)]">{t.common.loading}</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 10 }}>
          {activeMembers.map(m => (
            <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Avatar name={m.display?.name} email={m.display?.email} avatarUrl={m.display?.avatar_url} size={24} tone={m.status === 'active' ? 'active' : 'neutral'} />
              <span style={{ flex: 1, fontFamily: 'var(--arvo-font-body)', fontSize: 12.5, color: 'var(--arvo-fg)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {m.display?.name || m.display?.email || m.invite_email}
              </span>
              <RoleChip role={m.role} />
              <StatusChip status={m.status} />
              {isOwner && m.role !== 'owner' && (
                <button
                  type="button" onClick={() => revoke(m)} disabled={removing === m.id}
                  style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 11, color: RED, background: 'none', border: 'none', cursor: 'pointer', opacity: removing === m.id ? 0.4 : 1 }}
                >
                  {removing === m.id ? '…' : t.finances.momentRevoke}
                </button>
              )}
            </div>
          ))}
          {activeMembers.length === 0 && (
            <p className="text-xs text-[var(--arvo-fg-soft)]">{t.finances.momentNoCollaborators}</p>
          )}
        </div>
      )}

      {canInvite && (
        <div style={{ borderTop: '1px solid var(--arvo-border-soft)', paddingTop: 12 }}>
          {friends.length > 0 && (
            <div className="flex flex-wrap gap-2" style={{ marginBottom: 8 }}>
              {friends.filter(f => !members.some(m => m.user_id === f.user_id || m.invite_email === f.email)).map(f => (
                <button
                  key={f.email} type="button" onClick={() => sendInvite({ email: f.email })} disabled={inviting}
                  title={`Convidar ${f.name || f.email}`}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 6, padding: '4px 10px 4px 4px',
                    borderRadius: 999, border: '1px solid var(--arvo-border)', background: 'var(--arvo-hover-bg)',
                    cursor: 'pointer', fontFamily: 'var(--arvo-font-body)', fontSize: 11.5, color: 'var(--arvo-fg)',
                  }}
                >
                  <Avatar name={f.name} email={f.email} avatarUrl={f.avatar_url} size={20} />
                  {f.name || f.email}
                  <span style={{ color: 'var(--arvo-fg-soft)' }}>+</span>
                </button>
              ))}
            </div>
          )}
          <form onSubmit={invite} style={{ display: 'flex', gap: 6, position: 'relative' }}>
            <input
              type="text" placeholder={t.finances.momentInvitePlaceholder}
              value={inviteValue} onChange={e => setInviteValue(e.target.value)}
              onFocus={() => setShowSuggestions(true)}
              onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
              className="flex-1 border border-[var(--arvo-border)] rounded-lg px-3 py-1.5 text-xs bg-[var(--arvo-surface)] text-[var(--arvo-fg)] focus:outline-none focus:border-[var(--arvo-gold)]"
            />
            <button type="submit" disabled={inviting || !inviteValue.trim()}
              className="px-3 py-1.5 bg-[var(--arvo-fg)] text-[var(--arvo-pill-active-fg)] text-xs rounded-lg hover:opacity-80 transition-opacity disabled:opacity-40">
              {inviting ? '…' : t.finances.momentInvite}
            </button>

            {showSuggestions && suggestions.length > 0 && (
              <div style={{
                position: 'absolute', top: '100%', left: 0, right: 0, marginTop: -4, zIndex: 30,
                background: 'var(--arvo-surface)', border: '1px solid var(--arvo-border)',
                borderRadius: 10, boxShadow: 'var(--arvo-shadow-md)', overflow: 'hidden',
              }}>
                {suggestions.map(sg => (
                  <button
                    type="button" key={sg.user_id}
                    onClick={() => sendInvite({ username: sg.username })}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 10, width: '100%', textAlign: 'left',
                      padding: '8px 12px', background: 'none', border: 'none', cursor: 'pointer',
                    }}
                  >
                    <Avatar name={sg.name} avatarUrl={sg.avatar_url} size={26} />
                    <span style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 12.5, color: 'var(--arvo-fg)' }}>
                      {sg.name || `@${sg.username}`}
                    </span>
                    <span style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 11, color: 'var(--arvo-fg-soft)' }}>
                      @{sg.username}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </form>
        </div>
      )}
      {error && <p style={{ fontSize: 11, color: RED, marginTop: 6 }}>{error}</p>}
    </div>
  )
}

// ── Collaborators hero — avatar stack + "+" no canto do card de capa,
// espelha o CollaboratorsHero da Voyage (mesmo padrão visual e de interação).
interface HeroMember { id: number; status: 'pending' | 'active' | 'left'; display?: { name?: string; email?: string; avatar_url?: string } }

export function MomentCollaboratorsHero({ momentId, onOpen }: { momentId: number; onOpen: () => void }) {
  const { t } = useI18n()
  const [members, setMembers] = useState<HeroMember[]>([])

  useEffect(() => {
    apiFetch<{ members: HeroMember[] }>(`/finances/moments/${momentId}/members`)
      .then(d => setMembers(d.members.filter(m => m.status === 'active')))
      .catch(() => {})
  }, [momentId])

  // Only show the avatar stack once someone besides the owner has actually joined —
  // a moment with no collaborators just shows the "invite" affordance, as before.
  const shown = members.length > 1 ? members.slice(0, 4) : []

  return (
    <button
      type="button"
      onClick={e => { e.stopPropagation(); onOpen() }}
      style={{
        display: 'flex', alignItems: 'center', gap: 8,
        background: 'rgba(13,13,13,0.55)', backdropFilter: 'blur(8px)', border: '1px solid rgba(255,255,255,0.12)',
        borderRadius: 999, padding: shown.length > 0 ? '4px 10px 4px 4px' : '5px 12px', cursor: 'pointer',
      }}
      title={t.finances.momentCollaboratorsHint}
    >
      {shown.length > 0 && (
        <div className="flex -space-x-2">
          {shown.map(m => (
            <div key={m.id} style={{ border: '2px solid rgba(13,13,13,0.55)', borderRadius: '50%' }}>
              <Avatar name={m.display?.name} email={m.display?.email} avatarUrl={m.display?.avatar_url} size={22} />
            </div>
          ))}
        </div>
      )}
      <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontFamily: 'var(--arvo-font-body)', fontSize: 11, color: 'rgba(255,255,255,0.80)', letterSpacing: '0.04em' }}>
        {shown.length === 0 ? (
          <>
            <svg width="12" height="12" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5">
              <circle cx="5" cy="4.5" r="2.5"/>
              <path strokeLinecap="round" d="M1 12c0-2.2 1.8-4 4-4s4 1.8 4 4M9.5 4.8a2 2 0 110 4M13 12c0-1.7-1.2-3.1-2.8-3.6"/>
            </svg>
            {t.finances.momentInvite}
          </>
        ) : (
          <span style={{ fontSize: 13, lineHeight: 1 }}>+</span>
        )}
      </span>
    </button>
  )
}

export function ByUserBreakdown({ byUser, total, currency, fmt, hideLabel }: { byUser: ByUser[]; total: number; currency: string; fmt: (n: number, c: string) => string; hideLabel?: boolean }) {
  const { t } = useI18n()
  const { resolvedTheme } = useTheme()
  const USER_COLORS = resolvedTheme === 'dark' ? USER_COLORS_DARK : USER_COLORS_LIGHT
  if (byUser.length < 2) return null
  return (
    <div className="space-y-1.5">
      {!hideLabel && (
        <p style={{ fontFamily: 'var(--arvo-font-display)', fontSize: 9, letterSpacing: '0.22em', textTransform: 'uppercase', color: 'var(--arvo-fg-muted)', marginBottom: 4 }}>
          {t.finances.momentByUserTitle}
        </p>
      )}
      {byUser.map((u, i) => {
        const pct = total > 0 ? Math.round((u.total / total) * 100) : 0
        return (
          <div key={u.user_id} className="flex items-center gap-2">
            <Avatar name={u.display?.name} email={u.display?.email} avatarUrl={u.display?.avatar_url} size={22} />
            <div className="flex-1 h-1.5 bg-[var(--arvo-track-bg)] rounded-full overflow-hidden">
              <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: USER_COLORS[i % USER_COLORS.length] }} />
            </div>
            <span className="text-xs text-[var(--arvo-fg)] w-16 text-right">{fmt(u.total, currency)}</span>
            <span className="text-[11px] text-[var(--arvo-fg-soft)] w-8 text-right">{pct}%</span>
          </div>
        )
      })}
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export function resolveKey(name: string, nameKey: string | null | undefined, keys: Record<string, string>): string {
  if (!nameKey) return name
  return keys[nameKey] ?? name
}

// Botão de ícone no header do card (ao lado de compartilhar/editar/excluir) —
// movido pra lá pra ficar visível sem precisar expandir o momento. Quando o momento já
// tem uma viagem vinculada, o clique só navega até ela em vez de tentar criar outra —
// e o ícone/tooltip mudam de acordo, em vez de sempre parecer "criar viagem".
export function TransformToTripButton({ momentId, momentType, linkedTripId, onTrip }: { momentId: number; momentType?: string; linkedTripId?: number | null; onTrip: (tripId: number) => void }) {
  const { t } = useI18n()
  const [loading, setLoading] = useState(false)
  const [done, setDone] = useState(false)

  // Só faz sentido oferecer "virar viagem" pra Momentos do tipo viagem — pra festa/jantar/
  // outro isso não tinha efeito (a API aceita, mas confundia o usuário à toa). Se já foi
  // transformado antes (linkedTripId), sempre mostra "ver viagem" independente do tipo atual.
  if (momentType && momentType !== 'trip' && !linkedTripId) return null

  async function handle(e: React.MouseEvent) {
    e.stopPropagation()
    if (linkedTripId) { onTrip(linkedTripId); return }
    setLoading(true)
    try {
      const result = await apiFetch<{ trip: { id: number } }>(`/voyage/from-moment/${momentId}`, { method: 'POST' })
      setDone(true)
      onTrip(result.trip.id)
    } catch {
      setLoading(false)
    }
  }

  const title = linkedTripId
    ? t.finances.momentViewTrip
    : done ? t.finances.momentTransformOpening : loading ? t.finances.momentTransformCreating : t.finances.momentTransformToTrip

  return (
    <button
      type="button"
      onClick={handle}
      disabled={loading || done}
      title={title}
      className="p-1.5 transition-colors rounded-lg hover:bg-[var(--arvo-track-bg)] disabled:opacity-50"
      style={{ color: linkedTripId ? 'var(--arvo-blue)' : '#D63B2F' }}
    >
      <Icon name="plane" size={14} />
    </button>
  )
}

export default function FinancesMomentsPage() {
  const { t } = useI18n()
  const { user } = useAuth()
  const navigate = useNavigate()

  const [moments,     setMoments]     = useState<Moment[]>([])
  const [loading,     setLoading]     = useState(true)
  const [showForm,    setShowForm]    = useState(false)
  const [editing,     setEditing]     = useState<Moment | null>(null)
  const [saving,      setSaving]      = useState(false)
  const [selectedTripId, setSelectedTripId] = useState<number | null>(null)
  const [tripOptions, setTripOptions]       = useState<{ id: number; title: string }[]>([])
  const [typeFilter,  setTypeFilter]  = useState<'all' | MomentKind>('all')
  const [search,      setSearch]      = useState('')
  const [showSearch,  setShowSearch]  = useState(false)
  const [expandedYears, setExpandedYears] = useState<Set<number>>(() => new Set([new Date().getFullYear()]))
  const [membersTarget, setMembersTarget] = useState<Moment | null>(null)

  useEffect(() => {
    if (showForm && !editing) {
      apiFetch<{ trips: { id: number; title: string }[] }>('/voyage/trips')
        .then(d => setTripOptions(d.trips))
        .catch(() => {})
    } else {
      setSelectedTripId(null)
      setTripOptions([])
    }
  }, [showForm, editing])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const data = await apiFetch<Moment[]>('/finances/moments')
      setMoments(data)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  async function saveMoment(data: MomentFormData, opts?: { createTripLinked?: boolean }) {
    setSaving(true)
    try {
      if (editing) {
        await apiFetch(`/finances/moments/${editing.id}`, { method: 'PATCH', body: JSON.stringify(data) })
      } else {
        const created = await apiFetch<{ id: number }>('/finances/moments', { method: 'POST', body: JSON.stringify(data) })
        if (selectedTripId && created?.id) {
          await apiFetch(`/voyage/trips/${selectedTripId}/moments`, {
            method: 'POST',
            body: JSON.stringify({ moment_id: created.id }),
          })
        } else if (opts?.createTripLinked && created?.id) {
          const tripResult = await apiFetch<{ trip: { id: number } }>('/voyage/trips', {
            method: 'POST',
            body: JSON.stringify({ title: data.name, start_date: data.start_date, end_date: data.end_date }),
          })
          if (tripResult?.trip?.id) {
            await apiFetch(`/voyage/trips/${tripResult.trip.id}/moments`, {
              method: 'POST',
              body: JSON.stringify({ moment_id: created.id }),
            })
          }
        }
      }
      setShowForm(false)
      setEditing(null)
      setSelectedTripId(null)
      await load()
    } finally {
      setSaving(false)
    }
  }

  async function deleteMoment(id: number) {
    if (!confirm(t.finances.momentConfirmDelete)) return
    try {
      await apiFetch(`/finances/moments/${id}`, { method: 'DELETE' })
    } catch (e) {
      // 409 = pending shared-expense balance — backend's message already asks "delete anyway?"
      if (e instanceof Error && confirm(e.message)) {
        await apiFetch(`/finances/moments/${id}?force=true`, { method: 'DELETE' })
      } else {
        return
      }
    }
    await load()
  }

  if (loading) {
    return (
      <div className="bg-[var(--arvo-surface)] rounded-2xl border border-[var(--arvo-border)] shadow-sm p-12 text-center text-[var(--arvo-fg-soft)] text-sm">
        {t.common.loading}
      </div>
    )
  }

  const typeLabel = (k: MomentKind) =>
    k === 'trip' ? t.finances.momentKindTrip : k === 'party' ? t.finances.momentKindParty : k === 'dinner' ? t.finances.momentKindDinner : t.finances.momentKindOther

  const filtered = moments
    .filter(m => typeFilter === 'all' || (m.moment_type ?? 'other') === typeFilter)
    .filter(m => search.trim() === '' || m.name.toLowerCase().includes(search.trim().toLowerCase()))

  function toggleYear(year: number) {
    setExpandedYears(prev => {
      const next = new Set(prev)
      if (next.has(year)) next.delete(year); else next.add(year)
      return next
    })
  }

  // Agrupamento por ano — "Este ano" primeiro, anos anteriores em ordem decrescente,
  // mesmo padrão que a Voyage usa pra listas que crescem com o tempo.
  const currentYear = new Date().getFullYear()
  const yearOf = (m: Moment) => new Date(m.start_date ?? m.created_at).getFullYear()
  const groups = new Map<number, Moment[]>()
  for (const m of filtered) {
    const y = yearOf(m)
    if (!groups.has(y)) groups.set(y, [])
    groups.get(y)!.push(m)
  }
  const sortedYears = [...groups.keys()].sort((a, b) => b - a)

  return (
    <div className="space-y-4">
      {/* Header — título e ação na mesma linha, sem quebrar; o botão vira um
          "+" compacto pra não ocupar uma linha inteira embaixo do título. */}
      <div className="flex items-center justify-between gap-3">
        <h1 style={{ fontFamily: "var(--arvo-font-body)", fontSize: 18, letterSpacing: '0.06em', color: 'var(--arvo-fg)' }}>{t.finances.momentsTitle}</h1>
        <button
          onClick={() => { setEditing(null); setShowForm(true) }}
          title={t.finances.newMoment}
          className="w-8 h-8 flex items-center justify-center bg-[var(--arvo-fg)] text-[var(--arvo-pill-active-fg)] text-lg leading-none rounded-full hover:opacity-80 transition-opacity shrink-0"
        >
          +
        </button>
      </div>

      <PendingInvitesBanner types={['moment_invite']} />

      {/* Create/edit form */}
      {showForm && (
        <div className="bg-[var(--arvo-surface)] rounded-2xl border border-[var(--arvo-border)] shadow-sm p-6">
          <h3 className="font-semibold text-[var(--arvo-fg)] mb-4 text-sm">
            {editing ? t.finances.editMoment : t.finances.newMoment}
          </h3>
          <MomentForm
            initial={editing ?? undefined}
            onSave={saveMoment}
            onCancel={() => { setShowForm(false); setEditing(null); setSelectedTripId(null) }}
            saving={saving}
            userId={user?.id ?? ''}
          />
          {!editing && tripOptions.length > 0 && (
            <div style={{ marginTop: 20, paddingTop: 18, borderTop: '1px solid var(--arvo-border-soft)' }}>
              <p style={{ fontFamily: 'var(--arvo-font-display)', fontSize: 9, letterSpacing: '0.22em', textTransform: 'uppercase', color: 'var(--arvo-fg-muted)', marginBottom: 10 }}>
                Vincular a uma viagem (opcional)
              </p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {tripOptions.map(trip => (
                  <button
                    key={trip.id}
                    type="button"
                    onClick={() => setSelectedTripId(selectedTripId === trip.id ? null : trip.id)}
                    style={{
                      padding: '5px 14px', borderRadius: 999, cursor: 'pointer', transition: 'all 160ms ease',
                      fontFamily: 'var(--arvo-font-body)', fontSize: 12,
                      border: `1px solid ${selectedTripId === trip.id ? '#D63B2F' : 'var(--arvo-border)'}`,
                      background: selectedTripId === trip.id ? 'rgba(214,59,47,0.08)' : 'transparent',
                      color: selectedTripId === trip.id ? '#D63B2F' : 'var(--arvo-fg-muted)',
                    }}
                  >
                    {selectedTripId === trip.id && '✓ '}{trip.title}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Empty state */}
      {moments.length === 0 && !showForm && (
        <div className="bg-[var(--arvo-surface)] rounded-2xl border border-[var(--arvo-border)] shadow-sm p-12 text-center">
          <div className="flex justify-center mb-4 text-[var(--arvo-fg-soft)]"><Icon name="sparkle" size={40} /></div>
          <p className="text-[var(--arvo-fg)] font-medium mb-1">{t.finances.momentEmptyTitle}</p>
          <p className="text-sm text-[var(--arvo-fg-soft)] mb-5">{t.finances.momentEmptyBody}</p>
          <button
            onClick={() => setShowForm(true)}
            className="px-5 py-2 bg-[var(--arvo-fg)] text-[var(--arvo-pill-active-fg)] text-sm rounded-xl hover:opacity-80 transition-opacity"
          >
            {t.finances.momentCreateFirst}
          </button>
        </div>
      )}

      {/* Filtro por tipo + busca — tudo numa linha só; os pills rolam
          horizontalmente e a busca é um ícone que expande, pra não gastar
          uma linha inteira de altura só com controles. */}
      {moments.length > 0 && (
        <div className="flex items-center gap-2">
          {showSearch ? (
            <div className="relative flex-1">
              <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[var(--arvo-fg-faint)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M17 10.5A6.5 6.5 0 114 10.5a6.5 6.5 0 0113 0z" />
              </svg>
              <input
                autoFocus
                value={search}
                onChange={e => setSearch(e.target.value)}
                onBlur={() => { if (!search) setShowSearch(false) }}
                placeholder={t.common.search ?? 'Buscar...'}
                style={{ fontSize: 16 }}
                className="pl-8 pr-3 py-1.5 sm:text-xs rounded-full border border-[var(--arvo-border)] bg-[var(--arvo-surface)] text-[var(--arvo-fg)] w-full focus:outline-none focus:border-[var(--arvo-gold)] transition-colors"
              />
            </div>
          ) : (
            <>
              <div className="flex gap-1.5 overflow-x-auto flex-1 min-w-0" style={{ scrollbarWidth: 'none' }}>
                {(['all', 'trip', 'party', 'dinner', 'other'] as const).map(k => (
                  <button
                    key={k} type="button"
                    onClick={() => setTypeFilter(k)}
                    className={`px-3 py-1.5 rounded-full text-xs border transition-colors shrink-0 ${typeFilter === k ? 'border-[var(--arvo-fg)] bg-[var(--arvo-fg)]/10 text-[var(--arvo-fg)]' : 'border-[var(--arvo-border)] text-[var(--arvo-fg-muted)]'}`}
                  >
                    {k === 'all' ? t.common.all : typeLabel(k)}
                  </button>
                ))}
              </div>
              <button
                type="button"
                onClick={() => setShowSearch(true)}
                className="w-7 h-7 flex items-center justify-center rounded-full border border-[var(--arvo-border)] text-[var(--arvo-fg-muted)] hover:text-[var(--arvo-fg)] transition-colors shrink-0"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M17 10.5A6.5 6.5 0 114 10.5a6.5 6.5 0 0113 0z" />
                </svg>
              </button>
            </>
          )}
        </div>
      )}

      {/* Moments list — cards com foto (mesma linguagem visual de antes),
          agrupados por ano em accordion; só o ano atual abre por padrão.
          Clique no card leva pra página de detalhe própria do momento. */}
      {sortedYears.map(year => {
        const isOpen = expandedYears.has(year)
        return (
          <div key={year} className="space-y-3">
            <button
              type="button"
              onClick={() => toggleYear(year)}
              className="flex items-center gap-2 w-full"
              style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
            >
              <svg className={`w-3 h-3 text-[var(--arvo-fg-soft)] transition-transform ${isOpen ? 'rotate-90' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
              </svg>
              <p style={{ fontFamily: 'var(--arvo-font-display)', fontSize: 10, letterSpacing: '0.20em', textTransform: 'uppercase', color: 'var(--arvo-fg-muted)' }}>
                {year === currentYear ? t.common.thisYear : year} · {groups.get(year)!.length}
              </p>
            </button>
            {isOpen && (
              <div className="space-y-3">
                {groups.get(year)!.map(m => (
                  <div key={m.id} className="bg-[var(--arvo-surface)] rounded-2xl border border-[var(--arvo-border)] shadow-sm overflow-hidden">
                    {m.cover_image_url ? (
                      <div className="h-28 overflow-hidden relative cursor-pointer" onClick={() => navigate(`/finances/moments/${m.id}`)}>
                        <img src={m.cover_image_url} alt={m.name} className="w-full h-full object-cover"
                          style={{ objectPosition: m.cover_image_position ?? '50% 50%' }} />
                        <div style={{ position: 'absolute', bottom: 8, right: 8 }}>
                          <MomentCollaboratorsHero momentId={m.id} onOpen={() => setMembersTarget(m)} />
                        </div>
                      </div>
                    ) : (
                      <div className="h-20 flex items-center justify-center relative cursor-pointer" style={{ background: 'var(--arvo-surface-2)' }} onClick={() => navigate(`/finances/moments/${m.id}`)}>
                        <Icon name={resolveMomentIcon(m.icon)} size={36} style={{ color: m.color }} />
                        <div style={{ position: 'absolute', bottom: 6, right: 6 }}>
                          <MomentCollaboratorsHero momentId={m.id} onOpen={() => setMembersTarget(m)} />
                        </div>
                      </div>
                    )}
                    <div
                      className="flex items-center gap-3 px-5 py-4 cursor-pointer hover:bg-[var(--arvo-surface-2)] transition-colors"
                      onClick={() => navigate(`/finances/moments/${m.id}`)}
                    >
                      <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style={{ backgroundColor: m.color + '20', color: m.color }}>
                        <Icon name={resolveMomentIcon(m.icon)} size={20} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-[var(--arvo-fg)] text-sm truncate">{m.name}</p>
                        {(m.start_date || m.description) && (
                          <p className="text-xs text-[var(--arvo-fg-soft)] mt-0.5 truncate">
                            {m.start_date && m.end_date
                              ? `${fmtDate(m.start_date)} – ${fmtDate(m.end_date)}`
                              : m.start_date
                              ? `${t.finances.momentFromDate} ${fmtDate(m.start_date)}`
                              : m.description}
                          </p>
                        )}
                      </div>
                      <span
                        className="text-[10px] px-2 py-0.5 rounded-full shrink-0 hidden sm:inline-block"
                        style={{ background: 'var(--arvo-hover-bg)', color: 'var(--arvo-fg-muted)' }}
                      >
                        {typeLabel(m.moment_type ?? 'other')}
                      </span>
                      <div className="flex items-center gap-2 shrink-0">
                        <TransformToTripButton momentId={m.id} momentType={m.moment_type} linkedTripId={m.linked_trip_id} onTrip={tripId => navigate(`/voyage/${tripId}`)} />
                        <button
                          onClick={e => { e.stopPropagation(); setEditing(m); setShowForm(true) }}
                          className="p-1.5 text-[var(--arvo-fg-soft)] hover:text-[var(--arvo-fg)] transition-colors rounded-lg hover:bg-[var(--arvo-track-bg)]"
                        >
                          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                          </svg>
                        </button>
                        <button
                          onClick={e => { e.stopPropagation(); deleteMoment(m.id) }}
                          className="p-1.5 text-[var(--arvo-fg-soft)] hover:text-red-500 transition-colors rounded-lg hover:bg-red-50"
                        >
                          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </button>
                        <svg className="w-4 h-4 text-[var(--arvo-fg-soft)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                        </svg>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )
      })}

      {/* Overlay de colaboradores — clicar nos avatares/+ do card deveria abrir isso, não
          navegar pro Momento (era o bug: onOpen chamava navigate em vez de abrir o painel). */}
      {membersTarget && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center"
          style={{ background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(4px)' }}
          onClick={e => { if (e.target === e.currentTarget) setMembersTarget(null) }}
        >
          <div
            className="w-full sm:max-w-md max-h-[90vh] overflow-y-auto rounded-t-[18px] sm:rounded-[18px]"
            style={{ background: 'var(--arvo-surface)', border: '1px solid var(--arvo-border-soft)', boxShadow: 'var(--arvo-shadow-lg)' }}
          >
            <div className="flex items-center justify-between px-6 py-4" style={{ borderBottom: '1px solid var(--arvo-border-soft)' }}>
              <p style={{ fontFamily: 'var(--arvo-font-display)', fontSize: 13, letterSpacing: '0.10em', color: 'var(--arvo-fg)' }}>
                {t.finances.momentCollaboratorsTitle}
              </p>
              <button
                type="button" onClick={() => setMembersTarget(null)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--arvo-fg-soft)', padding: 4 }}
              >
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path strokeLinecap="round" d="M3 3l10 10M13 3L3 13" />
                </svg>
              </button>
            </div>
            <div style={{ padding: 20 }}>
              <MembersPanel momentId={membersTarget.id} ownerId={membersTarget.user_id} />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
