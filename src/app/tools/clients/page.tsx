'use client'

import { useState, useEffect } from 'react'
import { Barlow_Condensed } from 'next/font/google'

const barlow = Barlow_Condensed({ weight: ['900'], subsets: ['latin'] })
const C = { paper: '#FDFAF5', ink: '#1C1917', warm: '#F4F0E6', muted: '#6B6760' }
const sans = 'Arial, "Helvetica Neue", Helvetica, sans-serif'

// ── Types ─────────────────────────────────────────────────────────────────────

interface Client {
  id:               string
  created_at:       string
  updated_at:       string
  name:             string
  address:          string | null
  neighborhood:     string | null
  category:         string | null
  phone_business:   string | null
  website:          string | null
  instagram_url:    string | null
  google_rating:    number | null
  google_reviews:   number | null
  score_initial:    number | null
  services_suggested: string[] | null
  ai_summary:       string | null
  status:           string
  contact_name:     string | null
  contact_email:    string | null
  contact_mobile:   string | null
  services_active:  string[] | null
  monthly_value:    number | null
  priority:         number
}

// ── Status config ─────────────────────────────────────────────────────────────

const STATUSES = [
  { key: 'tous',          label: 'Tous' },
  { key: 'prospect',      label: 'Prospect' },
  { key: 'en_approche',   label: 'En approche' },
  { key: 'rdv',           label: 'RDV' },
  { key: 'devis_envoye',  label: 'Devis envoyé' },
  { key: 'negocia',       label: 'Négociation' },
  { key: 'gagne',         label: 'Gagné' },
  { key: 'actif',         label: 'Client actif' },
  { key: 'perdu',         label: 'Perdu' },
]

const STATUS_LABEL: Record<string, string> = Object.fromEntries(STATUSES.map(s => [s.key, s.label]))

const PRIORITY_LABEL: Record<number, string> = { 1: 'Haute', 2: 'Normale', 3: 'Basse' }

// ── Score badge ───────────────────────────────────────────────────────────────

function ScoreDot({ score }: { score: number | null }) {
  if (score === null) return <span style={{ color: C.muted }}>—</span>
  const bg = score >= 75 ? C.ink : score >= 55 ? '#3D3028' : score >= 35 ? C.warm : C.paper
  const fg = score >= 35 ? C.paper : C.muted
  return (
    <span style={{ display: 'inline-block', background: bg, color: fg, border: `0.5px solid ${bg === C.paper ? C.muted : bg}`, fontFamily: sans, fontSize: 11, padding: '2px 7px', minWidth: 30, textAlign: 'center' }}>
      {score}
    </span>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function ClientsPage() {
  const [clients,  setClients]  = useState<Client[]>([])
  const [tab,      setTab]      = useState('tous')
  const [loading,  setLoading]  = useState(true)

  useEffect(() => {
    const url = tab === 'tous' ? '/api/sq/clients' : `/api/sq/clients?status=${tab}`
    setLoading(true)
    fetch(url)
      .then(r => r.json())
      .then(d => setClients(d.clients ?? []))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [tab])

  const totalRevenue = clients
    .filter(c => c.status === 'actif' || c.status === 'gagne')
    .reduce((s, c) => s + (c.monthly_value ?? 0), 0)

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
            <a href="/tools/prospect" style={{ fontFamily: sans, textTransform: 'uppercase', letterSpacing: '0.22em', fontSize: 10, color: C.muted, textDecoration: 'none' }}>← Prospection</a>
            <span style={{ fontFamily: sans, textTransform: 'uppercase', letterSpacing: '0.22em', fontSize: 10, color: C.muted }}>CRM</span>
          </div>
        </div>
        <div style={{ height: '0.5px', background: C.ink, marginLeft: 48, marginRight: 48 }} />
      </header>

      <main style={{ maxWidth: 1300, margin: '0 auto', padding: '48px 48px 96px' }}>

        {/* Section + stats */}
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 40 }}>
          <div>
            <span style={{ fontFamily: sans, textTransform: 'uppercase', letterSpacing: '0.22em', fontSize: 10, color: C.muted }}>
              Clients · Pipeline commercial
            </span>
            <div style={{ height: '0.5px', background: C.ink, marginTop: 12, width: '100%' }} />
          </div>
          {totalRevenue > 0 && (
            <span style={{ fontFamily: sans, textTransform: 'uppercase', letterSpacing: '0.18em', fontSize: 10, color: C.muted }}>
              MRR actif · {totalRevenue.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' })}
            </span>
          )}
        </div>

        {/* ── Status tabs ── */}
        <div style={{ display: 'flex', gap: 0, marginBottom: 32, flexWrap: 'wrap' }}>
          {STATUSES.map((s, i) => (
            <button key={s.key} onClick={() => setTab(s.key)}
              style={{
                fontFamily: sans, textTransform: 'uppercase', letterSpacing: '0.18em', fontSize: 9,
                padding: '8px 14px',
                border: `0.5px solid ${C.ink}`,
                borderLeft: i === 0 ? `0.5px solid ${C.ink}` : 'none',
                background: tab === s.key ? C.ink : 'transparent',
                color: tab === s.key ? C.paper : C.muted,
                cursor: 'pointer', borderRadius: 0,
              }}>
              {s.label}
            </button>
          ))}
        </div>

        {/* ── Table ── */}
        {loading && <p style={{ fontFamily: sans, fontSize: 13, color: C.muted }}>Chargement…</p>}

        {!loading && clients.length === 0 && (
          <div style={{ padding: '48px 0' }}>
            <p style={{ fontFamily: sans, fontSize: 13, color: C.muted, margin: 0 }}>
              Aucun client dans cette catégorie.{' '}
              <a href="/tools/prospect" style={{ color: C.ink }}>Ajouter depuis la prospection →</a>
            </p>
          </div>
        )}

        {!loading && clients.length > 0 && (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: C.warm }}>
                  {['N°', 'Établissement', 'Statut', 'Score', 'Catégorie', 'Contact', 'Services actifs', 'Valeur/mois', 'Priorité', 'Ajouté le', ''].map(h => (
                    <th key={h} style={{ fontFamily: sans, textTransform: 'uppercase', letterSpacing: '0.18em', fontSize: 9, color: C.muted, fontWeight: 400, padding: '10px 14px', textAlign: 'left', borderBottom: `0.5px solid ${C.ink}`, whiteSpace: 'nowrap' }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {clients.map((c, i) => {
                  const td: React.CSSProperties = { padding: '11px 14px', verticalAlign: 'middle', borderBottom: `0.5px solid rgba(28,25,23,0.08)`, fontSize: 13, fontFamily: sans, color: C.ink }
                  return (
                    <tr key={c.id} style={{ background: i % 2 === 0 ? C.paper : C.warm }}>
                      <td style={{ ...td, color: C.muted, fontSize: 10 }}>{i + 1}</td>
                      <td style={{ ...td, fontWeight: 500, maxWidth: 200 }}>{c.name}</td>
                      <td style={td}>
                        <span style={{ fontFamily: sans, textTransform: 'uppercase', letterSpacing: '0.18em', fontSize: 9, padding: '3px 8px', border: `0.5px solid ${C.ink}`, whiteSpace: 'nowrap' }}>
                          {STATUS_LABEL[c.status] ?? c.status}
                        </span>
                      </td>
                      <td style={td}><ScoreDot score={c.score_initial} /></td>
                      <td style={{ ...td, color: C.muted, fontSize: 12 }}>{c.category ?? '—'}</td>
                      <td style={{ ...td, fontSize: 12 }}>
                        {c.contact_name
                          ? <div><div>{c.contact_name}</div>{c.contact_email && <div style={{ color: C.muted, fontSize: 11 }}>{c.contact_email}</div>}</div>
                          : <span style={{ color: C.muted }}>—</span>
                        }
                      </td>
                      <td style={{ ...td, maxWidth: 180, fontSize: 12, color: C.muted }}>
                        {c.services_active?.length ? c.services_active.join(', ') : '—'}
                      </td>
                      <td style={td}>
                        {c.monthly_value
                          ? c.monthly_value.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' })
                          : <span style={{ color: C.muted }}>—</span>
                        }
                      </td>
                      <td style={{ ...td, color: C.muted, fontSize: 11 }}>
                        {PRIORITY_LABEL[c.priority] ?? '—'}
                      </td>
                      <td style={{ ...td, color: C.muted, fontSize: 11, whiteSpace: 'nowrap' }}>
                        {new Date(c.created_at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}
                      </td>
                      <td style={td}>
                        <a href={`/tools/clients/${c.id}`}
                          style={{ fontFamily: sans, textTransform: 'uppercase', letterSpacing: '0.18em', fontSize: 10, color: C.ink, textDecoration: 'none', whiteSpace: 'nowrap' }}>
                          Dossier →
                        </a>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </main>
    </div>
  )
}
