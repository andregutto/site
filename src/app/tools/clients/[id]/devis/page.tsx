'use client'

import { useState, useEffect, use } from 'react'
import { C, sans } from '@/lib/sq-design'

const STATUS_LABELS: Record<string, string> = { draft: 'Brouillon', sent: 'Envoyé', accepted: 'Accepté ✓', refused: 'Refusé', expired: 'Expiré' }
const STATUS_COLORS: Record<string, string>  = { draft: C.muted, sent: '#2A42A8', accepted: '#186040', refused: '#8C1A1A', expired: C.muted }

export default function DevisListPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const [devisList, setDevisList] = useState<any[]>([])
  const [loading,   setLoading]   = useState(true)
  const [creating,  setCreating]  = useState(false)

  useEffect(() => {
    fetch(`/api/sq/devis?client_id=${id}`).then(r => r.json()).then(d => setDevisList(d.devis ?? [])).finally(() => setLoading(false))
  }, [id])

  async function createDevis() {
    setCreating(true)
    const res = await fetch('/api/sq/devis', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ client_id: id, items: [], status: 'draft' }) })
    const d   = await res.json()
    if (d.devis?.id) window.location.href = `/tools/clients/${id}/devis/${d.devis.id}`
    setCreating(false)
  }

  async function deleteDevis(devisId: string) {
    if (!confirm('Supprimer ce devis ?')) return
    await fetch(`/api/sq/devis/${devisId}`, { method: 'DELETE' })
    setDevisList(prev => prev.filter(d => d.id !== devisId))
  }

  return (
    <div style={{ background: C.paper, minHeight: '100vh', fontFamily: sans, color: C.ink }}>
      <div style={{ maxWidth: 900, margin: '0 auto', padding: '48px 48px 96px' }}>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 32 }}>
          <div>
            <a href={`/tools/clients/${id}`} style={{ fontFamily: sans, fontSize: 12, color: C.muted, textDecoration: 'none' }}>← Dossier client</a>
            <div style={{ fontFamily: sans, textTransform: 'uppercase', letterSpacing: '0.14em', fontSize: 12, color: C.ink, marginTop: 8 }}>Devis & propositions</div>
          </div>
          <button onClick={createDevis} disabled={creating}
            style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 20px', border: 'none', background: C.ink, color: C.paper, cursor: 'pointer', fontFamily: sans, textTransform: 'uppercase', letterSpacing: '0.12em', fontSize: 11, fontWeight: 700 }}>
            {creating ? 'Création…' : '+ Nouveau devis'}
          </button>
        </div>
        <div style={{ height: '0.5px', background: C.ink, marginBottom: 32 }} />

        {loading && <p style={{ color: C.muted, fontSize: 13 }}>Chargement…</p>}
        {!loading && devisList.length === 0 && (
          <p style={{ color: C.muted, fontSize: 13 }}>Aucun devis pour ce client. <button onClick={createDevis} style={{ background: 'none', border: 'none', color: C.ink, cursor: 'pointer', fontFamily: sans, fontSize: 13, textDecoration: 'underline' }}>Créer le premier</button></p>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {devisList.map(d => {
            const total = (d.items as any[] ?? []).reduce((s: number, i: any) => s + (Number(i.price_monthly) || 0), 0)
            const setup = (d.items as any[] ?? []).reduce((s: number, i: any) => s + (Number(i.price_setup) || 0), 0)
            return (
              <div key={d.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', border: `0.5px solid ${C.ink}`, background: C.paper }}>
                <div>
                  <span style={{ fontFamily: sans, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.14em', color: STATUS_COLORS[d.status] ?? C.muted, marginRight: 16 }}>{STATUS_LABELS[d.status] ?? d.status}</span>
                  <span style={{ fontFamily: sans, fontSize: 12, color: C.muted }}>{new Date(d.created_at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
                  <div style={{ textAlign: 'right' }}>
                    {setup > 0 && <span style={{ fontFamily: sans, fontSize: 12, color: C.muted, marginRight: 16 }}>Setup : {setup.toLocaleString('fr-FR')} €</span>}
                    <span style={{ fontFamily: sans, fontSize: 14, fontWeight: 700, color: C.ink }}>{total.toLocaleString('fr-FR')} €/mois</span>
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <a href={`/tools/clients/${id}/devis/${d.id}`} style={{ fontFamily: sans, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.12em', padding: '6px 14px', border: `0.5px solid ${C.ink}`, color: C.ink, textDecoration: 'none' }}>Ouvrir</a>
                    <button onClick={() => deleteDevis(d.id)} style={{ fontFamily: sans, fontSize: 11, padding: '6px 10px', border: `0.5px solid ${C.muted}`, background: 'transparent', color: C.muted, cursor: 'pointer', borderRadius: 0 }}>×</button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
