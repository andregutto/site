'use client'

import { useState, useEffect, use } from 'react'
import { Barlow_Condensed } from 'next/font/google'

const barlow = Barlow_Condensed({ weight: ['900'], subsets: ['latin'] })
const C = { paper: '#FDFAF5', ink: '#1C1917', warm: '#F4F0E6', muted: '#6B6760' }
const sans = 'Arial, "Helvetica Neue", Helvetica, sans-serif'

// ── Types ─────────────────────────────────────────────────────────────────────

interface Client {
  id: string; name: string; address: string | null; neighborhood: string | null
  category: string | null; phone_business: string | null; website: string | null
  instagram_url: string | null; maps_url: string | null; google_rating: number | null
  google_reviews: number | null; score_initial: number | null
  services_suggested: string[] | null; ai_summary: string | null; status: string
  contact_name: string | null; contact_role: string | null; contact_email: string | null
  contact_mobile: string | null; first_contact_at: string | null; meeting_at: string | null
  proposal_at: string | null; signed_at: string | null; services_active: string[] | null
  monthly_value: number | null; contract_months: number | null; notes: string | null; priority: number
}

interface Event {
  id: string; created_at: string; client_id: string; type: string
  title: string | null; content: string | null; meta: any
}

// ── Config ────────────────────────────────────────────────────────────────────

const STATUSES = [
  { key: 'prospect',     label: 'Prospect'      },
  { key: 'en_approche',  label: 'En approche'   },
  { key: 'rdv',          label: 'RDV'           },
  { key: 'devis_envoye', label: 'Devis envoyé'  },
  { key: 'negocia',      label: 'Négociation'   },
  { key: 'gagne',        label: 'Gagné'         },
  { key: 'actif',        label: 'Client actif'  },
  { key: 'perdu',        label: 'Perdu'         },
]

const EVENT_TYPES = ['note', 'appel', 'email', 'réunion', 'proposition', 'contrat']
const EVENT_ICONS: Record<string, string> = {
  note: '·', appel: '☎', email: '✉', réunion: '◈', proposition: '◻', contrat: '★', statut_change: '→',
}

// ── Sub-components ────────────────────────────────────────────────────────────

function Field({ label, value }: { label: string; value: string | number | null | undefined }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ fontFamily: sans, textTransform: 'uppercase', letterSpacing: '0.2em', fontSize: 9, color: C.muted, marginBottom: 4 }}>{label}</div>
      <div style={{ fontFamily: sans, fontSize: 13, color: value ? C.ink : C.muted }}>{value || '—'}</div>
    </div>
  )
}

function EditableField({ label, value, onSave }: { label: string; value: string | null; onSave: (v: string) => void }) {
  const [editing, setEditing] = useState(false)
  const [draft,   setDraft]   = useState(value ?? '')
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ fontFamily: sans, textTransform: 'uppercase', letterSpacing: '0.2em', fontSize: 9, color: C.muted, marginBottom: 4 }}>{label}</div>
      {editing ? (
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <input
            value={draft}
            onChange={e => setDraft(e.target.value)}
            autoFocus
            style={{ fontFamily: sans, fontSize: 13, color: C.ink, background: 'transparent', border: 'none', borderBottom: `0.5px solid ${C.ink}`, outline: 'none', padding: '2px 0', flex: 1 }}
            onKeyDown={e => { if (e.key === 'Enter') { onSave(draft); setEditing(false) } if (e.key === 'Escape') setEditing(false) }}
          />
          <button onClick={() => { onSave(draft); setEditing(false) }}
            style={{ fontFamily: sans, fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.18em', background: C.ink, color: C.paper, border: 'none', padding: '3px 8px', cursor: 'pointer' }}>
            OK
          </button>
        </div>
      ) : (
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', cursor: 'pointer' }} onClick={() => setEditing(true)}>
          <span style={{ fontFamily: sans, fontSize: 13, color: value ? C.ink : C.muted }}>{value || 'Ajouter…'}</span>
          <span style={{ fontFamily: sans, fontSize: 9, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.18em' }}>Modifier</span>
        </div>
      )}
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function ClientDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const [client,  setClient]  = useState<Client | null>(null)
  const [events,  setEvents]  = useState<Event[]>([])
  const [loading, setLoading] = useState(true)
  const [evtType, setEvtType] = useState('note')
  const [evtText, setEvtText] = useState('')
  const [saving,  setSaving]  = useState(false)

  useEffect(() => {
    fetch(`/api/sq/clients/${id}`)
      .then(r => r.json())
      .then(d => { setClient(d.client); setEvents(d.events ?? []) })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [id])

  async function patchClient(patch: Partial<Client>) {
    if (!client) return
    const updated = { ...client, ...patch }
    setClient(updated)
    await fetch(`/api/sq/clients/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    })
  }

  async function changeStatus(newStatus: string) {
    if (!client || newStatus === client.status) return
    const prev = client.status
    await patchClient({ status: newStatus })
    await addEvent('statut_change', `${prev} → ${newStatus}`, { from: prev, to: newStatus })
  }

  async function addEvent(type: string, content: string, meta?: any) {
    const res = await fetch(`/api/sq/clients/${id}/events`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type, content, meta }),
    })
    const data = await res.json()
    if (data.event) setEvents(prev => [data.event, ...prev])
  }

  async function handleAddEvent() {
    if (!evtText.trim()) return
    setSaving(true)
    await addEvent(evtType, evtText.trim())
    setEvtText('')
    setSaving(false)
  }

  if (loading) return (
    <div style={{ background: C.paper, minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <span style={{ fontFamily: sans, fontSize: 13, color: C.muted }}>Chargement…</span>
    </div>
  )

  if (!client) return (
    <div style={{ background: C.paper, minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <span style={{ fontFamily: sans, fontSize: 13, color: C.muted }}>Client introuvable. <a href="/tools/clients" style={{ color: C.ink }}>← Retour</a></span>
    </div>
  )

  return (
    <div style={{ background: C.paper, minHeight: '100vh', fontFamily: sans, color: C.ink }}>

      {/* ── Header ── */}
      <header style={{ background: C.paper }}>
        <div style={{ maxWidth: 1300, margin: '0 auto', padding: '48px 48px 36px', display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between' }}>
          <div style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'flex-start' }}>
            <span style={{ fontFamily: sans, letterSpacing: '0.6em', fontSize: 13, color: C.muted, marginLeft: 2 }}>studio</span>
            <span className={barlow.className} style={{ fontWeight: 900, textTransform: 'uppercase', letterSpacing: '-0.02em', fontSize: 52, lineHeight: 0.9, color: C.ink, marginTop: -2 }}>QUARTIER</span>
            <div style={{ width: '100%', height: '0.5px', background: C.ink, margin: '6px 0 4px' }} />
            <span style={{ fontFamily: sans, textTransform: 'uppercase', letterSpacing: '0.22em', fontSize: 10, color: C.muted }}>Marketing Digital · Paris</span>
          </div>
          <div style={{ display: 'flex', gap: 28, alignItems: 'center', paddingBottom: 4 }}>
            <a href="/tools/clients" style={{ fontFamily: sans, textTransform: 'uppercase', letterSpacing: '0.22em', fontSize: 10, color: C.muted, textDecoration: 'none' }}>← Clients</a>
            <span style={{ fontFamily: sans, textTransform: 'uppercase', letterSpacing: '0.22em', fontSize: 10, color: C.muted }}>Dossier</span>
          </div>
        </div>
        <div style={{ height: '0.5px', background: C.ink, marginLeft: 48, marginRight: 48 }} />
      </header>

      <main style={{ maxWidth: 1300, margin: '0 auto', padding: '48px 48px 96px' }}>

        {/* ── Client title + status pipeline ── */}
        <div style={{ marginBottom: 40 }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 24 }}>
            <div>
              <h1 style={{ fontFamily: barlow.className, fontWeight: 900, textTransform: 'uppercase', fontSize: 40, letterSpacing: '-0.01em', lineHeight: 1, margin: '0 0 6px', color: C.ink }}>
                {client.name}
              </h1>
              <span style={{ fontFamily: sans, fontSize: 12, color: C.muted }}>
                {[client.category, client.neighborhood, client.address].filter(Boolean).join(' · ')}
              </span>
            </div>
            {/* Priority */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'flex-end' }}>
              <span style={{ fontFamily: sans, textTransform: 'uppercase', letterSpacing: '0.2em', fontSize: 9, color: C.muted }}>Priorité</span>
              <div style={{ display: 'flex', gap: 0 }}>
                {[1, 2, 3].map(p => (
                  <button key={p} onClick={() => patchClient({ priority: p })}
                    style={{ fontFamily: sans, textTransform: 'uppercase', letterSpacing: '0.16em', fontSize: 9, padding: '5px 10px', border: `0.5px solid ${C.ink}`, borderLeft: p === 1 ? `0.5px solid ${C.ink}` : 'none', background: client.priority === p ? C.ink : 'transparent', color: client.priority === p ? C.paper : C.muted, cursor: 'pointer', borderRadius: 0 }}>
                    {p === 1 ? 'Haute' : p === 2 ? 'Normale' : 'Basse'}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Status pipeline */}
          <div style={{ marginTop: 24, display: 'flex', gap: 0, flexWrap: 'wrap' }}>
            {STATUSES.map((s, i) => (
              <button key={s.key} onClick={() => changeStatus(s.key)}
                style={{
                  fontFamily: sans, textTransform: 'uppercase', letterSpacing: '0.16em', fontSize: 9,
                  padding: '8px 12px', borderRadius: 0, cursor: 'pointer',
                  border: `0.5px solid ${C.ink}`,
                  borderLeft: i === 0 ? `0.5px solid ${C.ink}` : 'none',
                  background: client.status === s.key ? C.ink : 'transparent',
                  color: client.status === s.key ? C.paper : C.muted,
                }}>
                {s.label}
              </button>
            ))}
          </div>
          <div style={{ height: '0.5px', background: C.ink, marginTop: 32 }} />
        </div>

        {/* ── Two-column body ── */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.5fr', gap: 64 }}>

          {/* ── LEFT: Info ── */}
          <div>

            {/* Contact */}
            <div style={{ marginBottom: 40 }}>
              <span style={{ fontFamily: sans, textTransform: 'uppercase', letterSpacing: '0.22em', fontSize: 9, color: C.muted }}>Contact</span>
              <div style={{ height: '0.5px', background: C.ink, marginTop: 10, marginBottom: 20 }} />
              <EditableField label="Nom du contact"    value={client.contact_name}   onSave={v => patchClient({ contact_name: v })} />
              <EditableField label="Rôle / Fonction"   value={client.contact_role}   onSave={v => patchClient({ contact_role: v })} />
              <EditableField label="Email"             value={client.contact_email}  onSave={v => patchClient({ contact_email: v })} />
              <EditableField label="Mobile"            value={client.contact_mobile} onSave={v => patchClient({ contact_mobile: v })} />
            </div>

            {/* Business */}
            <div style={{ marginBottom: 40 }}>
              <span style={{ fontFamily: sans, textTransform: 'uppercase', letterSpacing: '0.22em', fontSize: 9, color: C.muted }}>Établissement</span>
              <div style={{ height: '0.5px', background: C.ink, marginTop: 10, marginBottom: 20 }} />
              <Field label="Téléphone"       value={client.phone_business} />
              <Field label="Score IA initial" value={client.score_initial !== null ? `${client.score_initial}/100` : null} />
              <Field label="Note Google"     value={client.google_rating ? `${client.google_rating} ★ (${client.google_reviews?.toLocaleString('fr-FR')} avis)` : null} />
              {client.website && <div style={{ marginBottom: 16 }}>
                <div style={{ fontFamily: sans, textTransform: 'uppercase', letterSpacing: '0.2em', fontSize: 9, color: C.muted, marginBottom: 4 }}>Site web</div>
                <a href={client.website} target="_blank" rel="noopener noreferrer" style={{ fontFamily: sans, fontSize: 13, color: C.ink, textDecoration: 'underline', textUnderlineOffset: 2 }}>
                  {client.website.replace(/^https?:\/\//, '')} ↗
                </a>
              </div>}
              {client.instagram_url && <div style={{ marginBottom: 16 }}>
                <div style={{ fontFamily: sans, textTransform: 'uppercase', letterSpacing: '0.2em', fontSize: 9, color: C.muted, marginBottom: 4 }}>Instagram</div>
                <a href={client.instagram_url} target="_blank" rel="noopener noreferrer" style={{ fontFamily: sans, fontSize: 13, color: C.ink, textDecoration: 'underline', textUnderlineOffset: 2 }}>
                  {client.instagram_url.replace('https://www.instagram.com/', '@')} ↗
                </a>
              </div>}
              {client.maps_url && <div style={{ marginBottom: 16 }}>
                <div style={{ fontFamily: sans, textTransform: 'uppercase', letterSpacing: '0.2em', fontSize: 9, color: C.muted, marginBottom: 4 }}>Google Maps</div>
                <a href={client.maps_url} target="_blank" rel="noopener noreferrer" style={{ fontFamily: sans, color: C.ink, textDecoration: 'none', textTransform: 'uppercase', letterSpacing: '0.16em', fontSize: 11 }}>Maps ↗</a>
              </div>}
            </div>

            {/* Services */}
            <div style={{ marginBottom: 40 }}>
              <span style={{ fontFamily: sans, textTransform: 'uppercase', letterSpacing: '0.22em', fontSize: 9, color: C.muted }}>Services</span>
              <div style={{ height: '0.5px', background: C.ink, marginTop: 10, marginBottom: 20 }} />
              {client.services_suggested?.length ? (
                <div style={{ marginBottom: 16 }}>
                  <div style={{ fontFamily: sans, textTransform: 'uppercase', letterSpacing: '0.2em', fontSize: 9, color: C.muted, marginBottom: 8 }}>Suggérés par IA</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {client.services_suggested.map(s => (
                      <span key={s} style={{ fontFamily: sans, fontSize: 11, padding: '3px 10px', border: `0.5px solid ${C.muted}`, color: C.muted }}>{s}</span>
                    ))}
                  </div>
                </div>
              ) : null}
              <EditableField label="Services actifs (séparés par virgule)"
                value={client.services_active?.join(', ') ?? null}
                onSave={v => patchClient({ services_active: v.split(',').map(s => s.trim()).filter(Boolean) })}
              />
              <EditableField label="Valeur mensuelle (€)"
                value={client.monthly_value?.toString() ?? null}
                onSave={v => patchClient({ monthly_value: parseFloat(v) || 0 })}
              />
            </div>

            {/* AI summary */}
            {client.ai_summary && (
              <div style={{ marginBottom: 40 }}>
                <span style={{ fontFamily: sans, textTransform: 'uppercase', letterSpacing: '0.22em', fontSize: 9, color: C.muted }}>Analyse IA initiale</span>
                <div style={{ height: '0.5px', background: C.ink, marginTop: 10, marginBottom: 14 }} />
                <p style={{ fontFamily: sans, fontSize: 13, color: C.muted, lineHeight: 1.7, margin: 0 }}>{client.ai_summary}</p>
              </div>
            )}

            {/* Notes */}
            <div>
              <span style={{ fontFamily: sans, textTransform: 'uppercase', letterSpacing: '0.22em', fontSize: 9, color: C.muted }}>Notes internes</span>
              <div style={{ height: '0.5px', background: C.ink, marginTop: 10, marginBottom: 14 }} />
              <NotesField value={client.notes} onSave={v => patchClient({ notes: v })} />
            </div>

          </div>

          {/* ── RIGHT: Timeline ── */}
          <div>
            <span style={{ fontFamily: sans, textTransform: 'uppercase', letterSpacing: '0.22em', fontSize: 9, color: C.muted }}>Activité</span>
            <div style={{ height: '0.5px', background: C.ink, marginTop: 10, marginBottom: 24 }} />

            {/* Add event form */}
            <div style={{ border: `0.5px solid ${C.ink}`, padding: 20, marginBottom: 32 }}>
              <div style={{ display: 'flex', gap: 0, marginBottom: 14, flexWrap: 'wrap' }}>
                {EVENT_TYPES.map((t, i) => (
                  <button key={t} onClick={() => setEvtType(t)}
                    style={{ fontFamily: sans, textTransform: 'uppercase', letterSpacing: '0.16em', fontSize: 9, padding: '6px 10px', borderRadius: 0, cursor: 'pointer', border: `0.5px solid ${C.ink}`, borderLeft: i === 0 ? `0.5px solid ${C.ink}` : 'none', background: evtType === t ? C.ink : 'transparent', color: evtType === t ? C.paper : C.muted }}>
                    {t}
                  </button>
                ))}
              </div>
              <textarea
                value={evtText}
                onChange={e => setEvtText(e.target.value)}
                rows={3}
                placeholder="Ajouter une note, résumé d'appel, compte rendu de réunion…"
                style={{ width: '100%', fontFamily: sans, fontSize: 13, color: C.ink, background: 'transparent', border: 'none', borderBottom: `0.5px solid ${C.ink}`, outline: 'none', resize: 'none', padding: '8px 0', boxSizing: 'border-box' }}
              />
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 12 }}>
                <button onClick={handleAddEvent} disabled={saving || !evtText.trim()}
                  style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 16px', border: `0.5px solid ${C.ink}`, borderRadius: 0, background: C.ink, color: C.paper, cursor: 'pointer', opacity: (!evtText.trim() || saving) ? 0.5 : 1 }}>
                  <span style={{ fontFamily: sans, textTransform: 'uppercase', letterSpacing: '0.22em', fontSize: 10 }}>Enregistrer</span>
                  <span>→</span>
                </button>
              </div>
            </div>

            {/* Events list */}
            {events.length === 0 && (
              <p style={{ fontFamily: sans, fontSize: 13, color: C.muted }}>Aucune activité enregistrée.</p>
            )}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
              {events.map(evt => (
                <div key={evt.id} style={{ padding: '14px 0', borderBottom: `0.5px solid rgba(28,25,23,0.1)`, display: 'grid', gridTemplateColumns: '24px 1fr auto', gap: '0 12px', alignItems: 'start' }}>
                  <span style={{ fontFamily: sans, fontSize: 14, color: C.muted, marginTop: 1 }}>{EVENT_ICONS[evt.type] ?? '·'}</span>
                  <div>
                    <span style={{ fontFamily: sans, textTransform: 'uppercase', letterSpacing: '0.18em', fontSize: 9, color: C.ink, display: 'block', marginBottom: 4 }}>
                      {evt.type}
                    </span>
                    <p style={{ fontFamily: sans, fontSize: 13, color: C.ink, margin: 0, lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{evt.content}</p>
                  </div>
                  <span style={{ fontFamily: sans, fontSize: 10, color: C.muted, whiteSpace: 'nowrap' }}>
                    {new Date(evt.created_at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}
                  </span>
                </div>
              ))}
            </div>

          </div>
        </div>
      </main>
    </div>
  )
}

function NotesField({ value, onSave }: { value: string | null; onSave: (v: string) => void }) {
  const [draft, setDraft] = useState(value ?? '')
  return (
    <div>
      <textarea
        value={draft}
        onChange={e => setDraft(e.target.value)}
        rows={4}
        placeholder="Notes internes sur ce client…"
        style={{ width: '100%', fontFamily: sans, fontSize: 13, color: C.ink, background: 'transparent', border: 'none', borderBottom: `0.5px solid ${C.ink}`, outline: 'none', resize: 'vertical', padding: '4px 0', boxSizing: 'border-box' }}
      />
      <button onClick={() => onSave(draft)}
        style={{ marginTop: 8, fontFamily: sans, textTransform: 'uppercase', letterSpacing: '0.18em', fontSize: 9, padding: '5px 12px', border: `0.5px solid ${C.ink}`, background: 'transparent', color: C.muted, cursor: 'pointer', borderRadius: 0 }}>
        Sauvegarder
      </button>
    </div>
  )
}
