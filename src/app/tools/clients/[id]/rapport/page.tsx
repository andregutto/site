'use client'

import { useState, useEffect, use } from 'react'
import { Barlow_Condensed } from 'next/font/google'
import { C, sans } from '@/lib/sq-design'

const barlow = Barlow_Condensed({ weight: ['900'], subsets: ['latin'] })

interface Rapport {
  id?: string; month: string; headline: string; summary: string
  actions_done: string[]; highlights: { title: string; body: string }[]; next_steps: string[]
  created_at?: string
}

interface Event { id: string; type: string; content: string | null; created_at: string }

function buildFromData(month: string, checklist: any, events: Event[], clientName: string): Rapport {
  const items   = checklist?.items ?? []
  const done    = items.filter((i: any) => i.done).map((i: any) => i.task as string)
  const pending = items.filter((i: any) => !i.done).map((i: any) => i.task as string)
  const pct     = items.length > 0 ? Math.round((done.length / items.length) * 100) : 0
  const monthLabel = new Date(`${month}-01`).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })

  const headline = `Rapport ${monthLabel} — ${pct}% des tâches complétées`
  const summary  = pct === 100
    ? `Toutes les tâches du mois ont été réalisées pour ${clientName}.`
    : pct >= 75
    ? `Le mois a été bien rempli pour ${clientName} — ${done.length} tâches sur ${items.length} complétées.`
    : `Ce mois-ci, ${done.length} tâches sur ${items.length} ont été réalisées pour ${clientName}.`

  const actions_done = done.slice(0, 8)

  const highlights: { title: string; body: string }[] = events.slice(0, 3).map(e => ({
    title: e.type.charAt(0).toUpperCase() + e.type.slice(1),
    body:  e.content ?? '',
  }))

  const next_steps = pending.slice(0, 3)

  return { month, headline, summary, actions_done, highlights, next_steps }
}

export default function RapportPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const today  = new Date().toISOString().slice(0, 7)

  const [client,    setClient]    = useState<any>(null)
  const [rapport,   setRapport]   = useState<Rapport | null>(null)
  const [history,   setHistory]   = useState<(Rapport & { id: string; created_at: string })[]>([])
  const [month,     setMonth]     = useState(today)
  const [loading,   setLoading]   = useState(true)
  const [saving,    setSaving]    = useState(false)
  const [saved,     setSaved]     = useState(false)
  const [checklist, setChecklist] = useState<any>(null)
  const [events,    setEvents]    = useState<Event[]>([])
  // Editable fields
  const [headline,    setHeadline]    = useState('')
  const [summary,     setSummary]     = useState('')
  const [actionsDone, setActionsDone] = useState<string[]>([])
  const [highlights,  setHighlights]  = useState<{ title: string; body: string }[]>([])
  const [nextSteps,   setNextSteps]   = useState<string[]>([])

  function applyRapport(r: Rapport) {
    setRapport(r)
    setHeadline(r.headline)
    setSummary(r.summary)
    setActionsDone(r.actions_done ?? [])
    setHighlights(r.highlights ?? [])
    setNextSteps(r.next_steps ?? [])
  }

  useEffect(() => {
    Promise.all([
      fetch(`/api/sq/clients/${id}`).then(r => r.json()),
      fetch(`/api/sq/rapports?client_id=${id}`).then(r => r.json()),
    ]).then(([c, r]) => {
      setClient(c.client)
      const saved = r.rapports ?? []
      setHistory(saved)
      if (saved.length > 0) {
        applyRapport(saved[0])
        setMonth(saved[0].month ?? today)
      }
    }).finally(() => setLoading(false))
  }, [id])

  // When month changes, fetch checklist + events for that month
  useEffect(() => {
    const start = `${month}-01T00:00:00Z`
    const [y, m] = month.split('-').map(Number)
    const end = new Date(y, m, 0, 23, 59, 59).toISOString()

    Promise.all([
      fetch(`/api/sq/checklists?client_id=${id}&month=${month}`).then(r => r.json()),
      fetch(`/api/sq/clients/${id}/events?after=${start}&before=${end}`).then(r => r.json()).catch(() => ({ events: [] })),
    ]).then(([ck, ev]) => {
      setChecklist(ck.checklist)
      setEvents(ev.events ?? [])
    })
  }, [id, month])

  function autoFill() {
    if (!client) return
    const r = buildFromData(month, checklist, events, client.name)
    applyRapport(r)
  }

  async function saveRapport() {
    setSaving(true)
    const payload = { client_id: id, month, headline, summary, actions_done: actionsDone, highlights, next_steps: nextSteps }
    // Check if one exists for this month already
    const existing = history.find(h => h.month === month)
    let saved: any
    if (existing) {
      const res = await fetch(`/api/sq/rapports`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
      saved = (await res.json()).rapport
    } else {
      const res = await fetch(`/api/sq/rapports`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
      saved = (await res.json()).rapport
    }
    if (saved) {
      setHistory(prev => [saved, ...prev.filter(h => h.id !== saved.id)])
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    }
    setSaving(false)
  }

  const monthLabel = new Date(`${month}-01`).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })
  const checklistItems = checklist?.items ?? []
  const donePct = checklistItems.length > 0
    ? Math.round((checklistItems.filter((i: any) => i.done).length / checklistItems.length) * 100)
    : 0

  if (loading) return (
    <div style={{ background: C.paper, minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <span style={{ fontFamily: sans, fontSize: 13, color: C.muted }}>Chargement…</span>
    </div>
  )

  return (
    <>
      <style>{`
        @media print { .no-print { display: none !important; } body { background: white !important; } @page { margin: 20mm 18mm; } }
        @media screen { .print-page { max-width: 760px; margin: 0 auto; padding: 60px 48px 96px; } }
      `}</style>

      {/* Toolbar */}
      <div className="no-print" style={{ position: 'fixed', top: 0, left: 0, right: 0, zIndex: 100, background: C.warm, borderBottom: `0.5px solid ${C.ink}`, padding: '10px 32px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
          <a href={`/tools/clients/${id}`} style={{ fontFamily: sans, fontSize: 12, color: C.muted, textDecoration: 'none' }}>← {client?.name ?? 'Dossier'}</a>
          <input type="month" value={month} onChange={e => setMonth(e.target.value)}
            style={{ fontFamily: sans, fontSize: 12, color: C.ink, background: 'transparent', border: 'none', borderBottom: `0.5px solid ${C.muted}`, outline: 'none', padding: '2px 4px', cursor: 'pointer' }} />
          {history.length > 1 && (
            <select onChange={e => { const r = history.find(h => h.id === e.target.value); if (r) { applyRapport(r); setMonth(r.month ?? today) } }}
              value={history.find(h => h.headline === headline)?.id ?? ''}
              style={{ fontFamily: sans, fontSize: 11, color: C.ink, background: 'transparent', border: `0.5px solid ${C.muted}`, padding: '3px 8px', cursor: 'pointer' }}>
              {history.map(h => (
                <option key={h.id} value={h.id}>
                  {new Date(`${h.month ?? today}-01`).toLocaleDateString('fr-FR', { month: 'short', year: 'numeric' })} · {new Date(h.created_at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}
                </option>
              ))}
            </select>
          )}
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button onClick={autoFill} style={{ fontFamily: sans, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.12em', padding: '6px 14px', border: `0.5px solid ${C.muted}`, background: 'transparent', color: C.muted, cursor: 'pointer', borderRadius: 0 }}>
            ↺ Remplir auto
          </button>
          <button onClick={saveRapport} disabled={saving}
            style={{ fontFamily: sans, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.12em', padding: '6px 16px', border: `0.5px solid ${C.ink}`, background: 'transparent', color: C.ink, cursor: saving ? 'wait' : 'pointer', opacity: saving ? 0.6 : 1, borderRadius: 0 }}>
            {saving ? 'Sauvegarde…' : saved ? 'Sauvegardé ✓' : 'Sauvegarder'}
          </button>
          <button onClick={() => window.print()} style={{ fontFamily: sans, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.12em', padding: '6px 16px', border: 'none', background: C.ink, color: C.paper, cursor: 'pointer', borderRadius: 0 }}>
            PDF ↓
          </button>
        </div>
      </div>

      <div style={{ background: C.paper, minHeight: '100vh', paddingTop: 60 }}>
        <div className="print-page">

          {/* ── Header ── */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 40 }}>
            <div>
              <div style={{ fontFamily: sans, textTransform: 'uppercase', letterSpacing: '0.2em', fontSize: 9, color: C.muted, marginBottom: 6 }}>Studio Quartier · Rapport mensuel</div>
              <h1 className={barlow.className} style={{ fontWeight: 900, textTransform: 'uppercase', fontSize: 36, letterSpacing: '-0.01em', lineHeight: 1, margin: '0 0 6px', color: C.ink }}>
                {client?.name}
              </h1>
              <span style={{ fontFamily: sans, fontSize: 13, color: C.muted, textTransform: 'capitalize' }}>{monthLabel}</span>
            </div>
            {/* Checklist summary */}
            <div className="no-print" style={{ border: `0.5px solid ${C.ink}`, padding: '12px 20px', textAlign: 'right' }}>
              <div style={{ fontFamily: sans, fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.2em', color: C.muted, marginBottom: 4 }}>Checklist</div>
              <div style={{ fontFamily: sans, fontSize: 24, fontWeight: 700, color: C.ink }}>{donePct}%</div>
              <div style={{ fontFamily: sans, fontSize: 11, color: C.muted }}>
                {checklistItems.filter((i: any) => i.done).length}/{checklistItems.length} tâches
              </div>
            </div>
          </div>

          <div style={{ height: '1px', background: C.ink, marginBottom: 36 }} />

          {/* ── Titre ── */}
          <div style={{ marginBottom: 28 }}>
            <div style={{ fontFamily: sans, fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.2em', color: C.muted, marginBottom: 6 }}>Titre du rapport</div>
            <input value={headline} onChange={e => setHeadline(e.target.value)}
              style={{ fontFamily: sans, fontSize: 18, fontWeight: 600, color: C.ink, background: 'transparent', border: 'none', borderBottom: `0.5px solid rgba(28,25,23,0.2)`, outline: 'none', width: '100%', padding: '4px 0' }} />
          </div>

          {/* ── Résumé ── */}
          <div style={{ marginBottom: 36 }}>
            <div style={{ fontFamily: sans, fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.2em', color: C.muted, marginBottom: 6 }}>Résumé du mois</div>
            <textarea value={summary} onChange={e => setSummary(e.target.value)} rows={3}
              style={{ fontFamily: sans, fontSize: 14, color: C.ink, background: 'transparent', border: 'none', borderBottom: `0.5px solid rgba(28,25,23,0.2)`, outline: 'none', resize: 'vertical', width: '100%', padding: '4px 0', lineHeight: 1.8, boxSizing: 'border-box' }} />
          </div>

          {/* ── Actions réalisées ── */}
          <div style={{ marginBottom: 36 }}>
            <div style={{ fontFamily: sans, fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.2em', color: C.muted, marginBottom: 12 }}>Actions réalisées</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {actionsDone.map((a, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ color: '#186040', fontWeight: 700, flexShrink: 0 }}>✓</span>
                  <input value={a} onChange={e => setActionsDone(prev => prev.map((x, j) => j === i ? e.target.value : x))}
                    style={{ fontFamily: sans, fontSize: 13, color: C.ink, background: 'transparent', border: 'none', borderBottom: `0.5px solid rgba(28,25,23,0.1)`, outline: 'none', flex: 1, padding: '3px 0' }} />
                  <button onClick={() => setActionsDone(prev => prev.filter((_, j) => j !== i))}
                    style={{ fontFamily: sans, fontSize: 12, padding: '2px 6px', border: 'none', background: 'transparent', color: C.muted, cursor: 'pointer' }}>×</button>
                </div>
              ))}
              <button onClick={() => setActionsDone(prev => [...prev, ''])}
                style={{ fontFamily: sans, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.1em', padding: '5px 10px', border: `0.5px solid ${C.muted}`, background: 'transparent', color: C.muted, cursor: 'pointer', borderRadius: 0, alignSelf: 'flex-start', marginTop: 4 }}>
                + Ajouter
              </button>
            </div>
          </div>

          {/* ── Points marquants ── */}
          {highlights.length > 0 && (
            <div style={{ marginBottom: 36 }}>
              <div style={{ fontFamily: sans, fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.2em', color: C.muted, marginBottom: 12 }}>Points marquants</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                {highlights.map((h, i) => (
                  <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 8, alignItems: 'start', paddingLeft: 16, borderLeft: `2px solid ${C.ink}` }}>
                    <div>
                      <input value={h.title} onChange={e => setHighlights(prev => prev.map((x, j) => j === i ? { ...x, title: e.target.value } : x))}
                        style={{ fontFamily: sans, fontSize: 13, fontWeight: 700, color: C.ink, background: 'transparent', border: 'none', borderBottom: `0.5px solid rgba(28,25,23,0.1)`, outline: 'none', width: '100%', padding: '2px 0', marginBottom: 4 }} />
                      <textarea value={h.body} onChange={e => setHighlights(prev => prev.map((x, j) => j === i ? { ...x, body: e.target.value } : x))} rows={2}
                        style={{ fontFamily: sans, fontSize: 12, color: C.muted, background: 'transparent', border: 'none', borderBottom: `0.5px solid rgba(28,25,23,0.1)`, outline: 'none', width: '100%', resize: 'none', padding: '2px 0', lineHeight: 1.6, boxSizing: 'border-box' }} />
                    </div>
                    <button onClick={() => setHighlights(prev => prev.filter((_, j) => j !== i))}
                      style={{ fontFamily: sans, fontSize: 12, padding: '2px 6px', border: 'none', background: 'transparent', color: C.muted, cursor: 'pointer' }}>×</button>
                  </div>
                ))}
                <button onClick={() => setHighlights(prev => [...prev, { title: '', body: '' }])}
                  style={{ fontFamily: sans, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.1em', padding: '5px 10px', border: `0.5px solid ${C.muted}`, background: 'transparent', color: C.muted, cursor: 'pointer', borderRadius: 0, alignSelf: 'flex-start' }}>
                  + Ajouter
                </button>
              </div>
            </div>
          )}
          {highlights.length === 0 && (
            <button onClick={() => setHighlights([{ title: '', body: '' }])}
              style={{ fontFamily: sans, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.1em', padding: '5px 10px', border: `0.5px solid ${C.muted}`, background: 'transparent', color: C.muted, cursor: 'pointer', borderRadius: 0, marginBottom: 36 }}>
              + Ajouter points marquants
            </button>
          )}

          <div style={{ height: '0.5px', background: 'rgba(28,25,23,0.15)', marginBottom: 32 }} />

          {/* ── Priorités mois prochain ── */}
          <div style={{ marginBottom: 48 }}>
            <div style={{ fontFamily: sans, fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.2em', color: C.muted, marginBottom: 12 }}>Priorités pour le mois prochain</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {nextSteps.map((s, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontFamily: sans, fontSize: 12, color: C.muted, flexShrink: 0 }}>→</span>
                  <input value={s} onChange={e => setNextSteps(prev => prev.map((x, j) => j === i ? e.target.value : x))}
                    style={{ fontFamily: sans, fontSize: 13, color: C.ink, background: 'transparent', border: 'none', borderBottom: `0.5px solid rgba(28,25,23,0.1)`, outline: 'none', flex: 1, padding: '3px 0' }} />
                  <button onClick={() => setNextSteps(prev => prev.filter((_, j) => j !== i))}
                    style={{ fontFamily: sans, fontSize: 12, padding: '2px 6px', border: 'none', background: 'transparent', color: C.muted, cursor: 'pointer' }}>×</button>
                </div>
              ))}
              <button onClick={() => setNextSteps(prev => [...prev, ''])}
                style={{ fontFamily: sans, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.1em', padding: '5px 10px', border: `0.5px solid ${C.muted}`, background: 'transparent', color: C.muted, cursor: 'pointer', borderRadius: 0, alignSelf: 'flex-start', marginTop: 4 }}>
                + Ajouter
              </button>
            </div>
          </div>

          {/* ── Footer ── */}
          <div style={{ borderTop: `0.5px solid rgba(28,25,23,0.2)`, paddingTop: 24, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div style={{ fontFamily: sans, fontWeight: 700, fontSize: 13, color: C.ink }}>Studio Quartier</div>
              <div style={{ fontFamily: sans, fontSize: 11, color: C.muted }}>Agence de marketing digital · Paris</div>
            </div>
            <div style={{ textAlign: 'right', fontFamily: sans, fontSize: 11, color: C.muted }}>studioquartier.fr</div>
          </div>

        </div>
      </div>
    </>
  )
}
