'use client'

import { useState, useEffect } from 'react'
import { useTranslation } from '@/lib/i18n'
import { SQHeader } from '@/components/sq/SQHeader'

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

// ── Score badge ───────────────────────────────────────────────────────────────

function ScoreDot({ score }: { score: number | null }) {
  if (score === null) return <span style={{ color: C.muted }}>—</span>
  const bg = score >= 75 ? C.ink : score >= 55 ? '#3D3028' : score >= 35 ? C.warm : C.paper
  const fg = score >= 35 ? C.paper : C.muted
  return (
    <span style={{ display: 'inline-block', background: bg, color: fg, border: `0.5px solid ${bg === C.paper ? C.muted : bg}`, fontFamily: sans, fontSize: 12, fontWeight: 600, padding: '2px 7px', minWidth: 30, textAlign: 'center' }}>
      {score}
    </span>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function ClientsPage() {
  const { t } = useTranslation()
  const [clients,  setClients]  = useState<Client[]>([])
  const [tab,      setTab]      = useState('tous')
  const [loading,  setLoading]  = useState(true)

  const STATUSES = [
    { key: 'tous',         label: t('status_all')         },
    { key: 'prospect',     label: t('status_prospect')    },
    { key: 'en_approche',  label: t('status_en_approche') },
    { key: 'rdv',          label: t('status_rdv')         },
    { key: 'devis_envoye', label: t('status_devis_envoye')},
    { key: 'negocia',      label: t('status_negocia')     },
    { key: 'gagne',        label: t('status_gagne')       },
    { key: 'actif',        label: t('status_actif')       },
    { key: 'perdu',        label: t('status_perdu')       },
  ]

  const STATUS_LABEL: Record<string, string> = Object.fromEntries(STATUSES.map(s => [s.key, s.label]))

  const PRIORITY_LABEL: Record<number, string> = {
    1: t('priority_high'),
    2: t('priority_normal'),
    3: t('priority_low'),
  }

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

  async function deleteClient(id: string, name: string) {
    if (!window.confirm(t('delete_confirm'))) return
    await fetch(`/api/sq/clients/${id}`, { method: 'DELETE' })
    setClients(prev => prev.filter(c => c.id !== id))
  }

  return (
    <div style={{ background: C.paper, minHeight: '100vh', fontFamily: sans, color: C.ink }}>

      <SQHeader links={[{ href: '/tools/prospect', label: t('nav_prospection') }]} badge="CRM" />

      <main style={{ maxWidth: 1300, margin: '0 auto', padding: '48px 48px 96px' }}>

        {/* Section + stats */}
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 40 }}>
          <div>
            <span style={{ fontFamily: sans, textTransform: 'uppercase', letterSpacing: '0.14em', fontSize: 12, color: C.ink }}>
              {t('section_clients')}
            </span>
            <div style={{ height: '0.5px', background: C.ink, marginTop: 14, width: '100%' }} />
          </div>
          {totalRevenue > 0 && (
            <span style={{ fontFamily: sans, textTransform: 'uppercase', letterSpacing: '0.14em', fontSize: 12, color: C.ink }}>
              {t('mrr_label')} · {totalRevenue.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' })}
            </span>
          )}
        </div>

        {/* ── Status tabs ── */}
        <div style={{ display: 'flex', gap: 0, marginBottom: 32, flexWrap: 'wrap' }}>
          {STATUSES.map((s, i) => (
            <button key={s.key} onClick={() => setTab(s.key)}
              style={{
                fontFamily: sans, textTransform: 'uppercase', letterSpacing: '0.14em', fontSize: 11,
                padding: '8px 14px',
                border: `0.5px solid ${C.ink}`,
                borderLeft: i === 0 ? `0.5px solid ${C.ink}` : 'none',
                background: tab === s.key ? C.ink : 'transparent',
                color: tab === s.key ? C.paper : C.ink,
                cursor: 'pointer', borderRadius: 0,
              }}>
              {s.label}
            </button>
          ))}
        </div>

        {/* ── Table ── */}
        {loading && <p style={{ fontFamily: sans, fontSize: 13, color: C.muted }}>{t('progress_loading')}</p>}

        {!loading && clients.length === 0 && (
          <div style={{ padding: '48px 0' }}>
            <p style={{ fontFamily: sans, fontSize: 13, color: C.muted, margin: 0 }}>
              {t('empty_clients')}{' '}
              <a href="/tools/prospect" style={{ color: C.ink }}>{t('btn_add_from_prospect')}</a>
            </p>
          </div>
        )}

        {!loading && clients.length > 0 && (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: C.warm }}>
                  {(['th_num', 'th_business', 'th_status', 'th_score', 'th_category', 'th_contact', 'th_services_active', 'th_monthly_value', 'th_priority', 'th_added_on', ''] as const).map((h, i) => (
                    <th key={i} style={{ fontFamily: sans, textTransform: 'uppercase', letterSpacing: '0.14em', fontSize: 10, color: C.ink, fontWeight: 500, padding: '10px 14px', textAlign: 'left', borderBottom: `0.5px solid ${C.ink}`, whiteSpace: 'nowrap' }}>
                      {h === '' ? '' : t(h)}
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
                        <span style={{ fontFamily: sans, textTransform: 'uppercase', letterSpacing: '0.12em', fontSize: 10, padding: '3px 8px', border: `0.5px solid ${C.ink}`, whiteSpace: 'nowrap' }}>
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
                      <td style={{ ...td, whiteSpace: 'nowrap' }}>
                        <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
                          <a href={`/tools/clients/${c.id}`}
                            style={{ fontFamily: sans, textTransform: 'uppercase', letterSpacing: '0.14em', fontSize: 11, color: C.ink, textDecoration: 'none', borderBottom: `1px solid ${C.ink}`, paddingBottom: 1 }}>
                            {t('btn_dossier')}
                          </a>
                          <button
                            onClick={() => deleteClient(c.id, c.name)}
                            style={{ fontFamily: sans, textTransform: 'uppercase', letterSpacing: '0.14em', fontSize: 10, color: C.muted, background: 'transparent', border: 'none', cursor: 'pointer', padding: 0 }}>
                            {t('btn_delete')}
                          </button>
                        </div>
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
