import { useEffect, useState, useRef } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { apiFetch } from '../lib/api'
import { supabase } from '../lib/supabase'
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
  visibility: 'free' | 'paid'
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
  visibility: 'free' | 'paid'
  kit_tag: string
  is_published: boolean
}

const emptyForm: FormState = {
  slug: '', title: '', description: '', resource_type: 'file', file_path: '',
  external_url: '', content_md: '', preview_image_url: '', visibility: 'free',
  kit_tag: '', is_published: false,
}

const card: React.CSSProperties = { background: 'var(--arvo-surface)', border: '1px solid var(--arvo-border)', borderRadius: 12 }
const label: React.CSSProperties = { fontFamily: 'var(--arvo-font-body)', fontSize: 11.5, color: 'var(--arvo-fg-soft)', letterSpacing: '0.04em', display: 'block', marginBottom: 5 }
const input: React.CSSProperties = { fontFamily: 'var(--arvo-font-body)', fontSize: 13.5, padding: '8px 12px', border: '1px solid var(--arvo-border)', borderRadius: 8, background: 'var(--arvo-bg)', color: 'var(--arvo-fg)', width: '100%', boxSizing: 'border-box' }

export default function ResourcesAdminPage() {
  const { t } = useI18n()
  const ra = (t as any).resources?.admin ?? {}
  const navigate = useNavigate()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [loading, setLoading] = useState(true)
  const [forbidden, setForbidden] = useState(false)
  const [items, setItems] = useState<ResourceRow[]>([])
  const [editingId, setEditingId] = useState<number | 'new' | null>(null)
  const [form, setForm] = useState<FormState>(emptyForm)
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
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

  function startEdit(item: ResourceRow) {
    setForm({
      slug: item.slug, title: item.title, description: item.description ?? '',
      resource_type: item.resource_type, file_path: item.file_path ?? '',
      external_url: item.external_url ?? '', content_md: item.content_md ?? '',
      preview_image_url: item.preview_image_url ?? '', visibility: item.visibility,
      kit_tag: item.kit_tag ?? '', is_published: item.is_published,
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
    } finally {
      setBusyId(null)
    }
  }

  function copyLink(slug: string) {
    const url = `${window.location.origin}/recursos/${slug}`
    navigator.clipboard.writeText(url).then(() => {
      setCopiedSlug(slug)
      setTimeout(() => setCopiedSlug(null), 1800)
    })
  }

  if (loading) return <PageLoader />
  if (forbidden) { navigate('/recursos'); return null }

  return (
    <div className="space-y-8">
      <div>
        <Link to="/recursos" style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 12, color: 'var(--arvo-fg-soft)', textDecoration: 'none' }}>
          ← {ra.back ?? 'Voltar para Recursos'}
        </Link>
        <div className="flex items-center justify-between gap-3" style={{ marginTop: 14 }}>
          <div>
            <div style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 11, letterSpacing: '0.16em', textTransform: 'uppercase', color: OCRE, marginBottom: 6 }}>
              {ra.eyebrow ?? 'ADMINISTRAÇÃO'}
            </div>
            <h1 style={{ fontFamily: 'var(--arvo-font-display)', fontSize: 26, color: 'var(--arvo-fg)' }}>{ra.title ?? 'Administrar Recursos'}</h1>
          </div>
          {editingId === null && (
            <button
              onClick={startCreate}
              style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 12, padding: '8px 18px', borderRadius: 999, border: 'none', background: OCRE, color: '#1a1200', cursor: 'pointer', whiteSpace: 'nowrap' }}
            >
              {ra.newResource ?? '+ Novo recurso'}
            </button>
          )}
        </div>
      </div>

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
                <option value="paid">{ra.visibilityPaid ?? 'Membros (em breve)'}</option>
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

          <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
            <div>
              <label style={label}>{ra.fieldPreviewImage ?? 'Imagem de capa (URL)'}</label>
              <input style={input} value={form.preview_image_url} onChange={e => setForm(f => ({ ...f, preview_image_url: e.target.value }))} placeholder="https://..." />
            </div>
            <div>
              <label style={label}>{ra.fieldKitTag ?? 'Tag do Kit'}</label>
              <input style={input} value={form.kit_tag} onChange={e => setForm(f => ({ ...f, kit_tag: e.target.value }))} />
            </div>
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
        <section style={card}>
          {items.map(item => (
            <div key={item.id} style={{ padding: '14px 16px', borderBottom: '1px solid var(--arvo-border-soft, var(--arvo-border))' }}>
              <div className="flex items-center gap-3 flex-wrap">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 14, fontWeight: 600, color: 'var(--arvo-fg)' }}>{item.title}</span>
                    <span style={{ fontSize: 10, letterSpacing: '0.08em', textTransform: 'uppercase', color: item.is_published ? 'var(--arvo-green, #1F8A5B)' : 'var(--arvo-fg-faint)' }}>
                      {item.is_published ? (ra.publishedYes ?? 'Publicado').split(' ')[0] : (ra.publishedNo ?? 'Rascunho').split(' ')[0]}
                    </span>
                  </div>
                  <span style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 11.5, color: 'var(--arvo-fg-soft)' }}>/recursos/{item.slug}</span>
                </div>
                <div style={{ fontSize: 11, color: 'var(--arvo-fg-soft)', whiteSpace: 'nowrap' }}>
                  {item.stats.views} {ra.views ?? 'views'} · {item.stats.unlocks} {ra.unlocks ?? 'liberações'} · {item.stats.downloads} {ra.downloads ?? 'downloads'} · {item.stats.signups} {ra.signups ?? 'cadastros'}
                </div>
              </div>
              <div className="flex items-center gap-2 flex-wrap" style={{ marginTop: 10 }}>
                <button onClick={() => copyLink(item.slug)} style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 11, padding: '4px 12px', borderRadius: 999, border: '1px solid var(--arvo-border)', background: 'none', color: 'var(--arvo-fg-soft)', cursor: 'pointer' }}>
                  {copiedSlug === item.slug ? (ra.linkCopied ?? 'Link copiado!') : (ra.copyLink ?? 'Copiar link público')}
                </button>
                <button onClick={() => startEdit(item)} style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 11, padding: '4px 12px', borderRadius: 999, border: '1px solid var(--arvo-border)', background: 'none', color: 'var(--arvo-fg-soft)', cursor: 'pointer' }}>
                  {ra.editResource ?? 'Editar'}
                </button>
                <button onClick={() => togglePublish(item)} disabled={busyId === item.id} style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 11, padding: '4px 12px', borderRadius: 999, border: `1px solid ${item.is_published ? 'var(--arvo-border)' : OCRE}`, background: item.is_published ? 'none' : 'rgba(232,160,32,0.08)', color: item.is_published ? 'var(--arvo-fg-soft)' : OCRE, cursor: 'pointer', opacity: busyId === item.id ? 0.5 : 1 }}>
                  {item.is_published ? (ra.publishedNo ?? 'Rascunho').split(' ')[0] : (ra.publishedYes ?? 'Publicar').split(' ')[0]}
                </button>
                <button onClick={() => remove(item)} disabled={busyId === item.id} style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 11, padding: '4px 12px', borderRadius: 999, border: '1px solid var(--arvo-border)', background: 'none', color: 'var(--arvo-red, #D63B2F)', cursor: 'pointer', opacity: busyId === item.id ? 0.5 : 1, marginLeft: 'auto' }}>
                  {ra.delete ?? 'Excluir'}
                </button>
              </div>
            </div>
          ))}
          {items.length === 0 && (
            <p style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 13, color: 'var(--arvo-fg-soft)', padding: 16 }}>{ra.empty ?? 'Nenhum recurso criado ainda'}</p>
          )}
        </section>
      )}
    </div>
  )
}
