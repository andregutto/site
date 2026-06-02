'use client'

import { useState, useEffect } from 'react'
import { Barlow_Condensed } from 'next/font/google'
import { SQHeader } from '@/components/sq/SQHeader'
import { SQFooter } from '@/components/sq/SQFooter'
import { C, sans } from '@/lib/sq-design'

const barlow = Barlow_Condensed({ weight: ['900'], subsets: ['latin'] })

interface Post {
  id: string; client_id: string; post_date: string
  platform: string; content: string | null; status: string
  sq_clients?: { id: string; name: string }
}

const PLATFORMS = ['instagram', 'facebook', 'google', 'tiktok']
const PLATFORM_LABELS: Record<string, string> = { instagram: 'IG', facebook: 'FB', google: 'GMB', tiktok: 'TT' }
const PLATFORM_COLORS: Record<string, string> = { instagram: '#C13584', facebook: '#1877F2', google: '#4285F4', tiktok: '#010101' }
const STATUS_COLORS: Record<string, string> = { idee: C.muted, a_creer: '#7c5a00', pret: C.ink, publie: '#186040' }
const STATUS_LABELS: Record<string, string> = { idee: 'Idée', a_creer: 'À créer', pret: 'Prêt', publie: 'Publié' }

// Generate a stable color per client from their id
function clientColor(id: string) {
  const palette = ['#2A42A8', '#C13584', '#186040', '#7c5a00', '#8C1A1A', '#4285F4', '#6B4226', '#1D7A8A']
  let hash = 0
  for (let i = 0; i < id.length; i++) hash = id.charCodeAt(i) + ((hash << 5) - hash)
  return palette[Math.abs(hash) % palette.length]
}

export default function GlobalCalendrierPage() {
  const [posts,        setPosts]        = useState<Post[]>([])
  const [clients,      setClients]      = useState<{ id: string; name: string }[]>([])
  const [month,        setMonth]        = useState(new Date().toISOString().slice(0, 7))
  const [filterClient, setFilterClient] = useState<string>('all')
  const [filterPlatform, setFilterPlatform] = useState<string>('all')
  const [loading,      setLoading]      = useState(true)

  // Load clients list
  useEffect(() => {
    fetch('/api/sq/clients').then(r => r.json()).then(d => {
      setClients((d.clients ?? []).map((c: any) => ({ id: c.id, name: c.name })))
    })
  }, [])

  // Load posts for month
  useEffect(() => {
    setLoading(true)
    const params = new URLSearchParams({ month })
    if (filterClient !== 'all') params.set('client_id', filterClient)
    fetch(`/api/sq/calendar?${params}`)
      .then(r => r.json())
      .then(d => setPosts(d.posts ?? []))
      .finally(() => setLoading(false))
  }, [month, filterClient])

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

  const [y, m] = month.split('-').map(Number)
  const firstDay    = new Date(y, m - 1, 1).getDay()
  const daysInMonth = new Date(y, m, 0).getDate()
  const startOffset = firstDay === 0 ? 6 : firstDay - 1
  const monthLabel  = new Date(`${month}-01`).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })

  const visible = posts.filter(p =>
    (filterPlatform === 'all' || p.platform === filterPlatform)
  )

  // Stats
  const total   = visible.length
  const publie  = visible.filter(p => p.status === 'publie').length
  const pending = visible.filter(p => p.status !== 'publie').length
  const byClient = clients.map(c => ({
    ...c,
    count: visible.filter(p => p.client_id === c.id).length,
  })).filter(c => c.count > 0)

  return (
    <div style={{ background: C.paper, minHeight: '100vh', fontFamily: sans }}>
      <SQHeader />
      <main style={{ maxWidth: 1300, margin: '0 auto', padding: '40px 48px 96px' }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 32, flexWrap: 'wrap', gap: 16 }}>
          <div>
            <h1 className={barlow.className} style={{ fontWeight: 900, textTransform: 'uppercase', fontSize: 36, color: C.ink, margin: '0 0 4px' }}>
              Calendrier éditorial
            </h1>
            <p style={{ fontFamily: sans, fontSize: 12, color: C.muted, margin: 0, textTransform: 'capitalize' }}>Tous les clients · {monthLabel}</p>
          </div>
          {/* Month nav */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button onClick={prevMonth} style={{ fontFamily: sans, fontSize: 16, background: 'transparent', border: `0.5px solid ${C.muted}`, cursor: 'pointer', color: C.muted, padding: '6px 12px', borderRadius: 0 }}>‹</button>
            <span style={{ fontFamily: sans, fontSize: 13, fontWeight: 600, color: C.ink, minWidth: 140, textAlign: 'center', textTransform: 'capitalize' }}>{monthLabel}</span>
            <button onClick={nextMonth} style={{ fontFamily: sans, fontSize: 16, background: 'transparent', border: `0.5px solid ${C.muted}`, cursor: 'pointer', color: C.muted, padding: '6px 12px', borderRadius: 0 }}>›</button>
          </div>
        </div>

        {/* Stats strip */}
        <div style={{ display: 'flex', gap: 0, border: `0.5px solid ${C.ink}`, marginBottom: 28 }}>
          {[
            { label: 'Posts ce mois', val: total },
            { label: 'Publiés', val: publie },
            { label: 'En cours', val: pending },
            { label: 'Clients actifs', val: byClient.length },
          ].map(({ label, val }, i) => (
            <div key={label} style={{ flex: 1, padding: '14px 20px', borderRight: i < 3 ? `0.5px solid ${C.ink}` : 'none' }}>
              <div style={{ fontFamily: sans, fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.2em', color: C.muted, marginBottom: 4 }}>{label}</div>
              <div style={{ fontFamily: sans, fontSize: 24, fontWeight: 700, color: C.ink }}>{val}</div>
            </div>
          ))}
        </div>

        {/* Filters */}
        <div style={{ display: 'flex', gap: 12, marginBottom: 24, flexWrap: 'wrap', alignItems: 'center' }}>
          {/* Client filter */}
          <div style={{ display: 'flex', gap: 0 }}>
            <button onClick={() => setFilterClient('all')}
              style={{ fontFamily: sans, fontSize: 11, padding: '6px 12px', border: `0.5px solid ${C.ink}`, background: filterClient === 'all' ? C.ink : 'transparent', color: filterClient === 'all' ? C.paper : C.muted, cursor: 'pointer', borderRadius: 0 }}>
              Tous
            </button>
            {clients.map((c, i) => (
              <button key={c.id} onClick={() => setFilterClient(c.id)}
                style={{ fontFamily: sans, fontSize: 11, padding: '6px 12px', border: `0.5px solid ${C.ink}`, borderLeft: 'none', background: filterClient === c.id ? clientColor(c.id) : 'transparent', color: filterClient === c.id ? C.paper : C.muted, cursor: 'pointer', borderRadius: 0 }}>
                {c.name}
              </button>
            ))}
          </div>

          <div style={{ width: 1, height: 28, background: `rgba(28,25,23,0.15)` }} />

          {/* Platform filter */}
          <div style={{ display: 'flex', gap: 0 }}>
            <button onClick={() => setFilterPlatform('all')}
              style={{ fontFamily: sans, fontSize: 11, padding: '6px 10px', border: `0.5px solid ${C.ink}`, background: filterPlatform === 'all' ? C.ink : 'transparent', color: filterPlatform === 'all' ? C.paper : C.muted, cursor: 'pointer', borderRadius: 0 }}>
              Toutes
            </button>
            {PLATFORMS.map(p => (
              <button key={p} onClick={() => setFilterPlatform(p)}
                style={{ fontFamily: sans, fontSize: 11, padding: '6px 10px', border: `0.5px solid ${C.ink}`, borderLeft: 'none', background: filterPlatform === p ? PLATFORM_COLORS[p] : 'transparent', color: filterPlatform === p ? C.paper : C.muted, cursor: 'pointer', borderRadius: 0 }}>
                {PLATFORM_LABELS[p]}
              </button>
            ))}
          </div>
        </div>

        {/* Client color legend */}
        {filterClient === 'all' && byClient.length > 0 && (
          <div style={{ display: 'flex', gap: 16, marginBottom: 20, flexWrap: 'wrap' }}>
            {byClient.map(c => (
              <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <div style={{ width: 10, height: 10, background: clientColor(c.id), borderRadius: '50%' }} />
                <span style={{ fontFamily: sans, fontSize: 11, color: C.muted }}>{c.name} ({c.count})</span>
              </div>
            ))}
          </div>
        )}

        {/* Calendar grid */}
        {loading ? (
          <div style={{ textAlign: 'center', padding: 60 }}><span style={{ fontFamily: sans, fontSize: 13, color: C.muted }}>Chargement…</span></div>
        ) : (
          <div>
            {/* Day headers */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 1, marginBottom: 1 }}>
              {['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'].map(d => (
                <div key={d} style={{ fontFamily: sans, fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.2em', color: C.muted, textAlign: 'center', padding: '6px 0' }}>{d}</div>
              ))}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 1, background: `rgba(28,25,23,0.1)` }}>
              {Array.from({ length: startOffset }).map((_, i) => (
                <div key={`off-${i}`} style={{ background: C.warm, minHeight: 90 }} />
              ))}
              {Array.from({ length: daysInMonth }).map((_, i) => {
                const day     = i + 1
                const dateStr = `${month}-${String(day).padStart(2, '0')}`
                const dayPosts = visible.filter(p => p.post_date === dateStr)
                const isToday  = dateStr === new Date().toISOString().slice(0, 10)
                return (
                  <div key={day} style={{ background: C.paper, minHeight: 90, padding: 6, position: 'relative' }}>
                    <div style={{ fontFamily: sans, fontSize: 11, fontWeight: isToday ? 700 : 400, color: isToday ? C.accent : C.muted, marginBottom: 4 }}>
                      {isToday
                        ? <span style={{ background: C.accent, color: C.paper, borderRadius: '50%', width: 18, height: 18, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 10 }}>{day}</span>
                        : day}
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                      {dayPosts.map(p => {
                        const color = filterClient === 'all' ? clientColor(p.client_id) : PLATFORM_COLORS[p.platform]
                        const clientName = p.sq_clients?.name ?? ''
                        return (
                          <a key={p.id}
                            href={`/tools/clients/${p.client_id}/calendrier`}
                            style={{ background: color + '18', borderLeft: `2px solid ${color}`, padding: '2px 5px', textDecoration: 'none', display: 'block' }}
                            title={`${clientName} · ${PLATFORM_LABELS[p.platform]} · ${STATUS_LABELS[p.status]}`}>
                            <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                              {filterClient === 'all' && <span style={{ fontFamily: sans, fontSize: 8, fontWeight: 700, color }}>
                                {clientName.split(' ')[0]}
                              </span>}
                              <span style={{ fontFamily: sans, fontSize: 8, color: PLATFORM_COLORS[p.platform] }}>{PLATFORM_LABELS[p.platform]}</span>
                              <span style={{ fontFamily: sans, fontSize: 7, color: STATUS_COLORS[p.status], marginLeft: 'auto' }}>●</span>
                            </div>
                            {p.content && (
                              <p style={{ fontFamily: sans, fontSize: 9, color: C.ink, margin: 0, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>{p.content}</p>
                            )}
                          </a>
                        )
                      })}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* List view */}
        {visible.length > 0 && (
          <div style={{ marginTop: 48 }}>
            <div style={{ fontFamily: sans, textTransform: 'uppercase', letterSpacing: '0.14em', fontSize: 11, color: C.ink, marginBottom: 16 }}>
              Liste — {visible.length} post{visible.length > 1 ? 's' : ''}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {[...visible].sort((a, b) => a.post_date.localeCompare(b.post_date)).map(p => {
                const color      = clientColor(p.client_id)
                const clientName = p.sq_clients?.name ?? p.client_id
                return (
                  <a key={p.id} href={`/tools/clients/${p.client_id}/calendrier`}
                    style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '10px 16px', border: `0.5px solid rgba(28,25,23,0.12)`, textDecoration: 'none' }}
                    onMouseEnter={e => (e.currentTarget.style.borderColor = C.ink)}
                    onMouseLeave={e => (e.currentTarget.style.borderColor = 'rgba(28,25,23,0.12)')}>
                    <span style={{ fontFamily: sans, fontSize: 12, color: C.muted, minWidth: 28 }}>{new Date(p.post_date + 'T00:00:00').getDate()}</span>
                    <div style={{ width: 8, height: 8, background: color, borderRadius: '50%', flexShrink: 0 }} />
                    <span style={{ fontFamily: sans, fontSize: 12, color: C.ink, minWidth: 120, fontWeight: 600 }}>{clientName}</span>
                    <span style={{ fontFamily: sans, fontSize: 11, color: PLATFORM_COLORS[p.platform], minWidth: 60 }}>{PLATFORM_LABELS[p.platform]}</span>
                    <span style={{ fontFamily: sans, fontSize: 12, color: C.ink, flex: 1 }}>{p.content || '—'}</span>
                    <span style={{ fontFamily: sans, fontSize: 10, fontWeight: 600, color: STATUS_COLORS[p.status], textTransform: 'uppercase', letterSpacing: '0.1em' }}>
                      {STATUS_LABELS[p.status]}
                    </span>
                  </a>
                )
              })}
            </div>
          </div>
        )}

        {visible.length === 0 && !loading && (
          <div style={{ textAlign: 'center', padding: '60px 0' }}>
            <p style={{ fontFamily: sans, fontSize: 14, color: C.muted }}>Aucun post planifié pour ce mois.</p>
          </div>
        )}

      </main>
      <SQFooter />
    </div>
  )
}
