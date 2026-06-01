'use client'

import { useState, useEffect, use } from 'react'
import { Barlow_Condensed } from 'next/font/google'
import { C, sans } from '@/lib/sq-design'

const barlow = Barlow_Condensed({ weight: ['900'], subsets: ['latin'] })

interface DevisItem { id: string; service: string; description: string; price_monthly: number; price_setup: number }
interface Devis {
  id: string; client_id: string; status: string; items: DevisItem[]
  validity_days: number; intro_text: string | null; notes: string | null
  created_at: string; sent_at: string | null
  sq_clients?: { name: string; address: string | null; neighborhood: string | null; category: string | null; contact_name: string | null; contact_email: string | null }
}

const STATUS_LABELS: Record<string, string> = { draft: 'Brouillon', sent: 'Envoyé', accepted: 'Accepté', refused: 'Refusé', expired: 'Expiré' }
const STATUS_COLORS: Record<string, string> = { draft: C.muted, sent: '#2A42A8', accepted: '#186040', refused: '#8C1A1A', expired: C.muted }

const SERVICE_PRESETS = [
  { service: 'Site web vitrine',              description: 'Création d\'un site web professionnel, mobile-first, avec formulaire de contact et intégration Google Maps.',  price_monthly: 80,  price_setup: 600 },
  { service: 'Gestion Instagram',             description: 'Création de contenu, 8 posts/mois + stories, calendrier éditorial, suivi des statistiques.',                   price_monthly: 250, price_setup: 0   },
  { service: 'Référencement local (SEO)',      description: 'Optimisation Google Business Profile, gestion des avis, citations locales, rapport mensuel.',                  price_monthly: 120, price_setup: 0   },
  { service: 'Gestion des avis Google (IA)',  description: 'Réponses personnalisées à tous les avis Google — professionnelles, chaleureuses, automatisées par IA.',        price_monthly: 80,  price_setup: 0   },
  { service: 'Email marketing',               description: 'Newsletter mensuelle, base clients, design et envoi.',                                                         price_monthly: 120, price_setup: 0   },
  { service: 'Pack complet',                  description: 'Site web + Instagram + Référencement local + Avis Google.',                                                    price_monthly: 490, price_setup: 600 },
]

export default function DevisPage({ params }: { params: Promise<{ id: string; devisId: string }> }) {
  const { id, devisId } = use(params)
  const [devis,   setDevis]   = useState<Devis | null>(null)
  const [loading, setLoading] = useState(true)
  const [mode,    setMode]    = useState<'edit' | 'preview'>('edit')
  const [saving,  setSaving]  = useState(false)

  useEffect(() => {
    fetch(`/api/sq/devis/${devisId}`)
      .then(r => r.json())
      .then(d => setDevis(d.devis))
      .finally(() => setLoading(false))
  }, [devisId])

  async function save(patch: Partial<Devis>) {
    if (!devis) return
    const updated = { ...devis, ...patch }
    setDevis(updated)
    setSaving(true)
    await fetch(`/api/sq/devis/${devisId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(patch) })
    setSaving(false)
  }

  function updateItem(itemId: string, field: keyof DevisItem, value: string | number) {
    if (!devis) return
    const items = devis.items.map(i => i.id === itemId ? { ...i, [field]: value } : i)
    save({ items })
  }

  function addPreset(preset: typeof SERVICE_PRESETS[0]) {
    if (!devis) return
    const item: DevisItem = { id: crypto.randomUUID(), ...preset }
    save({ items: [...devis.items, item] })
  }

  function addBlank() {
    if (!devis) return
    save({ items: [...devis.items, { id: crypto.randomUUID(), service: '', description: '', price_monthly: 0, price_setup: 0 }] })
  }

  function removeItem(itemId: string) {
    if (!devis) return
    save({ items: devis.items.filter(i => i.id !== itemId) })
  }

  if (loading) return <div style={{ background: C.paper, minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><span style={{ fontFamily: sans, color: C.muted }}>Chargement…</span></div>
  if (!devis)  return <div style={{ background: C.paper, minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><a href={`/tools/clients/${id}`} style={{ fontFamily: sans, color: C.ink }}>← Retour</a></div>

  const client = devis.sq_clients as Devis['sq_clients']
  const totalMonthly = devis.items.reduce((s, i) => s + (Number(i.price_monthly) || 0), 0)
  const totalSetup   = devis.items.reduce((s, i) => s + (Number(i.price_setup)   || 0), 0)
  const dateStr = new Date(devis.created_at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })
  const validUntil = new Date(new Date(devis.created_at).getTime() + (devis.validity_days ?? 30) * 86400_000).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })

  const inputStyle: React.CSSProperties = { fontFamily: sans, fontSize: 13, color: C.ink, background: 'transparent', border: 'none', borderBottom: `0.5px solid rgba(28,25,23,0.2)`, outline: 'none', padding: '4px 0', width: '100%' }

  return (
    <>
      <style>{`
        @media print {
          .no-print { display: none !important; }
          body { background: white !important; }
          @page { margin: 18mm; }
        }
      `}</style>

      {/* Toolbar */}
      <div className="no-print" style={{ position: 'fixed', top: 0, left: 0, right: 0, zIndex: 100, background: C.warm, borderBottom: `0.5px solid ${C.ink}`, padding: '10px 32px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
          <a href={`/tools/clients/${id}`} style={{ fontFamily: sans, fontSize: 12, color: C.muted, textDecoration: 'none' }}>← {client?.name}</a>
          <span style={{ fontFamily: sans, fontSize: 11, color: STATUS_COLORS[devis.status] ?? C.muted, textTransform: 'uppercase', letterSpacing: '0.14em' }}>{STATUS_LABELS[devis.status] ?? devis.status}</span>
          {saving && <span style={{ fontFamily: sans, fontSize: 11, color: C.muted }}>Sauvegarde…</span>}
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {/* Status buttons */}
          {(['draft', 'sent', 'accepted', 'refused'] as const).map(s => (
            <button key={s} onClick={() => save({ status: s })}
              style={{ fontFamily: sans, fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.12em', padding: '5px 10px', border: `0.5px solid ${C.ink}`, background: devis.status === s ? C.ink : 'transparent', color: devis.status === s ? C.paper : C.muted, cursor: 'pointer', borderRadius: 0 }}>
              {STATUS_LABELS[s]}
            </button>
          ))}
          <div style={{ width: 1, background: C.muted, margin: '0 4px' }} />
          <button onClick={() => setMode(m => m === 'edit' ? 'preview' : 'edit')}
            style={{ fontFamily: sans, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.12em', padding: '6px 14px', border: `0.5px solid ${C.ink}`, background: 'transparent', color: C.ink, cursor: 'pointer', borderRadius: 0 }}>
            {mode === 'edit' ? 'Aperçu' : 'Éditer'}
          </button>
          <button onClick={() => window.print()}
            style={{ fontFamily: sans, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.12em', padding: '6px 14px', border: 'none', background: C.ink, color: C.paper, cursor: 'pointer', borderRadius: 0 }}>
            PDF ↓
          </button>
        </div>
      </div>

      <div style={{ background: C.paper, minHeight: '100vh', paddingTop: 56 }}>
        <div style={{ maxWidth: 860, margin: '0 auto', padding: '48px 48px 96px' }}>

          {/* ── EDIT MODE ── */}
          {mode === 'edit' && (
            <div>
              <div style={{ fontFamily: sans, textTransform: 'uppercase', letterSpacing: '0.14em', fontSize: 11, color: C.muted, marginBottom: 32 }}>Mode édition</div>

              {/* Intro text */}
              <div style={{ marginBottom: 32 }}>
                <div style={{ fontFamily: sans, textTransform: 'uppercase', letterSpacing: '0.14em', fontSize: 9, color: C.muted, marginBottom: 8 }}>Texte d'introduction (optionnel)</div>
                <textarea rows={3} value={devis.intro_text ?? ''} onChange={e => save({ intro_text: e.target.value })} placeholder="Bonjour, suite à notre rencontre…"
                  style={{ ...inputStyle, resize: 'vertical', boxSizing: 'border-box', borderBottom: `0.5px solid ${C.ink}` }} />
              </div>

              {/* Service lines */}
              <div style={{ marginBottom: 24 }}>
                <div style={{ fontFamily: sans, textTransform: 'uppercase', letterSpacing: '0.14em', fontSize: 9, color: C.muted, marginBottom: 16 }}>Lignes de service</div>
                {devis.items.length > 0 && (
                  <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 16 }}>
                    <thead>
                      <tr style={{ background: C.warm }}>
                        {['Service', 'Description', 'Setup (€)', 'Mensuel (€)', ''].map((h, i) => (
                          <th key={i} style={{ fontFamily: sans, fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.14em', color: C.muted, padding: '8px 10px', textAlign: 'left', borderBottom: `0.5px solid ${C.ink}` }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {devis.items.map((item, i) => (
                        <tr key={item.id} style={{ background: i % 2 === 0 ? C.paper : C.warm }}>
                          <td style={{ padding: '8px 10px', borderBottom: `0.5px solid rgba(28,25,23,0.08)` }}>
                            <input value={item.service} onChange={e => updateItem(item.id, 'service', e.target.value)} style={{ ...inputStyle, fontWeight: 600 }} />
                          </td>
                          <td style={{ padding: '8px 10px', borderBottom: `0.5px solid rgba(28,25,23,0.08)` }}>
                            <input value={item.description} onChange={e => updateItem(item.id, 'description', e.target.value)} style={inputStyle} />
                          </td>
                          <td style={{ padding: '8px 10px', borderBottom: `0.5px solid rgba(28,25,23,0.08)`, width: 90 }}>
                            <input type="number" value={item.price_setup} onChange={e => updateItem(item.id, 'price_setup', Number(e.target.value))} style={{ ...inputStyle, width: 70 }} />
                          </td>
                          <td style={{ padding: '8px 10px', borderBottom: `0.5px solid rgba(28,25,23,0.08)`, width: 100 }}>
                            <input type="number" value={item.price_monthly} onChange={e => updateItem(item.id, 'price_monthly', Number(e.target.value))} style={{ ...inputStyle, width: 70 }} />
                          </td>
                          <td style={{ padding: '8px 10px', borderBottom: `0.5px solid rgba(28,25,23,0.08)`, width: 32 }}>
                            <button onClick={() => removeItem(item.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.muted, fontSize: 14 }}>×</button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <button onClick={addBlank} style={{ fontFamily: sans, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.1em', padding: '7px 14px', border: `0.5px solid ${C.ink}`, background: 'transparent', color: C.ink, cursor: 'pointer', borderRadius: 0 }}>+ Ligne vide</button>
                  {SERVICE_PRESETS.map(p => (
                    <button key={p.service} onClick={() => addPreset(p)} style={{ fontFamily: sans, fontSize: 11, padding: '7px 14px', border: `0.5px solid ${C.muted}`, background: 'transparent', color: C.muted, cursor: 'pointer', borderRadius: 0 }}>+ {p.service}</button>
                  ))}
                </div>
              </div>

              {/* Notes */}
              <div style={{ marginBottom: 24 }}>
                <div style={{ fontFamily: sans, textTransform: 'uppercase', letterSpacing: '0.14em', fontSize: 9, color: C.muted, marginBottom: 8 }}>Notes / conditions (optionnel)</div>
                <textarea rows={2} value={devis.notes ?? ''} onChange={e => save({ notes: e.target.value })} placeholder="Engagement 3 mois minimum, prix HT…"
                  style={{ ...inputStyle, resize: 'vertical', boxSizing: 'border-box', borderBottom: `0.5px solid ${C.ink}` }} />
              </div>

              {/* Validity */}
              <div>
                <div style={{ fontFamily: sans, textTransform: 'uppercase', letterSpacing: '0.14em', fontSize: 9, color: C.muted, marginBottom: 8 }}>Validité (jours)</div>
                <input type="number" value={devis.validity_days ?? 30} onChange={e => save({ validity_days: Number(e.target.value) })} style={{ ...inputStyle, width: 60 }} />
              </div>
            </div>
          )}

          {/* ── PREVIEW MODE (also used for print) ── */}
          {mode === 'preview' && (
            <div>
              {/* Header */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 40 }}>
                <div>
                  <div style={{ fontFamily: sans, textTransform: 'uppercase', letterSpacing: '0.2em', fontSize: 9, color: C.muted, marginBottom: 6 }}>Studio Quartier · Proposition commerciale</div>
                  <h1 className={barlow.className} style={{ fontWeight: 900, textTransform: 'uppercase', fontSize: 36, letterSpacing: '-0.01em', lineHeight: 1, margin: '0 0 6px', color: C.ink }}>
                    {client?.name}
                  </h1>
                  <span style={{ fontFamily: sans, fontSize: 12, color: C.muted }}>
                    {[client?.category, client?.neighborhood].filter(Boolean).join(' · ')}
                  </span>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontFamily: sans, fontSize: 11, color: C.muted }}>Émis le {dateStr}</div>
                  <div style={{ fontFamily: sans, fontSize: 11, color: C.muted }}>Valable jusqu'au {validUntil}</div>
                  {client?.contact_name && <div style={{ fontFamily: sans, fontSize: 11, color: C.ink, marginTop: 6, fontWeight: 600 }}>À l'attention de {client.contact_name}</div>}
                </div>
              </div>

              <div style={{ height: '0.5px', background: C.ink, marginBottom: 32 }} />

              {/* Intro */}
              {devis.intro_text && (
                <p style={{ fontFamily: sans, fontSize: 14, color: C.muted, lineHeight: 1.8, marginBottom: 32 }}>{devis.intro_text}</p>
              )}

              {/* Services table */}
              <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 24 }}>
                <thead>
                  <tr style={{ background: C.ink }}>
                    {['Service', 'Description', 'Frais unique', 'Abonnement mensuel'].map((h, i) => (
                      <th key={i} style={{ fontFamily: sans, fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.14em', color: C.paper, padding: '10px 14px', textAlign: i >= 2 ? 'right' : 'left', fontWeight: 600 }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {devis.items.map((item, i) => (
                    <tr key={item.id} style={{ background: i % 2 === 0 ? C.paper : C.warm }}>
                      <td style={{ padding: '12px 14px', fontFamily: sans, fontSize: 13, fontWeight: 600, color: C.ink, borderBottom: `0.5px solid rgba(28,25,23,0.08)`, verticalAlign: 'top', whiteSpace: 'nowrap' }}>{item.service}</td>
                      <td style={{ padding: '12px 14px', fontFamily: sans, fontSize: 12, color: C.muted, borderBottom: `0.5px solid rgba(28,25,23,0.08)`, verticalAlign: 'top' }}>{item.description}</td>
                      <td style={{ padding: '12px 14px', fontFamily: sans, fontSize: 13, color: item.price_setup > 0 ? C.ink : C.muted, borderBottom: `0.5px solid rgba(28,25,23,0.08)`, textAlign: 'right', whiteSpace: 'nowrap', verticalAlign: 'top' }}>
                        {item.price_setup > 0 ? `${item.price_setup.toLocaleString('fr-FR')} €` : '—'}
                      </td>
                      <td style={{ padding: '12px 14px', fontFamily: sans, fontSize: 13, fontWeight: 600, color: C.ink, borderBottom: `0.5px solid rgba(28,25,23,0.08)`, textAlign: 'right', whiteSpace: 'nowrap', verticalAlign: 'top' }}>
                        {item.price_monthly > 0 ? `${item.price_monthly.toLocaleString('fr-FR')} €/mois` : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr style={{ background: C.warm }}>
                    <td colSpan={2} style={{ padding: '12px 14px', fontFamily: sans, fontSize: 12, fontWeight: 700, color: C.ink, textTransform: 'uppercase', letterSpacing: '0.1em', borderTop: `0.5px solid ${C.ink}` }}>Total</td>
                    <td style={{ padding: '12px 14px', fontFamily: sans, fontSize: 14, fontWeight: 700, color: C.ink, textAlign: 'right', borderTop: `0.5px solid ${C.ink}`, whiteSpace: 'nowrap' }}>
                      {totalSetup > 0 ? `${totalSetup.toLocaleString('fr-FR')} €` : '—'}
                    </td>
                    <td style={{ padding: '12px 14px', fontFamily: sans, fontSize: 14, fontWeight: 700, color: C.ink, textAlign: 'right', borderTop: `0.5px solid ${C.ink}`, whiteSpace: 'nowrap' }}>
                      {totalMonthly.toLocaleString('fr-FR')} €/mois
                    </td>
                  </tr>
                </tfoot>
              </table>

              {/* Notes */}
              {devis.notes && (
                <p style={{ fontFamily: sans, fontSize: 12, color: C.muted, lineHeight: 1.7, marginBottom: 40 }}>{devis.notes}</p>
              )}

              {/* Signature block */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 48, marginTop: 48, paddingTop: 32, borderTop: `0.5px solid rgba(28,25,23,0.15)` }}>
                <div>
                  <div style={{ fontFamily: sans, fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.14em', color: C.muted, marginBottom: 40 }}>Bon pour accord — {client?.name}</div>
                  <div style={{ height: '0.5px', background: C.muted, marginBottom: 8 }} />
                  <div style={{ fontFamily: sans, fontSize: 11, color: C.muted }}>Signature · Date</div>
                </div>
                <div>
                  <div style={{ fontFamily: sans, fontWeight: 700, fontSize: 13, color: C.ink }}>Studio Quartier</div>
                  <div style={{ fontFamily: sans, fontSize: 12, color: C.muted, marginTop: 4 }}>Agence de marketing digital · Paris</div>
                  <div style={{ fontFamily: sans, fontSize: 11, color: C.muted, marginTop: 2 }}>studioquartier.fr</div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  )
}
