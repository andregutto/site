'use client'

import { useState, useEffect, use } from 'react'
import { Barlow_Condensed } from 'next/font/google'
import { C, sans } from '@/lib/sq-design'

const barlow = Barlow_Condensed({ weight: ['900'], subsets: ['latin'] })

interface Post {
  id: string; client_id: string; post_date: string
  platform: string; content: string | null; status: string; created_at: string
}

const PLATFORMS = ['instagram', 'facebook', 'google', 'tiktok']
const PLATFORM_LABELS: Record<string, string> = { instagram: 'Instagram', facebook: 'Facebook', google: 'Google', tiktok: 'TikTok' }
const PLATFORM_COLORS: Record<string, string> = { instagram: '#C13584', facebook: '#1877F2', google: '#4285F4', tiktok: '#010101' }
const STATUS_OPTS = ['idee', 'a_creer', 'pret', 'publie']
const STATUS_LABELS: Record<string, string> = { idee: 'Idée', a_creer: 'À créer', pret: 'Prêt', publie: 'Publié' }
const STATUS_COLORS: Record<string, string> = { idee: C.muted, a_creer: '#7c5a00', pret: C.ink, publie: '#186040' }

function PostModal({ post, date, clientId, onSave, onDelete, onClose }: {
  post?: Post; date?: string; clientId: string
  onSave: (p: Post) => void; onDelete?: () => void; onClose: () => void
}) {
  const [platform, setPlatform] = useState(post?.platform ?? 'instagram')
  const [content,  setContent]  = useState(post?.content ?? '')
  const [status,   setStatus]   = useState(post?.status ?? 'idee')
  const [postDate, setPostDate] = useState(post?.post_date ?? date ?? '')
  const [saving,   setSaving]   = useState(false)

  async function save() {
    setSaving(true)
    const payload = { client_id: clientId, post_date: postDate, platform, content: content || null, status }
    const url  = post?.id ? `/api/sq/calendar/${post.id}` : '/api/sq/calendar'
    const meth = post?.id ? 'PATCH' : 'POST'
    const res  = await fetch(url, { method: meth, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
    const data = await res.json()
    if (data.post) onSave(data.post)
    setSaving(false)
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(28,25,23,0.5)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div style={{ background: C.paper, border: `0.5px solid ${C.ink}`, padding: 28, width: 480, maxWidth: '90vw' }}>
        <div style={{ fontFamily: sans, textTransform: 'uppercase', letterSpacing: '0.18em', fontSize: 10, color: C.muted, marginBottom: 20 }}>
          {post ? 'Modifier le post' : 'Nouveau post'}
        </div>

        {/* Date */}
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontFamily: sans, fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.2em', color: C.muted, marginBottom: 4 }}>Date</div>
          <input type="date" value={postDate} onChange={e => setPostDate(e.target.value)}
            style={{ fontFamily: sans, fontSize: 13, color: C.ink, background: 'transparent', border: 'none', borderBottom: `0.5px solid ${C.ink}`, outline: 'none', padding: '2px 0' }} />
        </div>

        {/* Platform */}
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontFamily: sans, fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.2em', color: C.muted, marginBottom: 8 }}>Plateforme</div>
          <div style={{ display: 'flex', gap: 0 }}>
            {PLATFORMS.map((p, i) => (
              <button key={p} onClick={() => setPlatform(p)}
                style={{ fontFamily: sans, fontSize: 11, padding: '6px 12px', border: `0.5px solid ${C.ink}`, borderLeft: i === 0 ? undefined : 'none', background: platform === p ? PLATFORM_COLORS[p] : 'transparent', color: platform === p ? C.paper : C.ink, cursor: 'pointer', borderRadius: 0 }}>
                {PLATFORM_LABELS[p]}
              </button>
            ))}
          </div>
        </div>

        {/* Status */}
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontFamily: sans, fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.2em', color: C.muted, marginBottom: 8 }}>Statut</div>
          <div style={{ display: 'flex', gap: 0 }}>
            {STATUS_OPTS.map((s, i) => (
              <button key={s} onClick={() => setStatus(s)}
                style={{ fontFamily: sans, fontSize: 11, padding: '6px 10px', border: `0.5px solid ${C.ink}`, borderLeft: i === 0 ? undefined : 'none', background: status === s ? C.ink : 'transparent', color: status === s ? C.paper : C.muted, cursor: 'pointer', borderRadius: 0 }}>
                {STATUS_LABELS[s]}
              </button>
            ))}
          </div>
        </div>

        {/* Content */}
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontFamily: sans, fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.2em', color: C.muted, marginBottom: 4 }}>Contenu / Idée</div>
          <textarea value={content} onChange={e => setContent(e.target.value)} rows={4} placeholder="Décrire l'idée, le texte, les visuels nécessaires…"
            style={{ width: '100%', fontFamily: sans, fontSize: 13, color: C.ink, background: 'transparent', border: 'none', borderBottom: `0.5px solid rgba(28,25,23,0.3)`, outline: 'none', resize: 'vertical', padding: '4px 0', boxSizing: 'border-box' }} />
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            {post && onDelete && (
              <button onClick={onDelete} style={{ fontFamily: sans, fontSize: 11, padding: '8px 12px', border: `0.5px solid ${C.muted}`, background: 'transparent', color: C.muted, cursor: 'pointer', borderRadius: 0 }}>Supprimer</button>
            )}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={onClose} style={{ fontFamily: sans, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.1em', padding: '8px 16px', border: `0.5px solid ${C.muted}`, background: 'transparent', color: C.muted, cursor: 'pointer', borderRadius: 0 }}>Annuler</button>
            <button onClick={save} disabled={saving || !postDate} style={{ fontFamily: sans, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.1em', padding: '8px 20px', border: 'none', background: C.ink, color: C.paper, cursor: 'pointer', borderRadius: 0, opacity: (!postDate || saving) ? 0.5 : 1 }}>
              {saving ? '…' : 'Sauvegarder'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function CalendrierPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const [client,  setClient]  = useState<any>(null)
  const [posts,   setPosts]   = useState<Post[]>([])
  const [month,   setMonth]   = useState(new Date().toISOString().slice(0, 7))
  const [loading, setLoading] = useState(true)
  const [modal,   setModal]   = useState<{ post?: Post; date?: string } | null>(null)

  useEffect(() => {
    fetch(`/api/sq/clients/${id}`).then(r => r.json()).then(d => setClient(d.client))
  }, [id])

  useEffect(() => {
    setLoading(true)
    fetch(`/api/sq/calendar?client_id=${id}&month=${month}`)
      .then(r => r.json())
      .then(d => setPosts(d.posts ?? []))
      .finally(() => setLoading(false))
  }, [id, month])

  function prevMonth() {
    const [y, m] = month.split('-').map(Number)
    const d = new Date(y, m - 2, 1)
    setMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
  }
  function nextMonth() {
    const [y, m] = month.split('-').map(Number)
    const d = new Date(y, m, 1)
    setMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
  }

  // Build calendar grid
  const [y, m] = month.split('-').map(Number)
  const firstDay = new Date(y, m - 1, 1).getDay() // 0=Sun
  const daysInMonth = new Date(y, m, 0).getDate()
  const startOffset = firstDay === 0 ? 6 : firstDay - 1 // Mon=0

  const monthLabel = new Date(`${month}-01`).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })

  const stats = {
    total:   posts.length,
    publie:  posts.filter(p => p.status === 'publie').length,
    pret:    posts.filter(p => p.status === 'pret').length,
    a_creer: posts.filter(p => p.status === 'a_creer').length,
  }

  return (
    <div style={{ background: C.paper, minHeight: '100vh', fontFamily: sans }}>
      {modal && (
        <PostModal
          post={modal.post}
          date={modal.date}
          clientId={id}
          onClose={() => setModal(null)}
          onSave={p => {
            setPosts(prev => {
              const idx = prev.findIndex(x => x.id === p.id)
              if (idx >= 0) { const next = [...prev]; next[idx] = p; return next }
              return [...prev, p]
            })
            setModal(null)
          }}
          onDelete={modal.post ? async () => {
            await fetch(`/api/sq/calendar/${modal.post!.id}`, { method: 'DELETE' })
            setPosts(prev => prev.filter(p => p.id !== modal.post!.id))
            setModal(null)
          } : undefined}
        />
      )}

      {/* Toolbar */}
      <div style={{ position: 'sticky', top: 0, zIndex: 50, background: C.warm, borderBottom: `0.5px solid ${C.ink}`, padding: '10px 32px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <a href={`/tools/clients/${id}`} style={{ fontFamily: sans, fontSize: 12, color: C.muted, textDecoration: 'none' }}>← {client?.name ?? 'Dossier'}</a>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button onClick={prevMonth} style={{ fontFamily: sans, fontSize: 13, background: 'transparent', border: 'none', cursor: 'pointer', color: C.muted, padding: '4px 8px' }}>‹</button>
          <span style={{ fontFamily: sans, fontSize: 13, fontWeight: 600, color: C.ink, minWidth: 140, textAlign: 'center', textTransform: 'capitalize' }}>{monthLabel}</span>
          <button onClick={nextMonth} style={{ fontFamily: sans, fontSize: 13, background: 'transparent', border: 'none', cursor: 'pointer', color: C.muted, padding: '4px 8px' }}>›</button>
        </div>
        <button onClick={() => setModal({})} style={{ fontFamily: sans, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.12em', padding: '6px 16px', border: `0.5px solid ${C.ink}`, background: 'transparent', color: C.ink, cursor: 'pointer', borderRadius: 0 }}>+ Ajouter un post</button>
      </div>

      <main style={{ maxWidth: 1100, margin: '0 auto', padding: '40px 48px 96px' }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 32 }}>
          <div>
            <h1 className={barlow.className} style={{ fontWeight: 900, textTransform: 'uppercase', fontSize: 32, color: C.ink, margin: '0 0 4px' }}>{client?.name}</h1>
            <p style={{ fontFamily: sans, fontSize: 12, color: C.muted, margin: 0, textTransform: 'capitalize' }}>Calendrier éditorial · {monthLabel}</p>
          </div>
          {/* Stats */}
          <div style={{ display: 'flex', gap: 0, border: `0.5px solid ${C.ink}` }}>
            {[
              { label: 'Total', val: stats.total },
              { label: 'Publiés', val: stats.publie },
              { label: 'Prêts', val: stats.pret },
              { label: 'À créer', val: stats.a_creer },
            ].map(({ label, val }, i) => (
              <div key={label} style={{ padding: '10px 16px', borderRight: i < 3 ? `0.5px solid ${C.ink}` : 'none' }}>
                <div style={{ fontFamily: sans, fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.2em', color: C.muted, marginBottom: 4 }}>{label}</div>
                <div style={{ fontFamily: sans, fontSize: 20, fontWeight: 700, color: C.ink }}>{val}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Platform legend */}
        <div style={{ display: 'flex', gap: 16, marginBottom: 24 }}>
          {PLATFORMS.map(p => (
            <div key={p} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <div style={{ width: 8, height: 8, background: PLATFORM_COLORS[p], borderRadius: '50%' }} />
              <span style={{ fontFamily: sans, fontSize: 11, color: C.muted }}>{PLATFORM_LABELS[p]}</span>
            </div>
          ))}
        </div>

        {/* Calendar grid */}
        {loading ? (
          <div style={{ textAlign: 'center', padding: 40 }}><span style={{ fontFamily: sans, fontSize: 13, color: C.muted }}>Chargement…</span></div>
        ) : (
          <div>
            {/* Day headers */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 1, marginBottom: 1 }}>
              {['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'].map(d => (
                <div key={d} style={{ fontFamily: sans, fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.2em', color: C.muted, textAlign: 'center', padding: '6px 0' }}>{d}</div>
              ))}
            </div>
            {/* Day cells */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 1, background: `rgba(28,25,23,0.1)` }}>
              {/* Offset cells */}
              {Array.from({ length: startOffset }).map((_, i) => (
                <div key={`offset-${i}`} style={{ background: C.warm, minHeight: 100 }} />
              ))}
              {/* Day cells */}
              {Array.from({ length: daysInMonth }).map((_, i) => {
                const day = i + 1
                const dateStr = `${month}-${String(day).padStart(2, '0')}`
                const dayPosts = posts.filter(p => p.post_date === dateStr)
                const isToday = dateStr === new Date().toISOString().slice(0, 10)
                return (
                  <div key={day}
                    onClick={() => setModal({ date: dateStr })}
                    style={{ background: C.paper, minHeight: 100, padding: 8, cursor: 'pointer', position: 'relative' }}
                    onMouseEnter={e => (e.currentTarget.style.background = C.warm)}
                    onMouseLeave={e => (e.currentTarget.style.background = C.paper)}>
                    <div style={{ fontFamily: sans, fontSize: 12, fontWeight: isToday ? 700 : 400, color: isToday ? C.accent : C.muted, marginBottom: 4 }}>
                      {isToday ? <span style={{ background: C.accent, color: C.paper, borderRadius: '50%', width: 20, height: 20, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>{day}</span> : day}
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                      {dayPosts.map(p => (
                        <div key={p.id}
                          onClick={e => { e.stopPropagation(); setModal({ post: p }) }}
                          style={{ background: PLATFORM_COLORS[p.platform] + '18', borderLeft: `2px solid ${PLATFORM_COLORS[p.platform]}`, padding: '3px 6px', cursor: 'pointer' }}>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 4 }}>
                            <span style={{ fontFamily: sans, fontSize: 9, fontWeight: 600, color: PLATFORM_COLORS[p.platform] }}>{PLATFORM_LABELS[p.platform]}</span>
                            <span style={{ fontFamily: sans, fontSize: 8, color: STATUS_COLORS[p.status] }}>●</span>
                          </div>
                          {p.content && <p style={{ fontFamily: sans, fontSize: 10, color: C.ink, margin: 0, lineHeight: 1.3, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' as any }}>{p.content}</p>}
                        </div>
                      ))}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* List view below calendar */}
        {posts.length > 0 && (
          <div style={{ marginTop: 48 }}>
            <div style={{ fontFamily: sans, textTransform: 'uppercase', letterSpacing: '0.14em', fontSize: 11, color: C.ink, marginBottom: 16 }}>Liste des posts</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {posts.sort((a, b) => a.post_date.localeCompare(b.post_date)).map(p => (
                <div key={p.id} onClick={() => setModal({ post: p })}
                  style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '12px 16px', border: `0.5px solid rgba(28,25,23,0.15)`, cursor: 'pointer' }}
                  onMouseEnter={e => (e.currentTarget.style.borderColor = C.ink)}
                  onMouseLeave={e => (e.currentTarget.style.borderColor = 'rgba(28,25,23,0.15)')}>
                  <span style={{ fontFamily: sans, fontSize: 12, color: C.muted, minWidth: 32 }}>{new Date(p.post_date + 'T00:00:00').getDate()}</span>
                  <div style={{ width: 8, height: 8, background: PLATFORM_COLORS[p.platform], borderRadius: '50%', flexShrink: 0 }} />
                  <span style={{ fontFamily: sans, fontSize: 12, color: C.muted, minWidth: 80 }}>{PLATFORM_LABELS[p.platform]}</span>
                  <span style={{ fontFamily: sans, fontSize: 13, color: C.ink, flex: 1 }}>{p.content || '—'}</span>
                  <span style={{ fontFamily: sans, fontSize: 11, fontWeight: 600, color: STATUS_COLORS[p.status], textTransform: 'uppercase', letterSpacing: '0.1em' }}>{STATUS_LABELS[p.status]}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </main>
    </div>
  )
}
