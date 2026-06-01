'use client'

import { useState, useEffect } from 'react'
import { SQHeader } from '@/components/sq/SQHeader'
import { SQFooter } from '@/components/sq/SQFooter'
import { C, sans } from '@/lib/sq-design'

interface Service {
  id: string; name: string; description: string; category: string
  price_monthly: number; price_setup: number; is_active: boolean; sort_order: number
}

const CATEGORIES: Record<string, string> = {
  technique: 'Technique',
  contenu:   'Contenu & Réseaux sociaux',
  seo:       'SEO & Visibilité',
  publicite: 'Publicité',
  photo:     'Production',
  pack:      'Packs',
}

const EMPTY: Omit<Service, 'id'> = {
  name: '', description: '', category: 'contenu',
  price_monthly: 0, price_setup: 0, is_active: true, sort_order: 99,
}

export default function ServicesPage() {
  const [services,  setServices]  = useState<Service[]>([])
  const [loading,   setLoading]   = useState(true)
  const [seeding,   setSeeding]   = useState(false)
  const [editing,   setEditing]   = useState<string | null>(null) // service id or 'new'
  const [draft,     setDraft]     = useState<Omit<Service, 'id'>>(EMPTY)
  const [saving,    setSaving]    = useState(false)

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    const d = await fetch('/api/sq/services').then(r => r.json())
    setServices(d.services ?? [])
    setLoading(false)
  }

  async function seed() {
    setSeeding(true)
    await fetch('/api/sq/services/seed', { method: 'POST' })
    await load()
    setSeeding(false)
  }

  function startEdit(svc: Service) {
    setEditing(svc.id)
    setDraft({ name: svc.name, description: svc.description, category: svc.category, price_monthly: svc.price_monthly, price_setup: svc.price_setup, is_active: svc.is_active, sort_order: svc.sort_order })
  }

  function startNew() {
    setEditing('new')
    setDraft({ ...EMPTY, sort_order: services.length + 1 })
  }

  async function save() {
    setSaving(true)
    if (editing === 'new') {
      const res = await fetch('/api/sq/services', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(draft) })
      const d   = await res.json()
      if (d.service) setServices(prev => [...prev, d.service])
    } else if (editing) {
      const res = await fetch(`/api/sq/services/${editing}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(draft) })
      const d   = await res.json()
      if (d.service) setServices(prev => prev.map(s => s.id === editing ? d.service : s))
    }
    setEditing(null); setSaving(false)
  }

  async function deleteService(id: string) {
    if (!confirm('Supprimer ce service ?')) return
    await fetch(`/api/sq/services/${id}`, { method: 'DELETE' })
    setServices(prev => prev.filter(s => s.id !== id))
  }

  async function toggleActive(svc: Service) {
    const updated = { ...svc, is_active: !svc.is_active }
    setServices(prev => prev.map(s => s.id === svc.id ? updated : s))
    await fetch(`/api/sq/services/${svc.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ is_active: updated.is_active }) })
  }

  const grouped = Object.entries(CATEGORIES).map(([key, label]) => ({
    key, label,
    items: services.filter(s => s.category === key).sort((a, b) => a.sort_order - b.sort_order),
  })).filter(g => g.items.length > 0 || g.key === (editing === 'new' ? draft.category : ''))

  const labelStyle: React.CSSProperties = { fontFamily: sans, textTransform: 'uppercase', letterSpacing: '0.14em', fontSize: 11, color: C.ink }
  const inputStyle: React.CSSProperties = { fontFamily: sans, fontSize: 13, color: C.ink, background: 'transparent', border: 'none', borderBottom: `0.5px solid ${C.ink}`, outline: 'none', padding: '4px 0', width: '100%' }
  const fieldLabel: React.CSSProperties = { fontFamily: sans, textTransform: 'uppercase', letterSpacing: '0.16em', fontSize: 9, color: C.muted, display: 'block', marginBottom: 4 }

  return (
    <div style={{ background: C.paper, minHeight: '100vh', fontFamily: sans, color: C.ink }}>
      <SQHeader />
      <main style={{ maxWidth: 1100, margin: '0 auto', padding: '48px 48px 96px' }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 40 }}>
          <div>
            <span style={{ ...labelStyle, fontSize: 12 }}>Catalogue de services</span>
            <div style={{ height: '0.5px', background: C.ink, marginTop: 14, width: '100%' }} />
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            {services.length === 0 && (
              <button onClick={seed} disabled={seeding}
                style={{ fontFamily: sans, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.12em', padding: '9px 18px', border: `0.5px solid ${C.ink}`, background: C.warm, color: C.ink, cursor: 'pointer', borderRadius: 0 }}>
                {seeding ? 'Initialisation…' : 'Initialiser catalogue'}
              </button>
            )}
            <button onClick={startNew}
              style={{ fontFamily: sans, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.12em', padding: '9px 18px', border: 'none', background: C.ink, color: C.paper, cursor: 'pointer', borderRadius: 0 }}>
              + Nouveau service
            </button>
          </div>
        </div>

        {loading && <p style={{ fontFamily: sans, fontSize: 13, color: C.muted }}>Chargement…</p>}

        {!loading && services.length === 0 && (
          <div style={{ textAlign: 'center', padding: '60px 0' }}>
            <p style={{ fontFamily: sans, fontSize: 14, color: C.muted, marginBottom: 20 }}>Votre catalogue est vide. Initialisez-le avec les services de référence.</p>
          </div>
        )}

        {/* Services grouped by category */}
        {Object.entries(CATEGORIES).map(([catKey, catLabel]) => {
          const items = services.filter(s => s.category === catKey).sort((a, b) => a.sort_order - b.sort_order)
          if (items.length === 0 && !(editing === 'new' && draft.category === catKey)) return null
          return (
            <div key={catKey} style={{ marginBottom: 48 }}>
              <div style={{ fontFamily: sans, textTransform: 'uppercase', letterSpacing: '0.16em', fontSize: 10, color: C.muted, marginBottom: 16, paddingBottom: 8, borderBottom: `0.5px solid rgba(28,25,23,0.15)` }}>
                {catLabel}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                {items.map(svc => (
                  editing === svc.id
                    ? <EditForm key={svc.id} draft={draft} setDraft={setDraft} saving={saving} onSave={save} onCancel={() => setEditing(null)} inputStyle={inputStyle} fieldLabel={fieldLabel} />
                    : (
                      <div key={svc.id} style={{ display: 'grid', gridTemplateColumns: '1fr 140px 140px auto', gap: '0 24px', alignItems: 'start', padding: '16px 20px', background: svc.is_active ? C.paper : 'rgba(28,25,23,0.03)', border: `0.5px solid rgba(28,25,23,${svc.is_active ? '0.12' : '0.06'})`, opacity: svc.is_active ? 1 : 0.55 }}>
                        <div>
                          <div style={{ fontFamily: sans, fontSize: 14, fontWeight: 600, color: C.ink, marginBottom: 6 }}>{svc.name}</div>
                          <div style={{ fontFamily: sans, fontSize: 12, color: C.muted, lineHeight: 1.6 }}>{svc.description}</div>
                        </div>
                        <div>
                          <div style={{ fontFamily: sans, fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.14em', color: C.muted, marginBottom: 4 }}>Frais unique</div>
                          <div style={{ fontFamily: sans, fontSize: 16, fontWeight: 700, color: svc.price_setup > 0 ? C.ink : C.muted }}>{svc.price_setup > 0 ? `${svc.price_setup} €` : '—'}</div>
                        </div>
                        <div>
                          <div style={{ fontFamily: sans, fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.14em', color: C.muted, marginBottom: 4 }}>Abonnement</div>
                          <div style={{ fontFamily: sans, fontSize: 16, fontWeight: 700, color: svc.price_monthly > 0 ? C.ink : C.muted }}>{svc.price_monthly > 0 ? `${svc.price_monthly} €/mois` : '—'}</div>
                        </div>
                        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                          <button onClick={() => toggleActive(svc)}
                            style={{ fontFamily: sans, fontSize: 10, padding: '4px 8px', border: `0.5px solid ${C.muted}`, background: 'transparent', color: C.muted, cursor: 'pointer', borderRadius: 0 }}>
                            {svc.is_active ? 'Désactiver' : 'Activer'}
                          </button>
                          <button onClick={() => startEdit(svc)}
                            style={{ fontFamily: sans, fontSize: 10, padding: '4px 8px', border: `0.5px solid ${C.ink}`, background: 'transparent', color: C.ink, cursor: 'pointer', borderRadius: 0 }}>
                            Éditer
                          </button>
                          <button onClick={() => deleteService(svc.id)}
                            style={{ fontFamily: sans, fontSize: 12, padding: '4px 8px', border: `0.5px solid ${C.muted}`, background: 'transparent', color: C.muted, cursor: 'pointer', borderRadius: 0 }}>
                            ×
                          </button>
                        </div>
                      </div>
                    )
                ))}
                {editing === 'new' && draft.category === catKey && (
                  <EditForm draft={draft} setDraft={setDraft} saving={saving} onSave={save} onCancel={() => setEditing(null)} inputStyle={inputStyle} fieldLabel={fieldLabel} isNew />
                )}
              </div>
            </div>
          )
        })}

      </main>
      <SQFooter />
    </div>
  )
}

function EditForm({ draft, setDraft, saving, onSave, onCancel, inputStyle, fieldLabel, isNew }: {
  draft: Omit<Service, 'id'>; setDraft: (d: Omit<Service, 'id'>) => void
  saving: boolean; onSave: () => void; onCancel: () => void
  inputStyle: React.CSSProperties; fieldLabel: React.CSSProperties; isNew?: boolean
}) {
  const CATEGORIES: Record<string, string> = {
    technique: 'Technique', contenu: 'Contenu & Réseaux', seo: 'SEO & Visibilité',
    publicite: 'Publicité', photo: 'Production', pack: 'Packs',
  }
  return (
    <div style={{ border: `0.5px solid ${C.ink}`, padding: '20px 24px', background: C.warm }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 32px', marginBottom: 16 }}>
        <div>
          <label style={fieldLabel}>Nom du service</label>
          <input value={draft.name} onChange={e => setDraft({ ...draft, name: e.target.value })} style={inputStyle} placeholder="Ex: Gestion Instagram" />
        </div>
        <div>
          <label style={fieldLabel}>Catégorie</label>
          <select value={draft.category} onChange={e => setDraft({ ...draft, category: e.target.value })}
            style={{ ...inputStyle, appearance: 'none', cursor: 'pointer' }}>
            {Object.entries(CATEGORIES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </div>
      </div>

      <div style={{ marginBottom: 16 }}>
        <label style={fieldLabel}>Description (visible dans le devis)</label>
        <textarea rows={4} value={draft.description} onChange={e => setDraft({ ...draft, description: e.target.value })}
          placeholder="Ce que comprend ce service, ce qu'il ne comprend pas, délais, conditions…"
          style={{ ...inputStyle, resize: 'vertical', boxSizing: 'border-box', borderBottom: `0.5px solid ${C.ink}` }} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0 32px', marginBottom: 20 }}>
        <div>
          <label style={fieldLabel}>Frais unique (€)</label>
          <input type="number" value={draft.price_setup} onChange={e => setDraft({ ...draft, price_setup: Number(e.target.value) })} style={inputStyle} />
        </div>
        <div>
          <label style={fieldLabel}>Abonnement mensuel (€)</label>
          <input type="number" value={draft.price_monthly} onChange={e => setDraft({ ...draft, price_monthly: Number(e.target.value) })} style={inputStyle} />
        </div>
        <div>
          <label style={fieldLabel}>Ordre d'affichage</label>
          <input type="number" value={draft.sort_order} onChange={e => setDraft({ ...draft, sort_order: Number(e.target.value) })} style={inputStyle} />
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <button onClick={onCancel} style={{ fontFamily: 'Arial, sans-serif', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.12em', padding: '7px 16px', border: `0.5px solid ${C.muted}`, background: 'transparent', color: C.muted, cursor: 'pointer', borderRadius: 0 }}>
          Annuler
        </button>
        <button onClick={onSave} disabled={saving || !draft.name.trim()}
          style={{ fontFamily: 'Arial, sans-serif', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.12em', padding: '7px 16px', border: 'none', background: C.ink, color: C.paper, cursor: 'pointer', borderRadius: 0, opacity: (!draft.name.trim() || saving) ? 0.5 : 1 }}>
          {saving ? 'Sauvegarde…' : isNew ? 'Créer' : 'Sauvegarder'}
        </button>
      </div>
    </div>
  )
}
