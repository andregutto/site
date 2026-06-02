'use client'

import { useState, useEffect, use } from 'react'
import { Barlow_Condensed } from 'next/font/google'
import { C, sans } from '@/lib/sq-design'

const barlow = Barlow_Condensed({ weight: ['900'], subsets: ['latin'] })

interface Rapport {
  id?: string; headline: string; summary: string
  actions_done: string[]; highlights: { title: string; body: string }[]; next_steps: string[]
  created_at?: string; month?: string
}

export default function RapportPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const today  = new Date().toISOString().slice(0, 7)

  const [client,     setClient]     = useState<any>(null)
  const [rapport,    setRapport]    = useState<Rapport | null>(null)
  const [savedAt,    setSavedAt]    = useState<string | null>(null)
  const [history,    setHistory]    = useState<(Rapport & { id: string; created_at: string })[]>([])
  const [month,      setMonth]      = useState(today)
  const [loading,    setLoading]    = useState(true)
  const [generating, setGenerating] = useState(false)
  const [error,      setError]      = useState<string | null>(null)

  useEffect(() => {
    Promise.all([
      fetch(`/api/sq/clients/${id}`).then(r => r.json()),
      fetch(`/api/sq/rapports?client_id=${id}`).then(r => r.json()),
    ]).then(([c, r]) => {
      setClient(c.client)
      const saved = r.rapports ?? []
      setHistory(saved)
      if (saved.length > 0) {
        setRapport(saved[0])
        setSavedAt(saved[0].created_at)
        setMonth(saved[0].month ?? today)
      }
    }).catch(() => setError('Erreur de chargement'))
    .finally(() => setLoading(false))
  }, [id])

  async function generate() {
    setGenerating(true); setError(null)
    try {
      const res  = await fetch('/api/sq/rapport', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ client_id: id, month }) })
      const data = await res.json()
      if (!res.ok || data.error) throw new Error(data.error)
      const r: Rapport = data.rapport
      setRapport(r)
      // Save to DB
      const saveRes = await fetch('/api/sq/rapports', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ client_id: id, month, ...r }),
      })
      const saved = await saveRes.json()
      if (saved.rapport) {
        setSavedAt(saved.rapport.created_at)
        setHistory(prev => [saved.rapport, ...prev])
      }
    } catch (e: any) {
      setError(e.message)
    } finally {
      setGenerating(false)
    }
  }

  const monthLabel = new Date(`${month}-01`).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })

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
          {savedAt && <span style={{ fontFamily: sans, fontSize: 11, color: C.muted }}>Généré le {new Date(savedAt).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' })}</span>}
          {history.length > 1 && (
            <select onChange={e => { const r = history.find(h => h.id === e.target.value); if (r) { setRapport(r); setSavedAt(r.created_at); setMonth(r.month ?? today) } }}
              value={history.find(h => h.created_at === savedAt)?.id ?? ''}
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
          {error && <span style={{ fontFamily: sans, fontSize: 11, color: '#8C1A1A' }}>{error}</span>}
          <button onClick={generate} disabled={generating}
            style={{ fontFamily: sans, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.12em', padding: '6px 16px', border: `0.5px solid ${C.ink}`, background: 'transparent', color: C.ink, cursor: generating ? 'wait' : 'pointer', opacity: generating ? 0.6 : 1, borderRadius: 0 }}>
            {generating ? 'Génération…' : rapport ? 'Regénérer' : 'Générer le rapport'}
          </button>
          {rapport && (
            <button onClick={() => window.print()} style={{ fontFamily: sans, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.12em', padding: '6px 16px', border: 'none', background: C.ink, color: C.paper, cursor: 'pointer', borderRadius: 0 }}>
              Sauvegarder PDF ↓
            </button>
          )}
        </div>
      </div>

      <div style={{ background: C.paper, minHeight: '100vh', paddingTop: 60 }}>

        {!rapport && !generating && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: 'calc(100vh - 60px)', gap: 20 }}>
            <p style={{ fontFamily: sans, fontSize: 14, color: C.muted }}>Aucun rapport pour ce mois.</p>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <input type="month" value={month} onChange={e => setMonth(e.target.value)}
                style={{ fontFamily: sans, fontSize: 13, color: C.ink, background: 'transparent', border: 'none', borderBottom: `0.5px solid ${C.ink}`, outline: 'none', padding: '4px 0' }} />
              <button onClick={generate}
                style={{ fontFamily: sans, fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.12em', padding: '10px 24px', border: 'none', background: C.ink, color: C.paper, cursor: 'pointer', borderRadius: 0 }}>
                Générer le rapport →
              </button>
            </div>
          </div>
        )}

        {generating && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: 'calc(100vh - 60px)', gap: 12 }}>
            <span style={{ fontFamily: sans, fontSize: 13, color: C.muted }}>L'IA analyse le mois et rédige le rapport…</span>
          </div>
        )}

        {rapport && !generating && (
          <div className="print-page">
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 48 }}>
              <div>
                <div style={{ fontFamily: sans, textTransform: 'uppercase', letterSpacing: '0.2em', fontSize: 9, color: C.muted, marginBottom: 6 }}>Studio Quartier · Rapport mensuel</div>
                <h1 className={barlow.className} style={{ fontWeight: 900, textTransform: 'uppercase', fontSize: 40, letterSpacing: '-0.01em', lineHeight: 1, margin: '0 0 6px', color: C.ink }}>
                  {client?.name}
                </h1>
                <span style={{ fontFamily: sans, fontSize: 14, color: C.muted, textTransform: 'capitalize' }}>{monthLabel}</span>
              </div>
              <div style={{ textAlign: 'right' }}>
                {savedAt && <div style={{ fontFamily: sans, fontSize: 11, color: C.muted }}>Généré le {new Date(savedAt).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}</div>}
                <div style={{ fontFamily: sans, fontSize: 11, color: C.muted, marginTop: 2 }}>Confidentiel</div>
              </div>
            </div>

            <div style={{ height: '1px', background: C.ink, marginBottom: 40 }} />

            {/* Headline */}
            <div style={{ background: C.warm, padding: '20px 24px', marginBottom: 40, borderLeft: `3px solid ${C.accent}` }}>
              <p style={{ fontFamily: sans, fontSize: 17, fontWeight: 600, color: C.ink, margin: 0, lineHeight: 1.5 }}>{rapport.headline}</p>
            </div>

            {/* Summary */}
            <p style={{ fontFamily: sans, fontSize: 15, color: C.ink, lineHeight: 1.8, marginBottom: 48 }}>{rapport.summary}</p>

            {/* Actions done */}
            {rapport.actions_done?.length > 0 && (
              <div style={{ marginBottom: 40 }}>
                <div style={{ fontFamily: sans, textTransform: 'uppercase', letterSpacing: '0.18em', fontSize: 10, color: C.muted, marginBottom: 16 }}>Actions réalisées ce mois</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {rapport.actions_done.map((a, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                      <span style={{ color: '#186040', fontWeight: 700, flexShrink: 0, marginTop: 1 }}>✓</span>
                      <span style={{ fontFamily: sans, fontSize: 14, color: C.ink, lineHeight: 1.6 }}>{a}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Highlights */}
            {rapport.highlights?.length > 0 && (
              <div style={{ marginBottom: 48 }}>
                <div style={{ fontFamily: sans, textTransform: 'uppercase', letterSpacing: '0.18em', fontSize: 10, color: C.muted, marginBottom: 20 }}>Points marquants</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                  {rapport.highlights.map((h, i) => (
                    <div key={i} style={{ display: 'grid', gridTemplateColumns: '28px 1fr', gap: '0 16px', alignItems: 'start' }}>
                      <div style={{ width: 28, height: 28, background: C.ink, color: C.paper, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: sans, fontSize: 12, fontWeight: 700, flexShrink: 0, marginTop: 2 }}>{i + 1}</div>
                      <div>
                        <div style={{ fontFamily: sans, fontSize: 14, fontWeight: 700, color: C.ink, marginBottom: 4 }}>{h.title}</div>
                        <p style={{ fontFamily: sans, fontSize: 13, color: C.muted, lineHeight: 1.7, margin: 0 }}>{h.body}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div style={{ height: '0.5px', background: 'rgba(28,25,23,0.15)', marginBottom: 36 }} />

            {/* Next steps */}
            {rapport.next_steps?.length > 0 && (
              <div style={{ marginBottom: 56 }}>
                <div style={{ fontFamily: sans, textTransform: 'uppercase', letterSpacing: '0.18em', fontSize: 10, color: C.muted, marginBottom: 16 }}>Priorités pour le mois prochain</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {rapport.next_steps.map((s, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                      <span style={{ fontFamily: sans, fontSize: 12, color: C.muted, flexShrink: 0, marginTop: 2 }}>→</span>
                      <span style={{ fontFamily: sans, fontSize: 14, color: C.ink, lineHeight: 1.6 }}>{s}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Footer */}
            <div style={{ borderTop: `0.5px solid rgba(28,25,23,0.2)`, paddingTop: 24, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontFamily: sans, fontWeight: 700, fontSize: 13, color: C.ink }}>Studio Quartier</div>
                <div style={{ fontFamily: sans, fontSize: 11, color: C.muted }}>Agence de marketing digital · Paris</div>
              </div>
              <div style={{ textAlign: 'right', fontFamily: sans, fontSize: 11, color: C.muted }}>studioquartier.fr</div>
            </div>
          </div>
        )}
      </div>
    </>
  )
}
