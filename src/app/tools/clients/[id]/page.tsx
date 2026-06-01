'use client'

import { useState, useEffect, use, useCallback } from 'react'
import { Barlow_Condensed } from 'next/font/google'
import { useTranslation } from '@/lib/i18n'
import { SQHeader } from '@/components/sq/SQHeader'
import { SQFooter } from '@/components/sq/SQFooter'
import { C, sans, STATUS_COLORS } from '@/lib/sq-design'

const barlow = Barlow_Condensed({ weight: ['900'], subsets: ['latin'] })

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
  website_quality: string | null; review_response_quality: string | null
  score_breakdown: { website: number; social: number; local_seo: number; engagement: number } | null
}

interface Event {
  id: string; created_at: string; client_id: string; type: string
  title: string | null; content: string | null; meta: any
}

// ── Service definitions ───────────────────────────────────────────────────────

interface ServiceDef { label: string; description: string; trigger: string }

const SERVICE_CATALOG: ServiceDef[] = [
  { label: 'Site web moderne',          description: 'Site vitrine professionnel, mobile-first, avec réservation ou prise de commande en ligne.', trigger: 'Pas de site ou site très basique / obsolète' },
  { label: 'Référencement local (SEO)', description: 'Optimisation Google My Business, mots-clés de proximité, citations locales pour apparaître en premier sur la zone.', trigger: 'Peu d\'avis, profil GMB incomplet, mauvais positionnement' },
  { label: 'Gestion réseaux sociaux',   description: 'Création de contenu, calendrier éditorial Instagram & Facebook, stories et publications régulières.', trigger: 'Pas de présence Instagram ou compte inactif' },
  { label: 'Gestion des avis Google (IA)', description: 'Réponses personnalisées, chaleureuses et professionnelles à chaque avis client — automatisées par IA, relues si besoin.', trigger: 'Aucune réponse aux avis ou réponses génériques / irrégulières' },
  { label: 'Photographie professionnelle', description: 'Shooting photo des plats, produits ou espace — pour le site, les réseaux et Google Maps.', trigger: 'Photos absentes ou de mauvaise qualité sur le profil' },
  { label: 'Email marketing',           description: 'Newsletter mensuelle, offres ciblées et fidélisation client par email.', trigger: 'Pas de stratégie de fidélisation visible' },
  { label: 'Publicité locale (Ads)',    description: 'Campagnes Google Ads et Meta Ads géolocalisées pour capter de nouveaux clients dans le quartier.', trigger: 'Peu de visibilité dans le quartier, besoin de trafic rapide' },
]

function matchServices(suggested: string[]): ServiceDef[] {
  const lower = suggested.map(s => s.toLowerCase())
  return SERVICE_CATALOG.filter(def =>
    lower.some(s =>
      def.label.toLowerCase().includes(s) ||
      s.includes(def.label.toLowerCase().split(' ')[0])
    )
  )
}

function scoreLabel(s: number): string {
  if (s >= 75) return 'Très fort potentiel'
  if (s >= 55) return 'Fort potentiel'
  if (s >= 35) return 'Potentiel moyen'
  return 'Faible potentiel'
}

const WEBSITE_QUALITY_LABELS: Record<string, string> = {
  NONE: 'Aucun site', BASIC: 'Site basique', OUTDATED: 'Site obsolète', DECENT: 'Site correct', GOOD: 'Bon site',
}
const REVIEW_QUALITY_COLORS: Record<string, string> = { NONE: C.muted, INCONSISTENT: C.ink, HUMAN: '#2d6a4f' }
const REVIEW_QUALITY_LABELS: Record<string, string> = { NONE: 'N\'y répond pas', INCONSISTENT: 'Réponses irrégulières', HUMAN: 'Répond bien' }

// ── Sub-components ────────────────────────────────────────────────────────────

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 20 }}>
      <span style={{ fontFamily: sans, textTransform: 'uppercase', letterSpacing: '0.14em', fontSize: 11, color: C.ink }}>{children}</span>
      <div style={{ height: '0.5px', background: C.ink, marginTop: 10 }} />
    </div>
  )
}

function Field({ label, value, link }: { label: string; value?: string | number | null; link?: string }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ fontFamily: sans, textTransform: 'uppercase', letterSpacing: '0.2em', fontSize: 9, color: C.muted, marginBottom: 3 }}>{label}</div>
      {link
        ? <a href={link} target="_blank" rel="noopener noreferrer" style={{ fontFamily: sans, fontSize: 13, color: C.ink, textDecoration: 'underline', textUnderlineOffset: 2 }}>{value || link} ↗</a>
        : <div style={{ fontFamily: sans, fontSize: 13, color: value ? C.ink : C.muted }}>{value || '—'}</div>}
    </div>
  )
}

function EditableField({ label, addLabel, editLabel, value, onSave }: { label: string; addLabel: string; editLabel: string; value: string | null; onSave: (v: string) => void }) {
  const [editing, setEditing] = useState(false)
  const [draft,   setDraft]   = useState(value ?? '')
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ fontFamily: sans, textTransform: 'uppercase', letterSpacing: '0.2em', fontSize: 9, color: C.muted, marginBottom: 3 }}>{label}</div>
      {editing ? (
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <input value={draft} onChange={e => setDraft(e.target.value)} autoFocus
            style={{ fontFamily: sans, fontSize: 13, color: C.ink, background: 'transparent', border: 'none', borderBottom: `0.5px solid ${C.ink}`, outline: 'none', padding: '2px 0', flex: 1 }}
            onKeyDown={e => { if (e.key === 'Enter') { onSave(draft); setEditing(false) } if (e.key === 'Escape') setEditing(false) }} />
          <button onClick={() => { onSave(draft); setEditing(false) }}
            style={{ fontFamily: sans, fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.18em', background: C.ink, color: C.paper, border: 'none', padding: '3px 8px', cursor: 'pointer' }}>OK</button>
        </div>
      ) : (
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', cursor: 'pointer' }} onClick={() => setEditing(true)}>
          <span style={{ fontFamily: sans, fontSize: 13, color: value ? C.ink : C.muted }}>{value || addLabel}</span>
          <span style={{ fontFamily: sans, fontSize: 9, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.18em' }}>{editLabel}</span>
        </div>
      )}
    </div>
  )
}

function NotesField({ value, placeholder, saveLabel, onSave }: { value: string | null; placeholder: string; saveLabel: string; onSave: (v: string) => void }) {
  const [draft, setDraft] = useState(value ?? '')
  return (
    <div>
      <textarea value={draft} onChange={e => setDraft(e.target.value)} rows={4} placeholder={placeholder}
        style={{ width: '100%', fontFamily: sans, fontSize: 13, color: C.ink, background: 'transparent', border: 'none', borderBottom: `0.5px solid ${C.ink}`, outline: 'none', resize: 'vertical', padding: '4px 0', boxSizing: 'border-box' }} />
      <button onClick={() => onSave(draft)}
        style={{ marginTop: 8, fontFamily: sans, textTransform: 'uppercase', letterSpacing: '0.18em', fontSize: 9, padding: '5px 12px', border: `0.5px solid ${C.ink}`, background: 'transparent', color: C.muted, cursor: 'pointer', borderRadius: 0 }}>
        {saveLabel}
      </button>
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function ClientDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const { t } = useTranslation()
  const [client,    setClient]    = useState<Client | null>(null)
  const [events,    setEvents]    = useState<Event[]>([])
  const [loading,   setLoading]   = useState(true)
  const [evtType,   setEvtType]   = useState('note')
  const [evtText,   setEvtText]   = useState('')
  const [saving,    setSaving]    = useState(false)
  const [briefing,  setBriefing]  = useState<any>(null)
  const [genBriefing, setGenBriefing] = useState(false)
  const [briefingCopied, setBriefingCopied] = useState(false)
  const [checklist, setChecklist] = useState<any>(null)
  const [newTask,   setNewTask]   = useState('')
  const curMonth = new Date().toISOString().slice(0, 7)

  const STATUSES = [
    { key: 'prospect',     label: t('status_prospect')     },
    { key: 'en_approche',  label: t('status_en_approche')  },
    { key: 'rdv',          label: t('status_rdv')          },
    { key: 'devis_envoye', label: t('status_devis_envoye') },
    { key: 'negocia',      label: t('status_negocia')      },
    { key: 'gagne',        label: t('status_gagne')        },
    { key: 'actif',        label: t('status_actif')        },
    { key: 'perdu',        label: t('status_perdu')        },
  ]

  const EVENT_TYPES = [t('event_note'), t('event_call'), t('event_email'), t('event_meeting'), t('event_proposal'), t('event_contract')]
  const EVENT_ICONS: Record<string, string> = {
    [t('event_note')]: '·', [t('event_call')]: '☎', [t('event_email')]: '✉', [t('event_meeting')]: '◈', [t('event_proposal')]: '◻', [t('event_contract')]: '★',
    note: '·', appel: '☎', email: '✉', réunion: '◈', proposition: '◻', contrat: '★', statut_change: '→',
    nota: '·', ligação: '☎', reunião: '◈', proposta: '◻', contrato: '★',
  }

  useEffect(() => {
    Promise.all([
      fetch(`/api/sq/clients/${id}`).then(r => r.json()),
      fetch(`/api/sq/briefings?client_id=${id}`).then(r => r.json()),
      fetch(`/api/sq/checklists?client_id=${id}&month=${curMonth}`).then(r => r.json()),
    ]).then(([clientData, briefingData, checklistData]) => {
      setClient(clientData.client)
      setEvents(clientData.events ?? [])
      setBriefing(briefingData.briefing)
      setChecklist(checklistData.checklist)
    }).catch(() => {}).finally(() => setLoading(false))
  }, [id])

  async function generateBriefingLink() {
    setGenBriefing(true)
    const res = await fetch('/api/sq/briefings', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ client_id: id }) })
    const d   = await res.json()
    if (d.briefing) setBriefing(d.briefing)
    setGenBriefing(false)
  }

  async function toggleChecklistItem(itemId: string) {
    if (!checklist) return
    const items = checklist.items.map((i: any) => i.id === itemId ? { ...i, done: !i.done } : i)
    setChecklist({ ...checklist, items })
    await fetch('/api/sq/checklists', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ client_id: id, month: curMonth, items }) })
  }

  async function addChecklistTask() {
    if (!newTask.trim() || !checklist) return
    const items = [...checklist.items, { id: crypto.randomUUID(), category: 'Custom', task: newTask.trim(), done: false }]
    setChecklist({ ...checklist, items })
    setNewTask('')
    await fetch('/api/sq/checklists', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ client_id: id, month: curMonth, items }) })
  }

  async function patchClient(patch: Partial<Client>) {
    if (!client) return
    setClient({ ...client, ...patch })
    await fetch(`/api/sq/clients/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(patch) })
  }

  async function changeStatus(newStatus: string) {
    if (!client || newStatus === client.status) return
    const prev = client.status
    await patchClient({ status: newStatus })
    await addEvent('statut_change', `${prev} → ${newStatus}`, { from: prev, to: newStatus })
  }

  async function addEvent(type: string, content: string, meta?: any) {
    const res = await fetch(`/api/sq/clients/${id}/events`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type, content, meta }) })
    const data = await res.json()
    if (data.event) setEvents(prev => [data.event, ...prev])
  }

  async function handleAddEvent() {
    if (!evtText.trim()) return
    setSaving(true); await addEvent(evtType, evtText.trim()); setEvtText(''); setSaving(false)
  }

  if (loading) return (
    <div style={{ background: C.paper, minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <span style={{ fontFamily: sans, fontSize: 13, color: C.muted }}>{t('progress_loading')}</span>
    </div>
  )
  if (!client) return (
    <div style={{ background: C.paper, minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <span style={{ fontFamily: sans, fontSize: 13, color: C.muted }}>{t('client_not_found')} <a href="/tools/clients" style={{ color: C.ink }}>{t('back')}</a></span>
    </div>
  )

  const matchedServices = matchServices(client.services_suggested ?? [])
  const suggestedFallback = client.services_suggested ?? []

  return (
    <div style={{ background: C.paper, minHeight: '100vh', fontFamily: sans, color: C.ink }}>
      <SQHeader />

      <main style={{ maxWidth: 1300, margin: '0 auto', padding: '48px 48px 96px' }}>

        {/* ── Title row ── */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 24, marginBottom: 12 }}>
          <div>
            <h1 style={{ fontFamily: barlow.className, fontWeight: 900, textTransform: 'uppercase', fontSize: 40, letterSpacing: '-0.01em', lineHeight: 1, margin: '0 0 6px', color: C.ink }}>
              {client.name}
            </h1>
            <span style={{ fontFamily: sans, fontSize: 12, color: C.muted }}>
              {[client.category, client.neighborhood].filter(Boolean).join(' · ')}
            </span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'flex-end' }}>
            <span style={{ fontFamily: sans, textTransform: 'uppercase', letterSpacing: '0.14em', fontSize: 11, color: C.ink }}>{t('priority')}</span>
            <div style={{ display: 'flex', gap: 0 }}>
              {[1, 2, 3].map(p => (
                <button key={p} onClick={() => patchClient({ priority: p })}
                  style={{ fontFamily: sans, textTransform: 'uppercase', letterSpacing: '0.14em', fontSize: 11, padding: '6px 12px', border: `0.5px solid ${C.ink}`, borderLeft: p === 1 ? undefined : 'none', background: client.priority === p ? C.ink : 'transparent', color: client.priority === p ? C.paper : C.ink, cursor: 'pointer', borderRadius: 0 }}>
                  {p === 1 ? t('priority_high') : p === 2 ? t('priority_normal') : t('priority_low')}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* ── KPI strip ── */}
        <div style={{ display: 'flex', gap: 0, marginBottom: 28, flexWrap: 'wrap', border: `0.5px solid ${C.ink}` }}>
          {[
            {
              label: 'Score potentiel',
              content: client.score_initial !== null
                ? <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                    <span style={{ fontFamily: sans, fontSize: 28, fontWeight: 700, color: C.ink }}>{client.score_initial}</span>
                    <span style={{ fontFamily: sans, fontSize: 11, color: C.muted }}>/100 · {scoreLabel(client.score_initial)}</span>
                  </div>
                : <span style={{ color: C.muted }}>—</span>,
            },
            {
              label: 'Note Google',
              content: client.google_rating
                ? <div>
                    <span style={{ fontFamily: sans, fontSize: 22, fontWeight: 700 }}>{client.google_rating} ★</span>
                    <span style={{ fontFamily: sans, fontSize: 11, color: C.muted, display: 'block' }}>{client.google_reviews?.toLocaleString('fr-FR')} avis</span>
                  </div>
                : <span style={{ color: C.muted }}>—</span>,
            },
            {
              label: 'Site web',
              content: <div>
                <span style={{ fontFamily: sans, fontSize: 13, color: client.website ? C.ink : C.muted }}>
                  {client.website_quality ? WEBSITE_QUALITY_LABELS[client.website_quality] ?? client.website_quality : client.website ? 'Présent' : 'Aucun site'}
                </span>
                {client.website && <a href={client.website} target="_blank" rel="noopener noreferrer" style={{ display: 'block', fontFamily: sans, fontSize: 11, color: C.muted, textDecoration: 'underline', textUnderlineOffset: 2, marginTop: 2 }}>{client.website.replace(/^https?:\/\//, '').slice(0, 30)} ↗</a>}
              </div>,
            },
            {
              label: 'Réponse aux avis',
              content: <div>
                <span style={{ fontFamily: sans, fontSize: 13, color: client.review_response_quality ? REVIEW_QUALITY_COLORS[client.review_response_quality] ?? C.muted : C.muted }}>
                  {client.review_response_quality ? REVIEW_QUALITY_LABELS[client.review_response_quality] ?? '—' : '—'}
                </span>
                {client.review_response_quality === 'NONE' && <span style={{ display: 'block', fontFamily: sans, fontSize: 10, color: C.muted, marginTop: 2 }}>Opportunité service IA</span>}
              </div>,
            },
            {
              label: 'Instagram',
              content: client.instagram_url
                ? <a href={client.instagram_url} target="_blank" rel="noopener noreferrer" style={{ fontFamily: sans, fontSize: 13, color: C.ink, textDecoration: 'underline', textUnderlineOffset: 2 }}>{client.instagram_url.replace('https://www.instagram.com/', '@')} ↗</a>
                : <span style={{ fontFamily: sans, fontSize: 13, color: C.muted }}>Absent</span>,
            },
          ].map(({ label, content }, i) => (
            <div key={label} style={{ flex: '1 1 0', padding: '16px 20px', borderRight: i < 4 ? `0.5px solid ${C.ink}` : 'none' }}>
              <div style={{ fontFamily: sans, textTransform: 'uppercase', letterSpacing: '0.2em', fontSize: 9, color: C.muted, marginBottom: 8 }}>{label}</div>
              {content}
            </div>
          ))}
        </div>

        {/* ── Status pipeline ── */}
        <div style={{ marginBottom: 40 }}>
          <div style={{ display: 'flex', gap: 0, flexWrap: 'wrap' }}>
            {STATUSES.map((s, i) => {
              const sc = STATUS_COLORS[s.key]
              const isActive = client.status === s.key
              return (
                <button key={s.key} onClick={() => changeStatus(s.key)}
                  style={{ fontFamily: sans, textTransform: 'uppercase', letterSpacing: '0.05em', fontSize: 11, fontWeight: 600, padding: '8px 14px', borderRadius: 0, cursor: 'pointer', border: `0.5px solid ${isActive ? 'transparent' : C.ink}`, borderLeft: i === 0 ? undefined : 'none', background: isActive ? (sc?.bg ?? C.warm) : 'transparent', color: isActive ? (sc?.fg ?? C.ink) : C.muted, boxShadow: isActive ? `inset 0 -2px 0 ${sc?.fg ?? C.ink}` : 'none' }}>
                  {s.label}
                </button>
              )
            })}
          </div>
          <div style={{ height: '0.5px', background: C.ink, marginTop: 24 }} />
        </div>

        {/* ── Action bar ── */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 40, flexWrap: 'wrap' }}>
          {[
            { label: 'Diagnostic client', icon: '◈', href: `/tools/clients/${id}/diagnostic` },
            { label: 'Devis',             icon: '◻', href: `/tools/clients/${id}/devis` },
          ].map(({ label, icon, href }) => (
            <a key={label} href={href}
              style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 18px', border: `0.5px solid ${C.ink}`, color: C.ink, textDecoration: 'none', fontFamily: sans, textTransform: 'uppercase', letterSpacing: '0.12em', fontSize: 11 }}>
              <span style={{ opacity: 0.5 }}>{icon}</span> {label}
            </a>
          ))}
          {/* Briefing */}
          {!briefing
            ? <button onClick={generateBriefingLink} disabled={genBriefing}
                style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 18px', border: `0.5px solid ${C.ink}`, background: 'transparent', color: C.ink, cursor: 'pointer', fontFamily: sans, textTransform: 'uppercase', letterSpacing: '0.12em', fontSize: 11, borderRadius: 0 }}>
                <span style={{ opacity: 0.5 }}>✎</span> {genBriefing ? 'Génération…' : 'Générer lien briefing'}
              </button>
            : <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 18px', border: `0.5px solid ${briefing.filled_at ? '#186040' : C.muted}` }}>
                <span style={{ fontFamily: sans, fontSize: 11, color: briefing.filled_at ? '#186040' : C.muted, textTransform: 'uppercase', letterSpacing: '0.12em' }}>
                  ✎ Briefing {briefing.filled_at ? '— Rempli ✓' : '— En attente'}
                </span>
                <button onClick={() => {
                  navigator.clipboard.writeText(`${window.location.origin}/briefing/${briefing.token}`)
                  setBriefingCopied(true); setTimeout(() => setBriefingCopied(false), 2000)
                }} style={{ fontFamily: sans, fontSize: 10, padding: '3px 8px', border: `0.5px solid ${C.muted}`, background: 'transparent', color: C.muted, cursor: 'pointer', borderRadius: 0 }}>
                  {briefingCopied ? 'Copié ✓' : 'Copier lien'}
                </button>
              </div>
          }
        </div>

        {/* ── Three-column body ── */}
        <div style={{ display: 'grid', gridTemplateColumns: '260px 1fr 1.4fr', gap: 48 }}>

          {/* ── COL 1: Contact & liens ── */}
          <div>
            <div style={{ marginBottom: 36 }}>
              <SectionTitle>{t('section_contact')}</SectionTitle>
              <EditableField label={t('field_contact_name')}  addLabel={t('editable_add')} editLabel={t('editable_edit')} value={client.contact_name}   onSave={v => patchClient({ contact_name: v })} />
              <EditableField label={t('field_contact_role')}  addLabel={t('editable_add')} editLabel={t('editable_edit')} value={client.contact_role}   onSave={v => patchClient({ contact_role: v })} />
              <EditableField label={t('field_email')}         addLabel={t('editable_add')} editLabel={t('editable_edit')} value={client.contact_email}  onSave={v => patchClient({ contact_email: v })} />
              <EditableField label={t('field_mobile')}        addLabel={t('editable_add')} editLabel={t('editable_edit')} value={client.contact_mobile} onSave={v => patchClient({ contact_mobile: v })} />
              <Field label={t('field_phone')} value={client.phone_business} />
            </div>

            <div style={{ marginBottom: 36 }}>
              <SectionTitle>Liens</SectionTitle>
              {client.maps_url && <Field label="Google Maps" link={client.maps_url} value="Voir sur Maps" />}
              {client.address  && <Field label="Adresse" value={client.address} />}
            </div>

            <div>
              <SectionTitle>{t('section_notes')}</SectionTitle>
              <NotesField value={client.notes} placeholder={t('notes_placeholder')} saveLabel={t('btn_save_notes')} onSave={v => patchClient({ notes: v })} />
            </div>
          </div>

          {/* ── COL 2: Services ── */}
          <div>
            <SectionTitle>Services à proposer</SectionTitle>

            {/* AI summary as diagnostic */}
            {client.ai_summary && (
              <div style={{ background: C.warm, border: `0.5px solid rgba(28,25,23,0.15)`, padding: '14px 16px', marginBottom: 24 }}>
                <div style={{ fontFamily: sans, textTransform: 'uppercase', letterSpacing: '0.18em', fontSize: 9, color: C.muted, marginBottom: 6 }}>Diagnostic IA</div>
                <p style={{ fontFamily: sans, fontSize: 13, color: C.ink, lineHeight: 1.7, margin: 0 }}>{client.ai_summary}</p>
              </div>
            )}

            {/* Service cards */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 28 }}>
              {(matchedServices.length > 0 ? matchedServices : suggestedFallback.map(s => ({ label: s, description: '', trigger: '' }))).map(svc => (
                <div key={svc.label} style={{ border: `0.5px solid ${C.ink}`, padding: '14px 16px', background: C.paper }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
                    <span style={{ fontFamily: sans, fontSize: 13, fontWeight: 600, color: C.ink }}>{svc.label}</span>
                    <span style={{ fontFamily: sans, fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.14em', color: C.muted, background: C.warm, padding: '2px 8px', whiteSpace: 'nowrap', flexShrink: 0 }}>suggéré</span>
                  </div>
                  {svc.description && <p style={{ fontFamily: sans, fontSize: 12, color: C.muted, margin: '6px 0 0', lineHeight: 1.6 }}>{svc.description}</p>}
                  {svc.trigger && <p style={{ fontFamily: sans, fontSize: 11, color: C.muted, margin: '4px 0 0', fontStyle: 'italic' }}>Raison : {svc.trigger}</p>}
                </div>
              ))}
            </div>

            {/* Active services + value */}
            <SectionTitle>Contrat actif</SectionTitle>
            <EditableField label={t('field_services_active')}
              addLabel={t('editable_add')} editLabel={t('editable_edit')}
              value={client.services_active?.join(', ') ?? null}
              onSave={v => patchClient({ services_active: v.split(',').map(s => s.trim()).filter(Boolean) })}
            />
            <EditableField label="Valeur mensuelle (€)"
              addLabel={t('editable_add')} editLabel={t('editable_edit')}
              value={client.monthly_value ? `${client.monthly_value} €` : null}
              onSave={v => patchClient({ monthly_value: parseFloat(v.replace(/[^0-9.]/g, '')) || 0 })}
            />
          </div>

          {/* ── COL 3: Timeline ── */}
          <div>
            <SectionTitle>{t('section_activity')}</SectionTitle>

            {/* Add event */}
            <div style={{ border: `0.5px solid ${C.ink}`, padding: 20, marginBottom: 32 }}>
              <div style={{ display: 'flex', gap: 0, marginBottom: 14, flexWrap: 'wrap' }}>
                {EVENT_TYPES.map((type, i) => (
                  <button key={type} onClick={() => setEvtType(type)}
                    style={{ fontFamily: sans, textTransform: 'uppercase', letterSpacing: '0.14em', fontSize: 11, padding: '7px 12px', borderRadius: 0, cursor: 'pointer', border: `0.5px solid ${C.ink}`, borderLeft: i === 0 ? undefined : 'none', background: evtType === type ? C.ink : 'transparent', color: evtType === type ? C.paper : C.ink }}>
                    {type}
                  </button>
                ))}
              </div>
              <textarea value={evtText} onChange={e => setEvtText(e.target.value)} rows={3} placeholder={t('event_placeholder')}
                style={{ width: '100%', fontFamily: sans, fontSize: 13, color: C.ink, background: 'transparent', border: 'none', borderBottom: `0.5px solid ${C.ink}`, outline: 'none', resize: 'none', padding: '8px 0', boxSizing: 'border-box' }} />
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 12 }}>
                <button onClick={handleAddEvent} disabled={saving || !evtText.trim()}
                  style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 18px', border: 'none', borderRadius: 0, background: C.accent, color: C.paper, cursor: 'pointer', opacity: (!evtText.trim() || saving) ? 0.45 : 1 }}>
                  <span style={{ fontFamily: sans, textTransform: 'uppercase', letterSpacing: '0.08em', fontSize: 11, fontWeight: 700 }}>{t('btn_save')}</span>
                  <span>→</span>
                </button>
              </div>
            </div>

            {/* Events */}
            {events.length === 0 && <p style={{ fontFamily: sans, fontSize: 13, color: C.muted }}>{t('empty_activity')}</p>}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
              {events.map(evt => (
                <div key={evt.id} style={{ padding: '14px 0', borderBottom: `0.5px solid rgba(28,25,23,0.1)`, display: 'grid', gridTemplateColumns: '24px 1fr auto', gap: '0 12px', alignItems: 'start' }}>
                  <span style={{ fontFamily: sans, fontSize: 14, color: C.muted, marginTop: 1 }}>{EVENT_ICONS[evt.type] ?? '·'}</span>
                  <div>
                    <span style={{ fontFamily: sans, textTransform: 'uppercase', letterSpacing: '0.18em', fontSize: 9, color: C.ink, display: 'block', marginBottom: 4 }}>{evt.type}</span>
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

        {/* ── Checklist mensuel ── */}
        {checklist && (
          <div style={{ marginTop: 56, paddingTop: 40, borderTop: `0.5px solid ${C.ink}` }}>
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 24 }}>
              <span style={{ fontFamily: sans, textTransform: 'uppercase', letterSpacing: '0.14em', fontSize: 11, color: C.ink }}>
                Checklist — {new Date(curMonth + '-01').toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })}
              </span>
              <span style={{ fontFamily: sans, fontSize: 11, color: C.muted }}>
                {checklist.items.filter((i: any) => i.done).length}/{checklist.items.length} complétées
              </span>
            </div>

            {/* Progress bar */}
            <div style={{ height: 3, background: C.warm, marginBottom: 24, position: 'relative', overflow: 'hidden' }}>
              <div style={{ position: 'absolute', left: 0, top: 0, height: '100%', background: C.ink, width: `${checklist.items.length > 0 ? (checklist.items.filter((i: any) => i.done).length / checklist.items.length) * 100 : 0}%`, transition: 'width 0.3s' }} />
            </div>

            {/* Tasks grouped by category */}
            {Object.entries(
              checklist.items.reduce((acc: Record<string, any[]>, item: any) => {
                const cat = item.category || 'Autre'
                if (!acc[cat]) acc[cat] = []
                acc[cat].push(item)
                return acc
              }, {})
            ).map(([category, items]) => (
              <div key={category} style={{ marginBottom: 20 }}>
                <div style={{ fontFamily: sans, textTransform: 'uppercase', letterSpacing: '0.14em', fontSize: 9, color: C.muted, marginBottom: 8 }}>{category}</div>
                {(items as any[]).map((item: any) => (
                  <div key={item.id} onClick={() => toggleChecklistItem(item.id)}
                    style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 0', borderBottom: `0.5px solid rgba(28,25,23,0.06)`, cursor: 'pointer' }}>
                    <span style={{ width: 16, height: 16, border: `0.5px solid ${item.done ? C.ink : C.muted}`, background: item.done ? C.ink : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      {item.done && <span style={{ color: C.paper, fontSize: 9 }}>✓</span>}
                    </span>
                    <span style={{ fontFamily: sans, fontSize: 13, color: item.done ? C.muted : C.ink, textDecoration: item.done ? 'line-through' : 'none' }}>{item.task}</span>
                  </div>
                ))}
              </div>
            ))}

            {/* Add custom task */}
            <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
              <input value={newTask} onChange={e => setNewTask(e.target.value)} placeholder="Ajouter une tâche…"
                onKeyDown={e => e.key === 'Enter' && addChecklistTask()}
                style={{ flex: 1, fontFamily: sans, fontSize: 13, color: C.ink, background: 'transparent', border: 'none', borderBottom: `0.5px solid ${C.ink}`, outline: 'none', padding: '6px 0' }} />
              <button onClick={addChecklistTask} disabled={!newTask.trim()}
                style={{ fontFamily: sans, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.1em', padding: '6px 14px', border: `0.5px solid ${C.ink}`, background: 'transparent', color: C.ink, cursor: 'pointer', borderRadius: 0, opacity: newTask.trim() ? 1 : 0.4 }}>
                + Ajouter
              </button>
            </div>
          </div>
        )}

      </main>
      <SQFooter />
    </div>
  )
}
