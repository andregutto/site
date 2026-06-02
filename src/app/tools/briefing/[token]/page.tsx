'use client'

import { useState, useEffect, use } from 'react'
import { C, sans } from '@/lib/sq-design'

// ── Questions de base (toutes catégories) ────────────────────────────────────

const BASE_FIELDS = [
  { key: 'brand_tone',       label: 'En 3 mots, comment décririez-vous votre établissement ?',       placeholder: 'Ex: chaleureux, artisanal, discret…' },
  { key: 'goals',            label: 'Quel est votre principal objectif en ce moment ?',              placeholder: 'Ex: attirer de nouveaux clients, être mieux trouvé sur Google, fidéliser…' },
  { key: 'target_customers', label: 'Qui sont vos meilleurs clients ? Décrivez-les.',                placeholder: 'Ex: femmes actives 30-50 ans du quartier, touristes, familles…' },
  { key: 'visual_refs',      label: 'Des références visuelles ou des établissements qui vous inspirent ?', placeholder: 'Comptes Instagram, sites web, commerces que vous admirez…' },
  { key: 'dont_wants',       label: 'Qu\'est-ce que vous ne voulez absolument pas ?',                placeholder: 'Ex: pas trop moderne, pas de promos agressives, pas de tons criards…' },
  { key: 'color_prefs',      label: 'Avez-vous des couleurs ou un style visuel en tête ?',           placeholder: 'Ex: tons naturels, noir et blanc, les couleurs de votre façade…' },
  { key: 'extra_notes',      label: 'Autre chose que nous devrions savoir ?',                        placeholder: 'Histoire, contraintes, projets à venir, saisons creuses…' },
]

// ── Questions spécifiques par catégorie ──────────────────────────────────────

const CATEGORY_FIELDS: Record<string, { key: string; label: string; placeholder: string }[]> = {
  restaurant: [
    { key: 'goals',  label: 'Quel est votre principal défi en ce moment ?', placeholder: 'Ex: remplir le midi, attirer des réservations le soir, percer sur Deliveroo…' },
    { key: 'extra_notes', label: 'Avez-vous un système de réservation en ligne ? Une carte saisonnière ? Des événements ?', placeholder: 'Détails utiles sur votre offre…' },
  ],
  bakery: [
    { key: 'extra_notes', label: 'Avez-vous des spécialités ou créations uniques que vous souhaitez mettre en avant ?', placeholder: 'Ex: levain maison, pâtisseries signature, pains régionaux…' },
  ],
  cafe: [
    { key: 'extra_notes', label: 'Proposez-vous de la restauration, des événements, du télétravail friendly ?', placeholder: 'Détails sur l\'offre et l\'ambiance…' },
  ],
  beauty_salon: [
    { key: 'target_customers', label: 'Quel est votre profil de clientèle principal ?', placeholder: 'Ex: femmes CSP+, clientèle mixte, focus sur soins du corps, tarifs premium…' },
    { key: 'extra_notes', label: 'Quels sont vos soins phares ou vos équipements différenciants ?', placeholder: 'Ex: laser, soins visage, épilation définitive, marques utilisées…' },
  ],
  spa: [
    { key: 'extra_notes', label: 'Proposez-vous des soins à la carte, des forfaits, des abonnements ? Système de réservation ?', placeholder: 'Détails sur l\'offre et le parcours client…' },
  ],
  hair_care: [
    { key: 'extra_notes', label: 'Quelle est votre spécialité ? Travaillez-vous seul(e) ou avec une équipe ?', placeholder: 'Ex: coloriste, spécialiste afro, salon mixte, coiffeur à domicile…' },
  ],
  florist: [
    { key: 'extra_notes', label: 'Faites-vous des événements, mariages, livraisons ? Avez-vous un abonnement floral ?', placeholder: 'Détails sur vos services…' },
  ],
  bar: [
    { key: 'extra_notes', label: 'Proposez-vous des événements, soirées, DJ ? Une carte cocktails signature ?', placeholder: 'Détails sur l\'ambiance et l\'offre…' },
  ],
}

function getFields(category: string | null) {
  if (!category) return BASE_FIELDS
  const catKey = Object.keys(CATEGORY_FIELDS).find(k => category.toLowerCase().includes(k))
  if (!catKey) return BASE_FIELDS
  const extra = CATEGORY_FIELDS[catKey]
  // Merge: replace matching keys, add new ones
  const merged = [...BASE_FIELDS]
  extra.forEach(ef => {
    const idx = merged.findIndex(f => f.key === ef.key)
    if (idx >= 0) merged[idx] = ef
    else merged.splice(merged.length - 1, 0, ef) // insert before extra_notes
  })
  return merged
}

type FieldKey = string

export default function BriefingPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params)
  const [clientName, setClientName]   = useState('')
  const [category,   setCategory]     = useState<string | null>(null)
  const [loading,    setLoading]      = useState(true)
  const [notFound,   setNotFound]     = useState(false)
  const [alreadyFilled, setAlreadyFilled] = useState(false)
  const [form,       setForm]         = useState<Record<FieldKey, string>>({})
  const [saving,     setSaving]       = useState(false)
  const [saved,      setSaved]        = useState(false)
  const [apiError,   setApiError]     = useState<string | null>(null)

  useEffect(() => {
    fetch(`/api/sq/briefings/${token}`)
      .then(async r => {
        const d = await r.json()
        if (!r.ok || d.error) { setNotFound(true); return }
        const b = d.briefing
        const client = b.sq_clients as any
        setClientName(client?.name ?? '')
        setCategory(client?.category ?? null)
        if (b.filled_at) setAlreadyFilled(true)
        const prefilled: Record<string, string> = {}
        BASE_FIELDS.forEach(f => { if (b[f.key]) prefilled[f.key] = b[f.key] })
        setForm(prefilled)
      })
      .catch(() => setNotFound(true))
      .finally(() => setLoading(false))
  }, [token])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true); setApiError(null)
    try {
      const res = await fetch(`/api/sq/briefings/${token}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) })
      if (!res.ok) throw new Error('Erreur lors de l\'envoi')
      setSaved(true)
    } catch (e: any) {
      setApiError(e.message)
    } finally {
      setSaving(false)
    }
  }

  const inputBase: React.CSSProperties = { fontFamily: sans, fontSize: 14, color: C.ink, background: 'transparent', border: 'none', borderBottom: `0.5px solid ${C.ink}`, outline: 'none', width: '100%', padding: '8px 0', resize: 'vertical' as const, boxSizing: 'border-box' as const }

  if (loading) return (
    <div style={{ background: C.paper, minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <span style={{ fontFamily: sans, color: C.muted, fontSize: 13 }}>Chargement…</span>
    </div>
  )

  if (notFound) return (
    <div style={{ background: C.paper, minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 48 }}>
      <div style={{ maxWidth: 480, textAlign: 'center' }}>
        <div style={{ fontFamily: sans, textTransform: 'uppercase', letterSpacing: '0.18em', fontSize: 11, color: C.muted, marginBottom: 16 }}>Studio Quartier</div>
        <p style={{ fontFamily: sans, fontSize: 15, color: C.ink }}>Ce formulaire n'est plus disponible.</p>
        <p style={{ fontFamily: sans, fontSize: 13, color: C.muted }}>Contactez votre interlocuteur Studio Quartier pour obtenir un nouveau lien.</p>
      </div>
    </div>
  )

  if (saved) return (
    <div style={{ background: C.paper, minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 48 }}>
      <div style={{ maxWidth: 480, textAlign: 'center' }}>
        <div style={{ fontFamily: sans, textTransform: 'uppercase', letterSpacing: '0.18em', fontSize: 11, color: C.muted, marginBottom: 24 }}>Studio Quartier</div>
        <h2 style={{ fontFamily: sans, fontSize: 24, fontWeight: 700, color: C.ink, marginBottom: 16 }}>Merci !</h2>
        <p style={{ fontFamily: sans, fontSize: 15, color: C.muted, lineHeight: 1.7 }}>Vos réponses ont bien été reçues. Nous les utiliserons pour préparer votre accompagnement avec soin.</p>
      </div>
    </div>
  )

  const fields = getFields(category)

  return (
    <div style={{ background: C.paper, minHeight: '100vh', fontFamily: sans, color: C.ink }}>
      <div style={{ maxWidth: 720, margin: '0 auto', padding: '60px 48px 96px' }}>

        {/* Header */}
        <div style={{ marginBottom: 48 }}>
          <div style={{ fontFamily: sans, textTransform: 'uppercase', letterSpacing: '0.2em', fontSize: 10, color: C.muted, marginBottom: 16 }}>Studio Quartier · Formulaire de connaissance</div>
          <h1 style={{ fontFamily: sans, fontSize: 28, fontWeight: 700, color: C.ink, margin: '0 0 6px' }}>{clientName || 'Votre établissement'}</h1>
          {category && <span style={{ fontFamily: sans, fontSize: 13, color: C.muted }}>{category}</span>}
          <div style={{ height: '0.5px', background: C.ink, marginTop: 20 }} />
        </div>

        <p style={{ fontFamily: sans, fontSize: 14, color: C.muted, lineHeight: 1.8, marginBottom: 48 }}>
          Ce formulaire nous aide à mieux vous connaître avant de travailler ensemble. Répondez spontanément — quelques mots suffisent.
        </p>

        {alreadyFilled && (
          <div style={{ background: C.warm, border: `0.5px solid rgba(28,25,23,0.2)`, padding: '12px 16px', marginBottom: 32, fontFamily: sans, fontSize: 13, color: C.muted }}>
            Ce formulaire a déjà été rempli. Vous pouvez modifier vos réponses ci-dessous.
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 40 }}>
            {fields.map((field, i) => (
              <div key={field.key + i}>
                <label style={{ fontFamily: sans, textTransform: 'uppercase', letterSpacing: '0.12em', fontSize: 10, color: C.muted, display: 'block', marginBottom: 10 }}>
                  {String(i + 1).padStart(2, '0')} — {field.label}
                </label>
                <textarea rows={field.key === 'extra_notes' ? 4 : 2}
                  value={form[field.key] ?? ''}
                  onChange={e => setForm(p => ({ ...p, [field.key]: e.target.value }))}
                  placeholder={field.placeholder}
                  style={inputBase}
                />
              </div>
            ))}
          </div>

          {apiError && <p style={{ fontFamily: sans, fontSize: 13, color: '#8C1A1A', marginTop: 24 }}>{apiError}</p>}

          <div style={{ marginTop: 56, display: 'flex', justifyContent: 'flex-end' }}>
            <button type="submit" disabled={saving}
              style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 28px', border: 'none', background: C.ink, color: C.paper, cursor: saving ? 'wait' : 'pointer', opacity: saving ? 0.6 : 1, fontFamily: sans, textTransform: 'uppercase', letterSpacing: '0.12em', fontSize: 12, fontWeight: 700 }}>
              {saving ? 'Envoi…' : 'Envoyer'} <span>→</span>
            </button>
          </div>
        </form>

        <div style={{ marginTop: 64, paddingTop: 24, borderTop: `0.5px solid rgba(28,25,23,0.12)`, fontFamily: sans, fontSize: 11, color: C.muted, textAlign: 'center' }}>
          Studio Quartier · Agence de marketing digital · Paris
        </div>
      </div>
    </div>
  )
}
