'use client'

import { useState, useEffect, use } from 'react'
import { Barlow_Condensed } from 'next/font/google'
import { C, sans } from '@/lib/sq-design'

const barlow = Barlow_Condensed({ weight: ['900'], subsets: ['latin'] })

interface Opportunity { title: string; body: string; impact: string }
interface Diagnostic { headline: string; intro: string; opportunities: Opportunity[]; closing: string }
interface SavedDiagnostic extends Diagnostic { id: string; created_at: string }

export default function DiagnosticPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const [diagnostic,  setDiagnostic]  = useState<Diagnostic | null>(null)
  const [savedAt,     setSavedAt]     = useState<string | null>(null)
  const [history,     setHistory]     = useState<SavedDiagnostic[]>([])
  const [client,      setClient]      = useState<any>(null)
  const [loading,     setLoading]     = useState(true)
  const [generating,  setGenerating]  = useState(false)
  const [error,       setError]       = useState<string | null>(null)

  useEffect(() => {
    // Load client + history in parallel
    Promise.all([
      fetch(`/api/sq/clients/${id}`).then(r => r.json()),
      fetch(`/api/sq/diagnostics?client_id=${id}`).then(r => r.json()),
    ]).then(([clientData, diagData]) => {
      setClient(clientData.client)
      const saved: SavedDiagnostic[] = diagData.diagnostics ?? []
      setHistory(saved)
      if (saved.length > 0) {
        const latest = saved[0]
        setDiagnostic({ headline: latest.headline, intro: latest.intro, opportunities: latest.opportunities, closing: latest.closing })
        setSavedAt(latest.created_at)
      }
    }).catch(() => setError('Erreur de chargement'))
    .finally(() => setLoading(false))
  }, [id])

  async function generate() {
    setGenerating(true); setError(null)
    try {
      const res  = await fetch('/api/sq/diagnostic', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ client_id: id }) })
      const data = await res.json()
      if (!res.ok || data.error) throw new Error(data.error)

      const d: Diagnostic = data.diagnostic
      setDiagnostic(d)
      setClient(data.client)

      // Save to DB
      const saveRes = await fetch('/api/sq/diagnostics', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ client_id: id, headline: d.headline, intro: d.intro, opportunities: d.opportunities, closing: d.closing }),
      })
      const saved = await saveRes.json()
      if (saved.diagnostic) {
        setSavedAt(saved.diagnostic.created_at)
        setHistory(prev => [saved.diagnostic, ...prev])
      }
    } catch (e: any) {
      setError(e.message)
    } finally {
      setGenerating(false)
    }
  }

  function loadSaved(d: SavedDiagnostic) {
    setDiagnostic({ headline: d.headline, intro: d.intro, opportunities: d.opportunities, closing: d.closing })
    setSavedAt(d.created_at)
  }

  const dateStr = savedAt
    ? new Date(savedAt).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })
    : new Date().toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })

  if (loading) return (
    <div style={{ background: C.paper, minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12 }}>
      <span style={{ fontFamily: sans, fontSize: 13, color: C.muted }}>Chargement…</span>
    </div>
  )

  return (
    <>
      <style>{`
        @media print {
          .no-print { display: none !important; }
          body { background: white !important; }
          @page { margin: 20mm 18mm; }
        }
        @media screen { .print-page { max-width: 760px; margin: 0 auto; padding: 60px 48px 96px; } }
      `}</style>

      {/* Toolbar */}
      <div className="no-print" style={{ position: 'fixed', top: 0, left: 0, right: 0, zIndex: 100, background: C.warm, borderBottom: `0.5px solid ${C.ink}`, padding: '10px 32px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
          <a href={`/tools/clients/${id}`} style={{ fontFamily: sans, fontSize: 12, color: C.muted, textDecoration: 'none' }}>← {client?.name ?? 'Dossier'}</a>
          {savedAt && (
            <span style={{ fontFamily: sans, fontSize: 11, color: C.muted }}>
              Généré le {new Date(savedAt).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' })}
            </span>
          )}
          {/* History selector */}
          {history.length > 1 && (
            <select onChange={e => { const d = history.find(h => h.id === e.target.value); if (d) loadSaved(d) }}
              value={history.find(h => h.created_at === savedAt)?.id ?? ''}
              style={{ fontFamily: sans, fontSize: 11, color: C.ink, background: 'transparent', border: `0.5px solid ${C.muted}`, padding: '3px 8px', cursor: 'pointer' }}>
              {history.map(h => (
                <option key={h.id} value={h.id}>
                  {new Date(h.created_at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' })}
                </option>
              ))}
            </select>
          )}
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {error && <span style={{ fontFamily: sans, fontSize: 11, color: '#8C1A1A' }}>{error}</span>}
          <button onClick={generate} disabled={generating}
            style={{ fontFamily: sans, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.12em', padding: '6px 16px', border: `0.5px solid ${C.ink}`, background: 'transparent', color: C.ink, cursor: generating ? 'wait' : 'pointer', opacity: generating ? 0.6 : 1, borderRadius: 0 }}>
            {generating ? 'Génération…' : diagnostic ? 'Regénérer' : 'Générer'}
          </button>
          {diagnostic && (
            <button onClick={() => window.print()}
              style={{ fontFamily: sans, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.12em', padding: '6px 16px', border: 'none', background: C.ink, color: C.paper, cursor: 'pointer', borderRadius: 0 }}>
              Sauvegarder PDF ↓
            </button>
          )}
        </div>
      </div>

      <div style={{ background: C.paper, minHeight: '100vh', paddingTop: 60 }}>

        {/* Empty state */}
        {!diagnostic && !generating && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: 'calc(100vh - 60px)', gap: 16 }}>
            <p style={{ fontFamily: sans, fontSize: 14, color: C.muted }}>Aucun diagnostic généré pour ce client.</p>
            <button onClick={generate}
              style={{ fontFamily: sans, fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.12em', padding: '10px 24px', border: 'none', background: C.ink, color: C.paper, cursor: 'pointer', borderRadius: 0 }}>
              Générer le diagnostic →
            </button>
          </div>
        )}

        {/* Generating state */}
        {generating && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: 'calc(100vh - 60px)', gap: 12 }}>
            <span style={{ fontFamily: sans, fontSize: 13, color: C.muted }}>L'IA analyse la présence digitale et rédige le diagnostic…</span>
          </div>
        )}

        {/* Diagnostic content */}
        {diagnostic && !generating && (
          <div className="print-page">

            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 48 }}>
              <div>
                <div style={{ fontFamily: sans, textTransform: 'uppercase', letterSpacing: '0.2em', fontSize: 9, color: C.muted, marginBottom: 6 }}>Studio Quartier · Diagnostic digital</div>
                <h1 className={barlow.className} style={{ fontWeight: 900, textTransform: 'uppercase', fontSize: 42, letterSpacing: '-0.01em', lineHeight: 1, margin: '0 0 6px', color: C.ink }}>
                  {client?.name}
                </h1>
                <span style={{ fontFamily: sans, fontSize: 13, color: C.muted }}>
                  {[client?.category, client?.neighborhood].filter(Boolean).join(' · ')}
                </span>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontFamily: sans, fontSize: 11, color: C.muted }}>{dateStr}</div>
                <div style={{ fontFamily: sans, fontSize: 11, color: C.muted, marginTop: 2 }}>Confidentiel</div>
              </div>
            </div>

            <div style={{ height: '1px', background: C.ink, marginBottom: 48 }} />

            {/* Headline */}
            <div style={{ background: C.warm, padding: '24px 28px', marginBottom: 40, borderLeft: `3px solid ${C.accent}` }}>
              <p style={{ fontFamily: sans, fontSize: 18, fontWeight: 600, color: C.ink, margin: 0, lineHeight: 1.5 }}>
                {diagnostic.headline}
              </p>
            </div>

            {/* Intro */}
            <p style={{ fontFamily: sans, fontSize: 15, color: C.ink, lineHeight: 1.8, marginBottom: 48 }}>
              {diagnostic.intro}
            </p>

            {/* Opportunities */}
            <div style={{ marginBottom: 48 }}>
              <div style={{ fontFamily: sans, textTransform: 'uppercase', letterSpacing: '0.18em', fontSize: 10, color: C.muted, marginBottom: 24 }}>
                Opportunités identifiées
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
                {(diagnostic.opportunities ?? []).map((opp, i) => (
                  <div key={i} style={{ display: 'grid', gridTemplateColumns: '32px 1fr', gap: '0 20px', alignItems: 'start' }}>
                    <div style={{ width: 32, height: 32, background: C.ink, color: C.paper, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: sans, fontSize: 13, fontWeight: 700, flexShrink: 0, marginTop: 2 }}>
                      {i + 1}
                    </div>
                    <div>
                      <div style={{ fontFamily: sans, fontSize: 15, fontWeight: 700, color: C.ink, marginBottom: 8 }}>{opp.title}</div>
                      <p style={{ fontFamily: sans, fontSize: 14, color: C.muted, lineHeight: 1.7, margin: '0 0 8px' }}>{opp.body}</p>
                      <div style={{ fontFamily: sans, fontSize: 12, color: C.accent, fontWeight: 600 }}>→ {opp.impact}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div style={{ height: '0.5px', background: 'rgba(28,25,23,0.15)', marginBottom: 40 }} />

            {/* Closing */}
            <p style={{ fontFamily: sans, fontSize: 15, color: C.ink, lineHeight: 1.8, marginBottom: 56 }}>
              {diagnostic.closing}
            </p>

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
