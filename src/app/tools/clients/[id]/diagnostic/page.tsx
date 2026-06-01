'use client'

import { useState, useEffect, use } from 'react'
import { Barlow_Condensed } from 'next/font/google'
import { C, sans } from '@/lib/sq-design'

const barlow = Barlow_Condensed({ weight: ['900'], subsets: ['latin'] })

interface Opportunity { title: string; body: string; impact: string }
interface Diagnostic { headline: string; intro: string; opportunities: Opportunity[]; closing: string }

export default function DiagnosticPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const [diagnostic, setDiagnostic] = useState<Diagnostic | null>(null)
  const [client,     setClient]     = useState<any>(null)
  const [loading,    setLoading]    = useState(true)
  const [error,      setError]      = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/sq/diagnostic', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ client_id: id }) })
      .then(r => r.json())
      .then(d => { if (d.error) throw new Error(d.error); setDiagnostic(d.diagnostic); setClient(d.client) })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [id])

  if (loading) return (
    <div style={{ background: C.paper, minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16 }}>
      <div style={{ fontFamily: sans, fontSize: 13, color: C.muted }}>Génération du diagnostic…</div>
      <div style={{ fontFamily: sans, fontSize: 11, color: C.muted, opacity: 0.6 }}>L'IA analyse la présence digitale de votre client</div>
    </div>
  )

  if (error || !diagnostic) return (
    <div style={{ background: C.paper, minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 48 }}>
      <div>
        <p style={{ fontFamily: sans, color: C.muted }}>{error ?? 'Erreur inconnue'}</p>
        <a href={`/tools/clients/${id}`} style={{ fontFamily: sans, fontSize: 12, color: C.ink }}>← Retour au dossier</a>
      </div>
    </div>
  )

  const dateStr = new Date().toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })

  return (
    <>
      <style>{`
        @media print {
          .no-print { display: none !important; }
          body { background: white !important; }
          @page { margin: 20mm 18mm; }
        }
        @media screen {
          .print-page { max-width: 760px; margin: 0 auto; padding: 60px 48px 96px; }
        }
      `}</style>

      {/* Screen toolbar */}
      <div className="no-print" style={{ position: 'fixed', top: 0, left: 0, right: 0, zIndex: 100, background: C.warm, borderBottom: `0.5px solid ${C.ink}`, padding: '12px 32px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <a href={`/tools/clients/${id}`} style={{ fontFamily: sans, fontSize: 12, color: C.muted, textDecoration: 'none' }}>← Dossier {client?.name}</a>
        <button onClick={() => window.print()}
          style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 20px', border: 'none', background: C.ink, color: C.paper, cursor: 'pointer', fontFamily: sans, textTransform: 'uppercase', letterSpacing: '0.12em', fontSize: 11, fontWeight: 700 }}>
          Sauvegarder PDF ↓
        </button>
      </div>

      <div style={{ background: C.paper, minHeight: '100vh', paddingTop: 60 }}>
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
              {diagnostic.opportunities.map((opp, i) => (
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
            <div style={{ textAlign: 'right', fontFamily: sans, fontSize: 11, color: C.muted }}>
              <div>studioquartier.fr</div>
            </div>
          </div>

        </div>
      </div>
    </>
  )
}
