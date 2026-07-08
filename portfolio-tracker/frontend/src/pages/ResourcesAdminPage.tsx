import { useEffect, useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { apiFetch } from '../lib/api'
import { supabase } from '../lib/supabase'
import { normalizeStorageUrl } from '../lib/storageUrl'
import { useAuth } from '../contexts/AuthContext'
import { useI18n } from '../contexts/I18nContext'
import { PageLoader } from '../components/ArvoLoader'
import { FormSection } from '../components/ui'

// Painel de admin dos Recursos (lead magnets). Espelha CommunityAdminPage:
// protegido no servidor (community_admins via isAdmin() em resources.ts),
// 403 aqui redireciona pra fora. Upload de arquivo usa signed upload URL
// (POST /admin/upload-url) + uploadToSignedUrl no client, o mesmo padrão
// dos avatares mas com bucket privado (sem policy pra client comum).

const SLUG_RE = /^[a-z0-9-]{3,80}$/
const OCRE = '#E8A020'

interface ResourceStats { views: number; unlocks: number; downloads: number; signups: number; by_source: Record<string, number> }
interface ResourceLink { id: number; label: string; utm_campaign: string; created_at: string }
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
  links: ResourceLink[]
}

// Aquisição por viagem compartilhada (lead magnet da frente B): payload do
// GET /voyage/admin/acquisition — views do gate, cadastros via
// profiles.signup_source = 'trip:<id>' e quebra por campanha. Os links de
// divulgação se gerenciam no modal Compartilhar da própria viagem; aqui é
// só leitura do funil.
interface TripAcqRow {
  id: number
  title: string
  destination: string | null
  country: string | null
  cover_image_url: string | null
  cover_image_position: string | null
  stats: { views: number; signups: number; by_source: Record<string, number> }
  links: ResourceLink[]
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
  is_published: boolean
}

const emptyForm: FormState = {
  slug: '', title: '', description: '', resource_type: 'file', file_path: '',
  external_url: '', content_md: '', preview_image_url: '', cover_image_position: '50% 50%', visibility: 'free',
  is_published: false,
}

function parsePosition(raw: string): { x: number; y: number } {
  const [x, y] = raw.split(' ').map(v => parseFloat(v))
  return { x: isNaN(x) ? 50 : x, y: isNaN(y) ? 50 : y }
}

// Mesma regra do slugify do servidor (community.ts/resources.ts) — deriva o
// slug do título enquanto o usuário não editar o campo Slug na mão (ver
// slugTouched). kit_tag (tag do Kit pro sync futuro) reaproveita esse mesmo
// slug direto no save(), sem campo próprio no formulário: como o sync ainda
// não existe, expor um campo que não faz nada só confundia.
function slugifyTitle(name: string): string {
  return name
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
}

function Toggle({ checked, onChange, activeColor = 'var(--arvo-fg)' }: { checked: boolean; onChange: (v: boolean) => void; activeColor?: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      style={{
        position: 'relative', width: 36, height: 21, borderRadius: 999, border: 'none', padding: 0,
        background: checked ? activeColor : 'var(--arvo-border)', transition: 'background 180ms ease',
        cursor: 'pointer', flexShrink: 0,
      }}
    >
      <span style={{
        position: 'absolute', top: 2, left: checked ? 17 : 2, width: 17, height: 17, borderRadius: '50%',
        background: '#fff', boxShadow: '0 1px 3px rgba(0,0,0,0.25)', transition: 'left 180ms cubic-bezier(0.4,0,0.2,1)',
      }} />
    </button>
  )
}

const card: React.CSSProperties = { background: 'var(--arvo-surface)', border: '1px solid var(--arvo-border)', borderRadius: 12 }
const label: React.CSSProperties = { fontFamily: 'var(--arvo-font-body)', fontSize: 12.5, color: 'var(--arvo-fg-soft)', letterSpacing: '0.04em', display: 'block', marginBottom: 5 }
const input: React.CSSProperties = { fontFamily: 'var(--arvo-font-body)', fontSize: 14.5, padding: '8px 12px', border: '1px solid var(--arvo-border)', borderRadius: 8, background: 'var(--arvo-bg)', color: 'var(--arvo-fg)', width: '100%', boxSizing: 'border-box' }

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
  const slugTouched = useRef(false)

  const [loading, setLoading] = useState(true)
  const [forbidden, setForbidden] = useState(false)
  const [items, setItems] = useState<ResourceRow[]>([])
  const [trips, setTrips] = useState<TripAcqRow[]>([])
  const [editingId, setEditingId] = useState<number | 'new' | null>(null)
  const [form, setForm] = useState<FormState>(emptyForm)
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [uploadingCover, setUploadingCover] = useState(false)
  const [isDraggingCover, setIsDraggingCover] = useState(false)
  const [error, setError] = useState('')
  const [busyId, setBusyId] = useState<number | null>(null)
  const [linksOpenId, setLinksOpenId] = useState<number | null>(null)
  const [newLinkLabel, setNewLinkLabel] = useState('')
  const [creatingLink, setCreatingLink] = useState(false)
  const [copiedLinkId, setCopiedLinkId] = useState<number | null>(null)

  async function load() {
    setLoading(true)
    try {
      const [data, acq] = await Promise.all([
        apiFetch<ResourceRow[]>('/resources/admin/list'),
        // Falha da seção Viagens não derruba a página de Recursos.
        apiFetch<TripAcqRow[]>('/voyage/admin/acquisition').catch(() => [] as TripAcqRow[]),
      ])
      setItems(data)
      setTrips(acq)
    } catch (err: any) {
      if (/403|forbidden|admin/i.test(String(err?.message))) setForbidden(true)
    } finally {
      setLoading(false)
    }
  }
  useEffect(() => { load() }, [])

  function startCreate() {
    setForm(emptyForm)
    slugTouched.current = false
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
      visibility: item.visibility, is_published: item.is_published,
    })
    slugTouched.current = true // recurso já existe — nunca reescrever o slug ao editar o título
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
      kit_tag: form.slug || null,
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

  function linkUrl(item: ResourceRow, link: ResourceLink): string {
    const base = `${window.location.origin}/resources/${item.slug}`
    if (!link.utm_campaign) return base
    return `${base}?utm_source=youtube&utm_campaign=${encodeURIComponent(link.utm_campaign)}`
  }

  // Linha fixa no topo do painel de links — sempre existe, não precisa gerar
  // (é só a URL crua, sem UTM). Resolve a confusão de ter dois botões
  // separados ("link público" x "link de divulgação"): agora é um só lugar.
  function directLink(): ResourceLink {
    return { id: -1, label: ra.directLink ?? 'Link direto (sem origem)', utm_campaign: '', created_at: '' }
  }

  function copyGeneratedLink(item: ResourceRow, link: ResourceLink) {
    navigator.clipboard.writeText(linkUrl(item, link)).then(() => {
      setCopiedLinkId(link.id)
      setTimeout(() => setCopiedLinkId(null), 1800)
    })
  }

  async function createLink(item: ResourceRow) {
    if (creatingLink || !newLinkLabel.trim()) return
    setCreatingLink(true)
    try {
      const link = await apiFetch<ResourceLink>(`/resources/admin/${item.slug}/links`, {
        method: 'POST', body: JSON.stringify({ label: newLinkLabel.trim() }),
      })
      setItems(prev => prev.map(i => i.id === item.id ? { ...i, links: [link, ...i.links] } : i))
      setNewLinkLabel('')
    } catch (err: any) {
      alert(err?.message ?? ra.saveError)
    } finally {
      setCreatingLink(false)
    }
  }

  async function deleteLink(item: ResourceRow, link: ResourceLink) {
    try {
      await apiFetch(`/resources/admin/${item.slug}/links/${link.id}`, { method: 'DELETE' })
      setItems(prev => prev.map(i => i.id === item.id ? { ...i, links: i.links.filter(l => l.id !== link.id) } : i))
    } catch (err: any) {
      alert(err?.message ?? ra.saveError)
    }
  }

  function renderLinksPanel(item: ResourceRow) {
    return (
      <div>
        <div className="space-y-2">
          {[directLink(), ...item.links].map(link => (
            <div key={link.id} className="flex items-center gap-2 flex-wrap" style={{ fontSize: 12.5 }}>
              <span className="min-w-0 truncate" style={{ fontFamily: 'var(--arvo-font-body)', color: link.id === -1 ? 'var(--arvo-fg-soft)' : 'var(--arvo-fg)', fontStyle: link.id === -1 ? 'italic' : 'normal', flex: '0 1 auto', maxWidth: 170 }}>{link.label}</span>
              <span className="min-w-0 truncate" style={{ fontFamily: 'var(--arvo-font-mono, monospace)', color: 'var(--arvo-fg-soft)', flex: 1 }}>{linkUrl(item, link)}</span>
              <button onClick={() => copyGeneratedLink(item, link)} style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 10.5, padding: '3px 10px', borderRadius: 999, border: '1px solid var(--arvo-border)', background: 'none', color: 'var(--arvo-fg-soft)', cursor: 'pointer', whiteSpace: 'nowrap' }}>
                {copiedLinkId === link.id ? (ra.linkCopied ?? 'Copiado!') : (ra.copy ?? 'Copiar')}
              </button>
              {link.id !== -1 && (
                <button onClick={() => deleteLink(item, link)} style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 10.5, padding: '3px 10px', borderRadius: 999, border: '1px solid var(--arvo-border)', background: 'none', color: 'var(--arvo-red, #D63B2F)', cursor: 'pointer' }}>
                  {ra.delete ?? 'Excluir'}
                </button>
              )}
            </div>
          ))}
        </div>

        <div className="flex items-center gap-2 flex-wrap" style={{ marginTop: 10 }}>
          <input
            value={newLinkLabel}
            onChange={e => setNewLinkLabel(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') createLink(item) }}
            placeholder={ra.linkLabelPlaceholder ?? 'Onde vai usar esse link? Ex: Vídeo custo de vida Paris'}
            style={{ ...input, flex: 1, minWidth: 160, fontSize: 13.5, padding: '6px 10px' }}
          />
          <button onClick={() => createLink(item)} disabled={creatingLink || !newLinkLabel.trim()} style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 12, padding: '6px 14px', borderRadius: 999, border: 'none', background: OCRE, color: '#1a1200', cursor: 'pointer', opacity: (creatingLink || !newLinkLabel.trim()) ? 0.5 : 1, whiteSpace: 'nowrap' }}>
            {ra.generateLink ?? 'Gerar link'}
          </button>
        </div>
      </div>
    )
  }

  if (loading) return <PageLoader />
  if (forbidden) { navigate('/resources'); return null }

  return (
    <div className="space-y-8">
      {editingId !== null ? (
        <section style={{ ...card, padding: 20 }}>
          <div className="flex items-center justify-between gap-3">
            <h2 style={{ fontFamily: 'var(--arvo-font-display)', fontSize: 17, color: 'var(--arvo-fg)', whiteSpace: 'nowrap' }}>
              {editingId === 'new' ? (
                <>
                  <span className="hidden sm:inline">{ra.newResource ?? '+ Novo recurso'}</span>
                  <span className="sm:hidden">{ra.newResourceShort ?? 'Novo recurso'}</span>
                </>
              ) : (
                <>
                  <span className="hidden sm:inline">{ra.editResource ?? 'Editar recurso'}</span>
                  <span className="sm:hidden">{ra.editResourceShort ?? 'Edição'}</span>
                </>
              )}
            </h2>
            <label className="flex items-center gap-2 shrink-0" style={{ cursor: 'pointer' }}>
              <span style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 13, color: 'var(--arvo-fg-soft)' }}>
                {form.is_published ? (ra.publishedYes ?? 'Publicado') : (ra.publishedNo ?? 'Rascunho')}
              </span>
              <Toggle checked={form.is_published} onChange={v => setForm(f => ({ ...f, is_published: v }))} activeColor="var(--arvo-green, #1F8A5B)" />
            </label>
          </div>

          {/* Imagem no topo — é assim que ela aparece no card da listagem,
              então faz sentido ver e ajustar a posição logo de cara. */}
          <FormSection title={ra.sectionCover ?? 'Capa'} first>
            <div>
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
                      style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 12.5, background: 'none', border: 'none', color: 'var(--arvo-fg-soft)', cursor: 'pointer' }}
                    >
                      {uploadingCover ? (ra.uploading ?? 'Enviando...') : (ra.changeCover ?? 'Trocar capa')}
                    </button>
                    <button type="button" onClick={() => setForm(f => ({ ...f, preview_image_url: '', cover_image_position: '50% 50%' }))}
                      style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 12.5, background: 'none', border: 'none', color: 'var(--arvo-red)', cursor: 'pointer' }}
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
                  style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 13, padding: '8px 16px', borderRadius: 8, border: '1px solid var(--arvo-border)', background: 'none', color: 'var(--arvo-fg)', cursor: 'pointer', opacity: uploadingCover ? 0.6 : 1 }}
                >
                  {uploadingCover ? (ra.uploading ?? 'Enviando...') : (ra.uploadCover ?? 'Escolher capa')}
                </button>
              )}
            </div>
          </FormSection>

          <FormSection title={ra.sectionInfo ?? 'Informações'}>
            <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
              <div>
                <label style={label}>{ra.fieldTitle ?? 'Título'}</label>
                <input
                  style={input}
                  value={form.title}
                  onChange={e => {
                    const title = e.target.value
                    setForm(f => ({ ...f, title, slug: slugTouched.current ? f.slug : slugifyTitle(title) }))
                  }}
                />
              </div>
              <div>
                <label style={label}>{ra.fieldSlug ?? 'Slug'}</label>
                <input
                  style={input}
                  value={form.slug}
                  onChange={e => { slugTouched.current = true; setForm(f => ({ ...f, slug: e.target.value.toLowerCase() })) }}
                />
                <p style={{ fontSize: 12, color: 'var(--arvo-fg-soft)', marginTop: 4 }}>{(ra.fieldSlugHint ?? '').replace('{slug}', form.slug || 'seu-slug')}</p>
              </div>
            </div>

            <div>
              <label style={label}>{ra.fieldDescription ?? 'Descrição'}</label>
              <textarea style={{ ...input, minHeight: 110, resize: 'vertical' }} value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
            </div>
          </FormSection>

          <FormSection title={ra.sectionContent ?? 'Conteúdo'}>
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
                    style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 13, padding: '8px 16px', borderRadius: 8, border: '1px solid var(--arvo-border)', background: 'none', color: 'var(--arvo-fg)', cursor: 'pointer', opacity: uploading ? 0.6 : 1 }}
                  >
                    {uploading ? (ra.uploading ?? 'Enviando...') : (ra.uploadFile ?? 'Escolher arquivo')}
                  </button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    style={{ display: 'none' }}
                    onChange={e => { const f = e.target.files?.[0]; if (f) handleFileUpload(f) }}
                  />
                  <span style={{ fontSize: 13, color: form.file_path ? 'var(--arvo-green, #1F8A5B)' : 'var(--arvo-fg-soft)' }}>
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
          </FormSection>

          {/* Links também aqui dentro, não só na listagem — não precisa sair
              do formulário pra gerar/copiar um link enquanto edita. Só depois
              que o recurso já existe (precisa de slug salvo no servidor). */}
          {editingId !== 'new' && (() => {
            const editingItem = items.find(i => i.id === editingId)
            return editingItem ? (
              <FormSection title={ra.manageLinks ?? 'Links'}>
                {renderLinksPanel(editingItem)}
              </FormSection>
            ) : null
          })()}

          {error && <p style={{ fontSize: 13.5, color: 'var(--arvo-red, #D63B2F)', marginTop: 16 }}>{error}</p>}

          <div className="flex items-center gap-3" style={{ borderTop: '1px solid var(--arvo-border-soft)', paddingTop: 20, marginTop: 20 }}>
            <button
              onClick={save}
              disabled={saving}
              style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 13, padding: '9px 20px', borderRadius: 999, border: 'none', background: 'var(--arvo-black)', color: 'var(--arvo-offwhite, #F6F3EC)', cursor: 'pointer', opacity: saving ? 0.6 : 1 }}
            >
              {saving ? (ra.saving ?? 'Salvando...') : (ra.save ?? 'Salvar')}
            </button>
            <button
              onClick={() => setEditingId(null)}
              style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 13, padding: '9px 20px', borderRadius: 999, border: '1px solid var(--arvo-border)', background: 'none', color: 'var(--arvo-fg-soft)', cursor: 'pointer' }}
            >
              {ra.cancel ?? 'Cancelar'}
            </button>
          </div>
        </section>
      ) : (
        <>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {items.map(item => (
            <div key={item.id} className="rounded-[14px] border overflow-hidden" style={{ background: 'var(--arvo-surface)', borderColor: 'var(--arvo-border)' }}>
              <div className="relative" style={{ paddingBottom: '56.25%', background: 'var(--arvo-black)', overflow: 'hidden' }}>
                {item.preview_image_url ? (
                  <img
                    src={item.preview_image_url}
                    alt={item.title}
                    className="absolute inset-0 w-full h-full object-cover"
                    style={{ objectPosition: item.cover_image_position ?? '50% 50%' }}
                  />
                ) : (
                  <div className="absolute inset-0 flex items-center justify-center">
                    <img src="/brand/logo/arvo-symbol-gold.svg" width="24" height="26" alt="" />
                  </div>
                )}
                {/* Status — mesma posição/estilo do badge de status do card de Viagens */}
                <div className="absolute top-3 right-3" style={{
                  display: 'flex', alignItems: 'center', gap: 4,
                  background: 'rgba(13,13,13,0.65)', backdropFilter: 'blur(8px)',
                  padding: '3px 10px', borderRadius: 999,
                  border: `1px solid ${item.is_published ? 'rgba(31,138,91,0.4)' : 'rgba(255,255,255,0.2)'}`,
                }}>
                  {item.is_published && <span style={{ width: 5, height: 5, borderRadius: 999, background: 'var(--arvo-green, #1F8A5B)', display: 'inline-block' }} />}
                  <span style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 9.5, letterSpacing: '0.14em', textTransform: 'uppercase', color: item.is_published ? 'var(--arvo-green, #1F8A5B)' : 'rgba(255,255,255,0.75)' }}>
                    {item.is_published ? (ra.publishedYes ?? 'Publicado') : (ra.publishedNo ?? 'Rascunho')}
                  </span>
                </div>
              </div>

              <div style={{ padding: '14px 16px' }}>
                <div className="flex items-center gap-2">
                  <span className="min-w-0 flex-1 truncate" style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 14, fontWeight: 600, color: 'var(--arvo-fg)' }}>{item.title}</span>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      onClick={() => startEdit(item)}
                      title={ra.editResource ?? 'Editar'}
                      className="p-1.5 text-[var(--arvo-fg-soft)] hover:text-[var(--arvo-fg)] transition-colors rounded-lg hover:bg-[var(--arvo-track-bg)]"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                      </svg>
                    </button>
                    <button
                      onClick={() => remove(item)}
                      disabled={busyId === item.id}
                      title={ra.delete ?? 'Excluir'}
                      className="p-1.5 text-[var(--arvo-fg-soft)] hover:text-red-500 transition-colors rounded-lg hover:bg-red-50"
                      style={{ opacity: busyId === item.id ? 0.5 : 1 }}
                    >
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  </div>
                </div>
                <p className="truncate" style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 12.5, color: 'var(--arvo-fg-soft)', margin: '2px 0 0' }}>/resources/{item.slug}</p>
                <p className="truncate" style={{ fontSize: 12, color: 'var(--arvo-fg-soft)', margin: '6px 0 0' }}>
                  {item.stats.views} {ra.views ?? 'views'} · {item.stats.unlocks} {ra.unlocks ?? 'liberações'} · {item.stats.downloads} {ra.downloads ?? 'downloads'} · {item.stats.signups} {ra.signups ?? 'cadastros'}
                </p>
                {Object.keys(item.stats.by_source ?? {}).length > 0 && (
                  <p className="truncate" style={{ fontSize: 10.5, color: 'var(--arvo-fg-faint, var(--arvo-fg-soft))', margin: '3px 0 0' }}>
                    {(ra.bySource ?? 'Origem:')} {Object.entries(item.stats.by_source)
                      .sort((a, b) => b[1] - a[1])
                      .map(([source, count]) => `${source} (${count})`)
                      .join(' · ')}
                  </p>
                )}

                <div className="flex items-center gap-2 flex-wrap" style={{ marginTop: 12 }}>
                  <button onClick={() => togglePublish(item)} disabled={busyId === item.id} style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 12, padding: '4px 12px', borderRadius: 999, border: `1px solid ${item.is_published ? 'var(--arvo-border)' : OCRE}`, background: item.is_published ? 'none' : 'rgba(232,160,32,0.08)', color: item.is_published ? 'var(--arvo-fg-soft)' : OCRE, cursor: 'pointer', opacity: busyId === item.id ? 0.5 : 1 }}>
                    {item.is_published ? (ra.unpublishAction ?? 'Voltar a rascunho') : (ra.publishAction ?? 'Publicar agora')}
                  </button>
                  <button onClick={() => { setLinksOpenId(linksOpenId === item.id ? null : item.id); setNewLinkLabel('') }} style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 12, padding: '4px 12px', borderRadius: 999, border: `1px solid ${linksOpenId === item.id ? OCRE : 'var(--arvo-border)'}`, background: linksOpenId === item.id ? 'rgba(232,160,32,0.08)' : 'none', color: linksOpenId === item.id ? OCRE : 'var(--arvo-fg-soft)', cursor: 'pointer' }}>
                    {ra.manageLinks ?? 'Links'} {item.links.length > 0 ? `(${item.links.length})` : ''}
                  </button>
                </div>

                {/* Um só lugar pra links: a 1ª linha é sempre a URL crua (sem
                    UTM, "pública"), as seguintes são as geradas com rótulo —
                    resolve a confusão de ter dois botões parecidos. Reaparece
                    dentro do formulário de edição (renderLinksPanel) também. */}
                {linksOpenId === item.id && (
                  <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--arvo-border)' }}>
                    {renderLinksPanel(item)}
                  </div>
                )}
              </div>
            </div>
          ))}
          {items.length === 0 && (
            <p style={{ ...card, fontFamily: 'var(--arvo-font-body)', fontSize: 14, color: 'var(--arvo-fg-soft)', padding: 16 }}>{ra.empty ?? 'Nenhum recurso criado ainda'}</p>
          )}
        </div>

        {/* Viagens como lead magnet (frente B): funil de cada viagem com
            share habilitado — views do gate, cadastros atribuídos e origem
            por campanha. Os links de divulgação se criam no modal
            Compartilhar da viagem, não aqui. */}
        {trips.length > 0 && (
          <section>
            <h2 style={{ fontFamily: 'var(--arvo-font-display)', fontSize: 17, color: 'var(--arvo-fg)' }}>
              {ra.tripsTitle ?? 'Viagens'}
            </h2>
            <p style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 13, color: 'var(--arvo-fg-soft)', margin: '4px 0 0' }}>
              {ra.tripsSubtitle ?? 'Viagens compartilhadas com gate de cadastro. Gere os links de divulgação no modal Compartilhar da viagem.'}
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5" style={{ marginTop: 14 }}>
              {trips.map(trip => (
                <div key={trip.id} className="rounded-[14px] border overflow-hidden" style={{ background: 'var(--arvo-surface)', borderColor: 'var(--arvo-border)' }}>
                  <div className="relative" style={{ paddingBottom: '56.25%', background: 'var(--arvo-black)', overflow: 'hidden' }}>
                    {trip.cover_image_url ? (
                      <img
                        src={trip.cover_image_url}
                        alt={trip.title}
                        className="absolute inset-0 w-full h-full object-cover"
                        style={{ objectPosition: trip.cover_image_position ?? '50% 50%' }}
                      />
                    ) : (
                      <div className="absolute inset-0 flex items-center justify-center">
                        <img src="/brand/logo/arvo-symbol-gold.svg" width="24" height="26" alt="" />
                      </div>
                    )}
                  </div>

                  <div style={{ padding: '14px 16px' }}>
                    <div className="flex items-center gap-2">
                      <span className="min-w-0 flex-1 truncate" style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 14, fontWeight: 600, color: 'var(--arvo-fg)' }}>{trip.title}</span>
                      <a
                        href={`/voyage/${trip.id}`}
                        title={ra.tripOpen ?? 'Abrir viagem'}
                        className="p-1.5 shrink-0 text-[var(--arvo-fg-soft)] hover:text-[var(--arvo-fg)] transition-colors rounded-lg hover:bg-[var(--arvo-track-bg)]"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 13 13" stroke="currentColor" strokeWidth={1.5}>
                          <path strokeLinecap="round" d="M5 2H2a1 1 0 00-1 1v8a1 1 0 001 1h8a1 1 0 001-1V8M8 1h4m0 0v4m0-4L5.5 7.5" />
                        </svg>
                      </a>
                    </div>
                    <p className="truncate" style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 12.5, color: 'var(--arvo-fg-soft)', margin: '2px 0 0' }}>/voyage/shared/{trip.id}</p>
                    <p className="truncate" style={{ fontSize: 12, color: 'var(--arvo-fg-soft)', margin: '6px 0 0' }}>
                      {trip.stats.views} {ra.views ?? 'views'} · {trip.stats.signups} {ra.signups ?? 'cadastros'} · {trip.links.length} {ra.manageLinks ?? 'links'}
                    </p>
                    {Object.keys(trip.stats.by_source ?? {}).length > 0 && (
                      <p className="truncate" style={{ fontSize: 10.5, color: 'var(--arvo-fg-faint, var(--arvo-fg-soft))', margin: '3px 0 0' }}>
                        {(ra.bySource ?? 'Origem:')} {Object.entries(trip.stats.by_source)
                          .sort((a, b) => b[1] - a[1])
                          .map(([source, count]) => `${source} (${count})`)
                          .join(' · ')}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}
        </>
      )}
    </div>
  )
}
