import { useEffect, useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { apiFetch } from '../lib/api'
import { supabase } from '../lib/supabase'
import { normalizeStorageUrl } from '../lib/storageUrl'
import { useAuth } from '../contexts/AuthContext'
import { useI18n } from '../contexts/I18nContext'
import { PageLoader } from '../components/ArvoLoader'

// Painel de admin dos Recursos (lead magnets). Espelha CommunityAdminPage:
// protegido no servidor (community_admins via isAdmin() em resources.ts),
// 403 aqui redireciona pra fora. Upload de arquivo usa signed upload URL
// (POST /admin/upload-url) + uploadToSignedUrl no client, o mesmo padrão
// dos avatares mas com bucket privado (sem policy pra client comum).

const SLUG_RE = /^[a-z0-9-]{3,80}$/
const OCRE = '#E8A020'

interface ResourceStats { views: number; unlocks: number; downloads: number; signups: number }
interface ResourceRow {
  id: number
  slug: string
  title: string
  description: string | null
  resource_type: 'file' | 'link' | 'content'
  file_path: string | null
  external_url: string | null
  content_md: string | null
  preview_image_url: string | null
  cover_image_position: string | null
  visibility: 'free' | 'plus' | 'beta'
  kit_tag: string | null
  is_published: boolean
  stats: ResourceStats
}

type FormState = {
  slug: string
  title: string
  description: string
  resource_type: 'file' | 'link' | 'content'
  file_path: string
  external_url: string
  content_md: string
  preview_image_url: string
  cover_image_position: string
  visibility: 'free' | 'plus' | 'beta'
  kit_tag: string
  is_published: boolean
}

const emptyForm: FormState = {
  slug: '', title: '', description: '', resource_type: 'file', file_path: '',
  external_url: '', content_md: '', preview_image_url: '', cover_image_position: '50% 50%', visibility: 'free',
  kit_tag: '', is_published: false,
}

function parsePosition(raw: string): { x: number; y: number } {
  const [x, y] = raw.split(' ').map(v => parseFloat(v))
  return { x: isNaN(x) ? 50 : x, y: isNaN(y) ? 50 : y }
}

const card: React.CSSProperties = { background: 'var(--arvo-surface)', border: '1px solid var(--arvo-border)', borderRadius: 12 }
const label: React.CSSProperties = { fontFamily: 'var(--arvo-font-body)', fontSize: 11.5, color: 'var(--arvo-fg-soft)', letterSpacing: '0.04em', display: 'block', marginBottom: 5 }
const input: React.CSSProperties = { fontFamily: 'var(--arvo-font-body)', fontSize: 13.5, padding: '8px 12px', border: '1px solid var(--arvo-border)', borderRadius: 8, background: 'var(--arvo-bg)', color: 'var(--arvo-fg)', width: '100%', boxSizing: 'border-box' }

interface Props {
  onRegisterNew?: (fn: () => void) => void
  onEditingChange?: (editing: boolean) => void
}

export default function ResourcesAdminPage({ onRegisterNew, onEditingChange }: Props) {
  const { t } = useI18n()
  const ra = (t as any).resources?.admin ?? {}
  const navigate = useNavigate()
  const { user } = useAuth()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const coverInputRef = useRef<HTMLInputElement>(null)
  const coverContainerRef = useRef<HTMLDivElement>(null)
  const dragStart = useRef<{ mx: number; my: number; px: number; py: number } | null>(null)

  const [loading, setLoading] = useState(true)
  const [forbidden, setForbidden] = useState(false)
  const [items, setItems] = useState<ResourceRow[]>([])
  const [editingId, setEditingId] = useState<number | 'new' | null>(null)
  const [form, setForm] = useState<FormState>(emptyForm)
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [uploadingCover, setUploadingCover] = useState(false)
  const [isDraggingCover, setIsDraggingCover] = useState(false)
  const [error, setError] = useState('')
  const [busyId, setBusyId] = useState<number | null>(null)
  const [copiedSlug, setCopiedSlug] = useState<string | null>(null)

  async function load() {
    setLoading(true)
    try {
      const data = await apiFetch<ResourceRow[]>('/resources/admin/list')
      setItems(data)
    } catch (err: any) {
      if (/403|forbidden|admin/i.test(String(err?.message))) setForbidden(true)
    } finally {
      setLoading(false)
    }
  }
  useEffect(() => { load() }, [])

  function startCreate() {
    setForm(emptyForm)
    setEditingId('new')
    setError('')
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { onRegisterNew?.(startCreate) }, [])
  useEffect(() => { onEditingChange?.(editingId !== null) }, [editingId]) // eslint-disable-line react-hooks/exhaustive-deps

  function startEdit(item: ResourceRow) {
    setForm({
      slug: item.slug, title: item.title, description: item.description ?? '',
      resource_type: item.resource_type, file_path: item.file_path ?? '',
      external_url: item.external_url ?? '', content_md: item.content_md ?? '',
      preview_image_url: item.preview_image_url ?? '', cover_image_position: item.cover_image_position ?? '50% 50%',
      visibility: item.visibility, kit_tag: item.kit_tag ?? '', is_published: item.is_published,
    })
    setEditingId(item.id)
    setError('')
  }

  async function handleFileUpload(file: File) {
    setUploading(true)
    setError('')
    try {
      const { path, token } = await apiFetch<{ path: string; token: string }>('/resources/admin/upload-url', {
        method: 'POST',
        body: JSON.stringify({ file_name: file.name, slug: form.slug || undefined }),
      })
      const { error: uploadErr } = await supabase.storage.from('resources').uploadToSignedUrl(path, token, file)
      if (uploadErr) throw uploadErr
      setForm(f => ({ ...f, file_path: path }))
    } catch (err: any) {
      setError(err?.message ?? ra.uploadError ?? 'Erro ao enviar arquivo')
    } finally {
      setUploading(false)
    }
  }

  // Capa: bucket público 'resource-covers' (migration 069), upload direto do
  // client igual ao trip-covers — diferente do arquivo do recurso em si, que
  // fica no bucket privado 'resources' e passa pelo signed upload URL.
  async function handleCoverUpload(file: File) {
    if (!user) return
    setUploadingCover(true)
    setError('')
    try {
      const ext = file.type === 'image/png' ? 'png' : file.type === 'image/webp' ? 'webp' : 'jpg'
      const path = `${user.id}/${Date.now()}.${ext}`
      const { error: upErr } = await supabase.storage
        .from('resource-covers')
        .upload(path, file, { upsert: true, contentType: file.type })
      if (upErr) throw upErr
      const { data } = supabase.storage.from('resource-covers').getPublicUrl(path)
      setForm(f => ({ ...f, preview_image_url: normalizeStorageUrl(data.publicUrl), cover_image_position: '50% 50%' }))
    } catch (err: any) {
      setError(err?.message ?? ra.uploadCoverError ?? 'Erro ao enviar a foto de capa')
    } finally {
      setUploadingCover(false)
      if (coverInputRef.current) coverInputRef.current.value = ''
    }
  }

  // Arrastar pra reposicionar a capa — mesmo mecanismo de FinancesMomentsPage
  // (drag na própria imagem, objectPosition em %, salvo como "x% y%").
  function onCoverDragStart(e: React.MouseEvent | React.TouchEvent) {
    const point = 'touches' in e ? e.touches[0] : e
    const { x, y } = parsePosition(form.cover_image_position)
    dragStart.current = { mx: point.clientX, my: point.clientY, px: x, py: y }
    setIsDraggingCover(true)
    e.preventDefault()
  }

  function onCoverDragMove(e: MouseEvent | TouchEvent) {
    if (!dragStart.current || !coverContainerRef.current) return
    const point = 'touches' in e ? (e as TouchEvent).touches[0] : (e as MouseEvent)
    const rect = coverContainerRef.current.getBoundingClientRect()
    const dx = ((point.clientX - dragStart.current.mx) / rect.width) * 100
    const dy = ((point.clientY - dragStart.current.my) / rect.height) * 100
    const x = Math.min(100, Math.max(0, dragStart.current.px - dx))
    const y = Math.min(100, Math.max(0, dragStart.current.py - dy))
    setForm(f => ({ ...f, cover_image_position: `${x.toFixed(1)}% ${y.toFixed(1)}%` }))
  }

  function onCoverDragEnd() {
    dragStart.current = null
    setIsDraggingCover(false)
  }

  useEffect(() => {
    if (!isDraggingCover) return
    window.addEventListener('mousemove', onCoverDragMove)
    window.addEventListener('mouseup', onCoverDragEnd)
    window.addEventListener('touchmove', onCoverDragMove, { passive: false })
    window.addEventListener('touchend', onCoverDragEnd)
    return () => {
      window.removeEventListener('mousemove', onCoverDragMove)
      window.removeEventListener('mouseup', onCoverDragEnd)
      window.removeEventListener('touchmove', onCoverDragMove)
      window.removeEventListener('touchend', onCoverDragEnd)
    }
  }, [isDraggingCover])

  async function save() {
    if (saving) return
    if (!SLUG_RE.test(form.slug)) { setError(ra.slugError); return }
    if (!form.title.trim()) { setError(ra.titleRequired); return }
    setSaving(true)
    setError('')
    const payload = {
      slug: form.slug, title: form.title.trim(), description: form.description || null,
      resource_type: form.resource_type,
      file_path: form.resource_type === 'file' ? (form.file_path || null) : null,
      external_url: form.resource_type === 'link' ? (form.external_url || null) : null,
      content_md: form.resource_type === 'content' ? (form.content_md || null) : null,
      preview_image_url: form.preview_image_url || null,
      cover_image_position: form.cover_image_position || '50% 50%',
      visibility: form.visibility,
      kit_tag: form.kit_tag || null,
      is_published: form.is_published,
    }
    try {
      if (editingId === 'new') {
        await apiFetch('/resources/admin', { method: 'POST', body: JSON.stringify(payload) })
      } else {
        await apiFetch(`/resources/admin/${editingId}`, { method: 'PATCH', body: JSON.stringify(payload) })
      }
      setEditingId(null)
      await load()
    } catch (err: any) {
      setError(err?.message ?? ra.saveError)
    } finally {
      setSaving(false)
    }
  }

  async function remove(item: ResourceRow) {
    if (busyId) return
    if (!confirm((ra.deleteConfirm ?? 'Excluir "{title}"?').replace('{title}', item.title))) return
    setBusyId(item.id)
    try {
      await apiFetch(`/resources/admin/${item.id}`, { method: 'DELETE' })
      setItems(prev => prev.filter(i => i.id !== item.id))
    } catch (err: any) {
      alert(err?.message ?? ra.deleteError)
    } finally {
      setBusyId(null)
    }
  }

  async function togglePublish(item: ResourceRow) {
    if (busyId) return
    setBusyId(item.id)
    try {
      await apiFetch(`/resources/admin/${item.id}`, { method: 'PATCH', body: JSON.stringify({ is_published: !item.is_published }) })
      setItems(prev => prev.map(i => i.id === item.id ? { ...i, is_published: !item.is_published } : i))
    } catch (err: any) {
      alert(err?.message ?? ra.saveError)
    } finally {
      setBusyId(null)
    }
  }

  function copyLink(slug: string) {
    const url = `${window.location.origin}/resources/${slug}`
    navigator.clipboard.writeText(url).then(() => {
      setCopiedSlug(slug)
      setTimeout(() => setCopiedSlug(null), 1800)
    })
  }

  if (loading) return <PageLoader />
  if (forbidden) { navigate('/resources'); return null }

  return (
    <div className="space-y-8">
      {editingId !== null ? (
        <section style={{ ...card, padding: 20 }} className="space-y-4">
          <h2 style={{ fontFamily: 'var(--arvo-font-display)', fontSize: 17, color: 'var(--arvo-fg)' }}>
            {editingId === 'new' ? (ra.newResource ?? '+ Novo recurso') : (ra.editResource ?? 'Editar recurso')}
          </h2>

          <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
            <div>
              <label style={label}>{ra.fieldTitle ?? 'Título'}</label>
              <input style={input} value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} />
            </div>
            <div>
              <label style={label}>{ra.fieldSlug ?? 'Slug'}</label>
              <input style={input} value={form.slug} onChange={e => setForm(f => ({ ...f, slug: e.target.value.toLowerCase() }))} />
              <p style={{ fontSize: 11, color: 'var(--arvo-fg-soft)', marginTop: 4 }}>{(ra.fieldSlugHint ?? '').replace('{slug}', form.slug || 'seu-slug')}</p>
            </div>
          </div>

          <div>
            <label style={label}>{ra.fieldDescription ?? 'Descrição'}</label>
            <textarea style={{ ...input, minHeight: 70, resize: 'vertical' }} value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
          </div>

          <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
            <div>
              <label style={label}>{ra.fieldType ?? 'Tipo de conteúdo'}</label>
              <select style={input} value={form.resource_type} onChange={e => setForm(f => ({ ...f, resource_type: e.target.value as FormState['resource_type'] }))}>
                <option value="file">{ra.typeFile ?? 'Arquivo (download)'}</option>
                <option value="link">{ra.typeLink ?? 'Link externo'}</option>
                <option value="content">{ra.typeContent ?? 'Texto liberado no gate'}</option>
              </select>
            </div>
            <div>
              <label style={label}>{ra.fieldVisibility ?? 'Visibilidade'}</label>
              <select style={input} value={form.visibility} onChange={e => setForm(f => ({ ...f, visibility: e.target.value as FormState['visibility'] }))}>
                <option value="free">{ra.visibilityFree ?? 'Grátis'}</option>
                <option value="plus">{ra.visibilityPlus ?? 'Plus (assinantes)'}</option>
                <option value="beta">{ra.visibilityBeta ?? 'Beta (só testers)'}</option>
              </select>
            </div>
          </div>

          {form.resource_type === 'file' && (
            <div>
              <label style={label}>{ra.fieldFile ?? 'Arquivo'}</label>
              <div className="flex items-center gap-3 flex-wrap">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading}
                  style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 12, padding: '8px 16px', borderRadius: 8, border: '1px solid var(--arvo-border)', background: 'none', color: 'var(--arvo-fg)', cursor: 'pointer', opacity: uploading ? 0.6 : 1 }}
                >
                  {uploading ? (ra.uploading ?? 'Enviando...') : (ra.uploadFile ?? 'Escolher arquivo')}
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  style={{ display: 'none' }}
                  onChange={e => { const f = e.target.files?.[0]; if (f) handleFileUpload(f) }}
                />
                <span style={{ fontSize: 12, color: form.file_path ? 'var(--arvo-green, #1F8A5B)' : 'var(--arvo-fg-soft)' }}>
                  {form.file_path ? `${ra.uploaded ?? 'Arquivo enviado'}: ${form.file_path.split('/').pop()}` : (ra.noFileYet ?? 'Nenhum arquivo enviado ainda')}
                </span>
              </div>
            </div>
          )}

          {form.resource_type === 'link' && (
            <div>
              <label style={label}>{ra.fieldExternalUrl ?? 'URL externa'}</label>
              <input style={input} value={form.external_url} onChange={e => setForm(f => ({ ...f, external_url: e.target.value }))} placeholder="https://..." />
            </div>
          )}

          {form.resource_type === 'content' && (
            <div>
              <label style={label}>{ra.fieldContentMd ?? 'Conteúdo liberado'}</label>
              <textarea style={{ ...input, minHeight: 140, resize: 'vertical', fontFamily: 'monospace' }} value={form.content_md} onChange={e => setForm(f => ({ ...f, content_md: e.target.value }))} />
            </div>
          )}

          <div>
            <label style={label}>{ra.fieldPreviewImage ?? 'Imagem de capa'}</label>
            <input
              ref={coverInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              style={{ display: 'none' }}
              onChange={e => { const f = e.target.files?.[0]; if (f) handleCoverUpload(f) }}
            />
            {form.preview_image_url ? (
              <div>
                <div
                  ref={coverContainerRef}
                  className="relative w-full h-40 rounded-xl overflow-hidden select-none"
                  style={{ cursor: isDraggingCover ? 'grabbing' : 'grab' }}
                  onMouseDown={onCoverDragStart}
                  onTouchStart={onCoverDragStart}
                >
                  <img
                    src={form.preview_image_url}
                    alt=""
                    draggable={false}
                    className="w-full h-full object-cover pointer-events-none"
                    style={{ objectPosition: form.cover_image_position }}
                  />
                  {!isDraggingCover && (
                    <div className="absolute top-2 left-1/2 -translate-x-1/2 pointer-events-none">
                      <span className="text-[10px] text-white/70 bg-black/40 rounded px-2 py-0.5 tracking-wide">
                        {ra.dragHint ?? 'Arraste pra reposicionar'}
                      </span>
                    </div>
                  )}
                </div>
                <div className="flex justify-end gap-3 mt-1.5">
                  <button type="button" onClick={() => coverInputRef.current?.click()} disabled={uploadingCover}
                    style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 11.5, background: 'none', border: 'none', color: 'var(--arvo-fg-soft)', cursor: 'pointer' }}
                  >
                    {uploadingCover ? (ra.uploading ?? 'Enviando...') : (ra.changeCover ?? 'Trocar capa')}
                  </button>
                  <button type="button" onClick={() => setForm(f => ({ ...f, preview_image_url: '', cover_image_position: '50% 50%' }))}
                    style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 11.5, background: 'none', border: 'none', color: 'var(--arvo-red)', cursor: 'pointer' }}
                  >
                    {ra.delete ?? 'Excluir'}
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => coverInputRef.current?.click()}
                disabled={uploadingCover}
                style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 12, padding: '8px 16px', borderRadius: 8, border: '1px solid var(--arvo-border)', background: 'none', color: 'var(--arvo-fg)', cursor: 'pointer', opacity: uploadingCover ? 0.6 : 1 }}
              >
                {uploadingCover ? (ra.uploading ?? 'Enviando...') : (ra.uploadCover ?? 'Escolher capa')}
              </button>
            )}
          </div>

          <div>
            <label style={label}>{ra.fieldKitTag ?? 'Tag do Kit'}</label>
            <input style={input} value={form.kit_tag} onChange={e => setForm(f => ({ ...f, kit_tag: e.target.value }))} />
          </div>

          <label className="flex items-center gap-2" style={{ cursor: 'pointer' }}>
            <input type="checkbox" checked={form.is_published} onChange={e => setForm(f => ({ ...f, is_published: e.target.checked }))} />
            <span style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 13, color: 'var(--arvo-fg)' }}>
              {form.is_published ? (ra.publishedYes ?? 'Publicado') : (ra.publishedNo ?? 'Rascunho')}
            </span>
          </label>

          {error && <p style={{ fontSize: 12.5, color: 'var(--arvo-red, #D63B2F)' }}>{error}</p>}

          <div className="flex items-center gap-3">
            <button
              onClick={save}
              disabled={saving}
              style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 12, padding: '9px 20px', borderRadius: 999, border: 'none', background: 'var(--arvo-black)', color: 'var(--arvo-offwhite, #F6F3EC)', cursor: 'pointer', opacity: saving ? 0.6 : 1 }}
            >
              {saving ? (ra.saving ?? 'Salvando...') : (ra.save ?? 'Salvar')}
            </button>
            <button
              onClick={() => setEditingId(null)}
              style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 12, padding: '9px 20px', borderRadius: 999, border: '1px solid var(--arvo-border)', background: 'none', color: 'var(--arvo-fg-soft)', cursor: 'pointer' }}
            >
              {ra.cancel ?? 'Cancelar'}
            </button>
          </div>
        </section>
      ) : (
        <div className="space-y-3">
          {items.map(item => (
            <div key={item.id} className="rounded-2xl border shadow-sm overflow-hidden" style={{ background: 'var(--arvo-surface)', borderColor: 'var(--arvo-border)' }}>
              {item.preview_image_url ? (
                <div className="h-28 overflow-hidden relative">
                  <img
                    src={item.preview_image_url}
                    alt={item.title}
                    className="w-full h-full object-cover"
                    style={{ objectPosition: item.cover_image_position ?? '50% 50%' }}
                  />
                </div>
              ) : (
                <div className="h-20 flex items-center justify-center" style={{ background: 'var(--arvo-black)' }}>
                  <img src="/brand/logo/arvo-symbol-gold.svg" width="24" height="26" alt="" />
                </div>
              )}

              <div style={{ padding: '14px 16px' }}>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="min-w-0 truncate" style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 14, fontWeight: 600, color: 'var(--arvo-fg)' }}>{item.title}</span>
                  <span className="shrink-0" style={{ fontSize: 10, letterSpacing: '0.08em', textTransform: 'uppercase', color: item.is_published ? 'var(--arvo-green, #1F8A5B)' : 'var(--arvo-fg-faint)' }}>
                    {item.is_published ? (ra.publishedYes ?? 'Publicado').split(' ')[0] : (ra.publishedNo ?? 'Rascunho').split(' ')[0]}
                  </span>
                </div>
                <p className="truncate" style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 11.5, color: 'var(--arvo-fg-soft)', margin: '2px 0 0' }}>/resources/{item.slug}</p>
                <p style={{ fontSize: 11, color: 'var(--arvo-fg-soft)', margin: '6px 0 0' }}>
                  {item.stats.views} {ra.views ?? 'views'} · {item.stats.unlocks} {ra.unlocks ?? 'liberações'} · {item.stats.downloads} {ra.downloads ?? 'downloads'} · {item.stats.signups} {ra.signups ?? 'cadastros'}
                </p>

                <div className="flex items-center gap-2 flex-wrap" style={{ marginTop: 12 }}>
                  <button onClick={() => copyLink(item.slug)} style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 11, padding: '4px 12px', borderRadius: 999, border: '1px solid var(--arvo-border)', background: 'none', color: 'var(--arvo-fg-soft)', cursor: 'pointer' }}>
                    {copiedSlug === item.slug ? (ra.linkCopied ?? 'Link copiado!') : (ra.copyLink ?? 'Copiar link público')}
                  </button>
                  <button onClick={() => startEdit(item)} style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 11, padding: '4px 12px', borderRadius: 999, border: '1px solid var(--arvo-border)', background: 'none', color: 'var(--arvo-fg-soft)', cursor: 'pointer' }}>
                    {ra.editResource ?? 'Editar'}
                  </button>
                  <button onClick={() => togglePublish(item)} disabled={busyId === item.id} style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 11, padding: '4px 12px', borderRadius: 999, border: `1px solid ${item.is_published ? 'var(--arvo-border)' : OCRE}`, background: item.is_published ? 'none' : 'rgba(232,160,32,0.08)', color: item.is_published ? 'var(--arvo-fg-soft)' : OCRE, cursor: 'pointer', opacity: busyId === item.id ? 0.5 : 1 }}>
                    {item.is_published ? (ra.unpublishAction ?? 'Voltar a rascunho') : (ra.publishAction ?? 'Publicar agora')}
                  </button>
                  <button onClick={() => remove(item)} disabled={busyId === item.id} style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 11, padding: '4px 12px', borderRadius: 999, border: '1px solid var(--arvo-border)', background: 'none', color: 'var(--arvo-red, #D63B2F)', cursor: 'pointer', opacity: busyId === item.id ? 0.5 : 1 }}>
                    {ra.delete ?? 'Excluir'}
                  </button>
                </div>
              </div>
            </div>
          ))}
          {items.length === 0 && (
            <p style={{ ...card, fontFamily: 'var(--arvo-font-body)', fontSize: 13, color: 'var(--arvo-fg-soft)', padding: 16 }}>{ra.empty ?? 'Nenhum recurso criado ainda'}</p>
          )}
        </div>
      )}
    </div>
  )
}
