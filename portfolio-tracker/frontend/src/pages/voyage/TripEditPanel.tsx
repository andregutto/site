import { useState, useRef } from 'react'
import { apiFetch } from '../../lib/api'
import { supabase } from '../../lib/supabase'
import { normalizeStorageUrl } from '../../lib/storageUrl'
import { useAuth } from '../../contexts/AuthContext'
import { useI18n } from '../../contexts/I18nContext'
import DestinationsEditor from './DestinationsEditor'
import type { Trip, TripDestination } from './types'

const RED = '#D63B2F'

interface Props {
  trip: Trip
  destinations: TripDestination[]
  isOwner?: boolean
  onSaved: (trip: Trip) => void
  onDestinationsChanged: (destinations: TripDestination[]) => void
  onDeleted: () => void
  onClose: () => void
}

// Painel inline (não-modal) anexado ao hero — substitui o antigo modal de
// edição. Título/capa/resumo/datas/destinos formam um conjunto coerente que
// o owner edita junto, na prática, então ficam todos aqui em vez de cada um
// clicável separadamente no hero. Collaborators with the 'editor' role can
// open this panel too (backend already allows it) — only account/delete stays
// owner-only.
export default function TripEditPanel({ trip, destinations, isOwner = true, onSaved, onDestinationsChanged, onDeleted, onClose }: Props) {
  const { t } = useI18n()
  const tv = (t as any).voyage ?? {}
  const { user } = useAuth()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [title, setTitle] = useState(trip.title)
  const [coverUrl, setCoverUrl] = useState(trip.cover_image_url ?? '')
  const [uploadingCover, setUploadingCover] = useState(false)
  const [startDate, setStartDate] = useState(trip.start_date ?? '')
  const [endDate, setEndDate] = useState(trip.end_date ?? '')
  const [summary, setSummary] = useState(trip.summary ?? '')
  const [photoAlbumUrl, setPhotoAlbumUrl] = useState(trip.photo_album_url ?? '')
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState('')

  async function handleCoverFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file || !user) return
    setUploadingCover(true)
    setError('')
    try {
      const ext = file.type === 'image/png' ? 'png' : file.type === 'image/webp' ? 'webp' : 'jpg'
      const path = `${user.id}/${trip.id}.${ext}`
      const { error: upErr } = await supabase.storage
        .from('trip-covers')
        .upload(path, file, { upsert: true, contentType: file.type })
      if (upErr) throw upErr
      const { data } = supabase.storage.from('trip-covers').getPublicUrl(path)
      setCoverUrl(`${normalizeStorageUrl(data.publicUrl)}?v=${Date.now()}`)
    } catch {
      setError(tv.errors?.uploadCover ?? 'Erro ao enviar a foto')
    } finally {
      setUploadingCover(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  async function deleteTrip() {
    const msg = (tv.confirm?.deleteTripPermanent ?? 'Excluir "{title}" permanentemente? Esta ação não pode ser desfeita.').replace('{title}', trip.title)
    if (!confirm(msg)) return
    setDeleting(true)
    try {
      await apiFetch(`/voyage/trips/${trip.id}`, { method: 'DELETE' })
      onDeleted()
    } catch {
      setError(tv.errors?.deleteTrip ?? 'Erro ao excluir')
      setDeleting(false)
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!title.trim()) { setError(tv.errors?.titleRequired ?? 'Título obrigatório'); return }
    setSaving(true)
    setError('')
    try {
      const body = {
        title: title.trim(),
        cover_image_url: coverUrl.trim() || null,
        start_date: startDate || null,
        end_date: endDate || null,
        status: trip.status,
        summary: summary.trim() || null,
        photo_album_url: photoAlbumUrl.trim() || null,
      }
      const result = await apiFetch<{ trip: Trip }>(`/voyage/trips/${trip.id}`, { method: 'PATCH', body: JSON.stringify(body) })
      onSaved(result.trip)
      onClose()
    } catch {
      setError(tv.errors?.save ?? 'Erro ao salvar')
    } finally {
      setSaving(false)
    }
  }

  const fieldStyle: React.CSSProperties = {
    width: '100%', padding: '7px 10px', borderRadius: 3,
    border: '1px solid var(--arvo-border)', background: 'var(--arvo-surface)',
    fontFamily: 'var(--arvo-font-body)', fontSize: 13, color: 'var(--arvo-fg)',
    outline: 'none',
  }
  const labelStyle: React.CSSProperties = {
    display: 'block', marginBottom: 4,
    fontFamily: 'var(--arvo-font-display)', fontSize: 9, letterSpacing: '0.18em',
    textTransform: 'uppercase', color: 'var(--arvo-fg-muted)',
  }
  const sectionStyle: React.CSSProperties = {
    padding: 12, borderRadius: 10, background: 'var(--arvo-hover-bg)', border: '1px solid var(--arvo-border-soft)',
  }


  return (
    <form onSubmit={submit} style={{
      background: 'var(--arvo-surface)', border: '1px solid var(--arvo-border)', borderRadius: 16,
      boxShadow: 'var(--arvo-shadow-sm)', padding: '18px 20px', marginBottom: 24,
      display: 'flex', flexDirection: 'column', gap: 14,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <p style={{ fontFamily: 'var(--arvo-font-display)', fontSize: 10, letterSpacing: '0.25em', textTransform: 'uppercase', color: 'var(--arvo-fg-muted)' }}>
          {tv.editTrip ?? 'Editar viagem'}
        </p>
        <button type="button" onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--arvo-fg-soft)', padding: 4 }}>
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path strokeLinecap="round" d="M2 2l10 10M12 2L2 12" />
          </svg>
        </button>
      </div>

      <label>
        <span style={labelStyle}>{tv.titleLabel ?? 'Título'} *</span>
        <input style={fieldStyle} value={title} onChange={e => setTitle(e.target.value)} placeholder="ex: Eurotrip verão 2026" />
      </label>

      {/* Datas da viagem — bloco próprio, separado dos destinos, porque os
          dias de cada destino (abaixo) são relativos a essa data de início. */}
      <div style={sectionStyle}>
        <p style={{ ...labelStyle, marginBottom: 8 }}>{tv.tripDatesLabel ?? 'Datas da viagem'}</p>
        <div className="grid grid-cols-2 gap-3">
          <label>
            <span style={{ ...labelStyle, fontSize: 8 }}>{tv.startLabel ?? 'Início'}</span>
            <input type="date" style={fieldStyle} value={startDate} onChange={e => setStartDate(e.target.value)} />
          </label>
          <label>
            <span style={{ ...labelStyle, fontSize: 8 }}>{tv.endLabel ?? 'Fim'}</span>
            <input type="date" style={fieldStyle} value={endDate} onChange={e => setEndDate(e.target.value)} />
          </label>
        </div>
      </div>

      {/* Destinos — bloco separado das datas da viagem; cada destino usa
          dia 1, 2, 3... relativo ao início acima, não uma data própria. */}
      <div style={sectionStyle}>
        <p style={{ ...labelStyle, marginBottom: 8 }}>
          {tv.destinationsLabel ?? 'Destinos'}
          <span style={{ textTransform: 'none', letterSpacing: 0, fontFamily: 'var(--arvo-font-body)', color: 'var(--arvo-fg-soft)' }}>
            {' '}— {tv.destinationsHint ?? 'dia 1, 2, 3… relativo ao início da viagem'}
          </span>
        </p>
        <DestinationsEditor tripId={trip.id} destinations={destinations} onChange={onDestinationsChanged} />
      </div>

      <label>
        <span style={labelStyle}>{tv.coverLabel ?? 'Foto de capa'}</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {coverUrl && (
            <div style={{ width: 56, height: 56, borderRadius: 8, overflow: 'hidden', flexShrink: 0, border: '1px solid var(--arvo-border)' }}>
              <img src={coverUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            </div>
          )}
          <input ref={fileInputRef} type="file" accept="image/jpeg,image/png,image/webp" onChange={handleCoverFile} style={{ display: 'none' }} id="cover-file-input" />
          <button type="button" onClick={() => fileInputRef.current?.click()} disabled={uploadingCover}
            style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 12, padding: '7px 14px', borderRadius: 6, background: 'none', border: '1px solid var(--arvo-border)', color: 'var(--arvo-fg)', cursor: uploadingCover ? 'default' : 'pointer' }}>
            {uploadingCover ? (tv.uploading ?? 'Enviando…') : coverUrl ? (tv.changePhoto ?? 'Trocar foto') : (tv.choosePhoto ?? 'Escolher foto')}
          </button>
          {coverUrl && (
            <button type="button" onClick={() => setCoverUrl('')} style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 12, color: 'var(--arvo-fg-soft)', background: 'none', border: 'none', cursor: 'pointer' }}>
              {tv.remove ?? 'Remover'}
            </button>
          )}
        </div>
      </label>

      <label>
        <span style={labelStyle}>{tv.summaryLabel ?? 'Resumo'}</span>
        <textarea style={{ ...fieldStyle, resize: 'vertical', minHeight: 60 }} value={summary} onChange={e => setSummary(e.target.value)} placeholder="Uma frase sobre a viagem..." />
      </label>

      <label>
        <span style={labelStyle}>{tv.photoAlbumLabel ?? 'Álbum de fotos (opcional)'}</span>
        <input type="url" style={fieldStyle} value={photoAlbumUrl} onChange={e => setPhotoAlbumUrl(e.target.value)} placeholder={tv.photoAlbumPlaceholder ?? 'Link de álbum compartilhado'} />
      </label>

      {error && <p style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 12, color: RED }}>{error}</p>}

      <div className="flex gap-3 justify-end pt-1">
        {isOwner && (
          <button type="button" onClick={deleteTrip} disabled={deleting || saving}
            style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 12, padding: '7px 14px', borderRadius: 6, background: 'transparent', border: `1px solid ${RED}`, color: RED, cursor: deleting ? 'default' : 'pointer', opacity: deleting ? 0.5 : 1, marginRight: 'auto' }}
          >{deleting ? (tv.deleting ?? 'Excluindo…') : (tv.deleteTrip ?? 'Excluir viagem')}</button>
        )}
        <button type="submit" disabled={saving || deleting || uploadingCover}
          style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 12, letterSpacing: '0.04em', padding: '7px 18px', borderRadius: 6, background: RED, color: '#fff', border: 'none', cursor: saving ? 'default' : 'pointer', opacity: saving ? 0.7 : 1 }}
        >{saving ? (tv.actions?.saving ?? 'Salvando…') : (tv.actions?.save ?? 'Salvar')}</button>
      </div>
    </form>
  )
}
