'use client'

import { useState, useEffect, use } from 'react'
import { C, sans } from '@/lib/sq-design'

const FIELDS = [
  { key: 'brand_tone',        label: 'En 3 mots, comment décririez-vous votre établissement ?',        placeholder: 'Ex: chaleureux, artisanal, discret…', type: 'text' },
  { key: 'goals',             label: 'Quel est votre principal objectif en ce moment ?',               placeholder: 'Ex: attirer de nouveaux clients, fidéliser les existants, être mieux trouvé sur Google…', type: 'textarea' },
  { key: 'target_customers',  label: 'Qui sont vos meilleurs clients ? Décrivez-les.',                 placeholder: 'Ex: femmes actives 30-50 ans du quartier, touristes, familles…', type: 'textarea' },
  { key: 'competitors',       label: 'Y a-t-il un concurrent ou un établissement que vous admirez ?',  placeholder: 'Nom, adresse ou lien (pas forcément concurrent direct)', type: 'text' },
  { key: 'visual_refs',       label: 'Des références visuelles qui vous inspirent ?',                  placeholder: 'Comptes Instagram, sites web, marques…', type: 'text' },
  { key: 'dont_wants',        label: 'Qu\'est-ce que vous ne voulez absolument pas ?',                 placeholder: 'Ex: pas trop moderne, pas de couleurs vives, pas de promos agressives…', type: 'textarea' },
  { key: 'color_prefs',       label: 'Avez-vous des couleurs ou un style visuel déjà en tête ?',       placeholder: 'Ex: tons naturels, noir et blanc, couleurs de votre façade…', type: 'text' },
  { key: 'extra_notes',       label: 'Autre chose que nous devrions savoir sur votre commerce ?',      placeholder: 'Histoire, contraintes, projets à venir, période creuse…', type: 'textarea' },
] as const

type FieldKey = typeof FIELDS[number]['key']

export default function BriefingPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params)
  const [clientName, setClientName] = useState('')
  const [category,   setCategory]   = useState('')
  const [loading,    setLoading]    = useState(true)
  const [notFound,   setNotFound]   = useState(false)
  const [alreadyFilled, setAlreadyFilled] = useState(false)
  const [form,       setForm]       = useState<Partial<Record<FieldKey, string>>>({})
  const [saving,     setSaving]     = useState(false)
  const [saved,      setSaved]      = useState(false)

  useEffect(() => {
    fetch(`/api/sq/briefings/${token}`)
      .then(r => r.json())
      .then(d => {
        if (d.error) { setNotFound(true); return }
        const b = d.briefing
        const client = b.sq_clients as any
        setClientName(client?.name ?? '')
        setCategory(client?.category ?? '')
        if (b.filled_at) setAlreadyFilled(true)
        const prefilled: Partial<Record<FieldKey, string>> = {}
        FIELDS.forEach(f => { if (b[f.key]) prefilled[f.key] = b[f.key] })
        setForm(prefilled)
      })
      .catch(() => setNotFound(true))
      .finally(() => setLoading(false))
  }, [token])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    await fetch(`/api/sq/briefings/${token}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) })
    setSaved(true); setSaving(false)
  }

  const inputBase: React.CSSProperties = { fontFamily: sans, fontSize: 14, color: C.ink, background: 'transparent', border: 'none', borderBottom: `0.5px solid ${C.ink}`, outline: 'none', width: '100%', padding: '8px 0', resize: 'vertical' as const }

  if (loading) return <div style={{ background: C.paper, minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><span style={{ fontFamily: sans, color: C.muted }}>Chargement…</span></div>

  if (notFound) return (
    <div style={{ background: C.paper, minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 48 }}>
      <div style={{ maxWidth: 480, textAlign: 'center' }}>
        <div style={{ fontFamily: sans, textTransform: 'uppercase', letterSpacing: '0.14em', fontSize: 11, color: C.muted, marginBottom: 16 }}>Studio Quartier</div>
        <p style={{ fontFamily: sans, fontSize: 16, color: C.ink }}>Ce formulaire n'est plus disponible ou a expiré.</p>
      </div>
    </div>
  )

  if (saved) return (
    <div style={{ background: C.paper, minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 48 }}>
      <div style={{ maxWidth: 480, textAlign: 'center' }}>
        <div style={{ fontFamily: sans, textTransform: 'uppercase', letterSpacing: '0.14em', fontSize: 11, color: C.muted, marginBottom: 24 }}>Studio Quartier</div>
        <h2 style={{ fontFamily: sans, fontSize: 24, fontWeight: 700, color: C.ink, marginBottom: 16 }}>Merci !</h2>
        <p style={{ fontFamily: sans, fontSize: 15, color: C.muted, lineHeight: 1.7 }}>Vos réponses ont bien été enregistrées. Nous les prendrons en compte pour préparer votre accompagnement.</p>
      </div>
    </div>
  )

  return (
    <div style={{ background: C.paper, minHeight: '100vh', fontFamily: sans, color: C.ink }}>
      <div style={{ maxWidth: 720, margin: '0 auto', padding: '60px 48px 96px' }}>

        {/* Header */}
        <div style={{ marginBottom: 48 }}>
          <div style={{ fontFamily: sans, textTransform: 'uppercase', letterSpacing: '0.2em', fontSize: 10, color: C.muted, marginBottom: 20 }}>Studio Quartier · Formulaire de connaissance</div>
          <h1 style={{ fontFamily: sans, fontSize: 28, fontWeight: 700, color: C.ink, margin: '0 0 8px' }}>{clientName || 'Votre établissement'}</h1>
          {category && <span style={{ fontFamily: sans, fontSize: 13, color: C.muted }}>{category}</span>}
          <div style={{ height: '0.5px', background: C.ink, marginTop: 20 }} />
        </div>

        <p style={{ fontFamily: sans, fontSize: 14, color: C.muted, lineHeight: 1.8, marginBottom: 48 }}>
          Ce formulaire nous aide à mieux vous connaître avant de travailler ensemble. Il n'y a pas de bonne ou mauvaise réponse — répondez spontanément, en quelques mots ou en détail selon ce qui vous vient naturellement.
        </p>

        {alreadyFilled && (
          <div style={{ background: C.warm, border: `0.5px solid ${C.ink}`, padding: '12px 16px', marginBottom: 32, fontFamily: sans, fontSize: 13, color: C.muted }}>
            Ce formulaire a déjà été rempli. Vous pouvez modifier vos réponses ci-dessous.
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 40 }}>
            {FIELDS.map((field, i) => (
              <div key={field.key}>
                <label style={{ fontFamily: sans, textTransform: 'uppercase', letterSpacing: '0.12em', fontSize: 10, color: C.muted, display: 'block', marginBottom: 10 }}>
                  {String(i + 1).padStart(2, '0')} — {field.label}
                </label>
                {field.type === 'textarea'
                  ? <textarea rows={3} value={form[field.key] ?? ''} onChange={e => setForm(p => ({ ...p, [field.key]: e.target.value }))} placeholder={field.placeholder} style={{ ...inputBase, boxSizing: 'border-box' }} />
                  : <input type="text" value={form[field.key] ?? ''} onChange={e => setForm(p => ({ ...p, [field.key]: e.target.value }))} placeholder={field.placeholder} style={inputBase} />
                }
              </div>
            ))}
          </div>

          <div style={{ marginTop: 56, display: 'flex', justifyContent: 'flex-end' }}>
            <button type="submit" disabled={saving}
              style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 28px', border: 'none', background: C.ink, color: C.paper, cursor: saving ? 'wait' : 'pointer', opacity: saving ? 0.6 : 1 }}>
              <span style={{ fontFamily: sans, textTransform: 'uppercase', letterSpacing: '0.12em', fontSize: 12, fontWeight: 700 }}>{saving ? 'Envoi…' : 'Envoyer'}</span>
              <span>→</span>
            </button>
          </div>
        </form>

        <div style={{ marginTop: 64, paddingTop: 24, borderTop: `0.5px solid rgba(28,25,23,0.15)`, fontFamily: sans, fontSize: 11, color: C.muted, textAlign: 'center' }}>
          Studio Quartier · Agence de marketing digital · Paris
        </div>
      </div>
    </div>
  )
}
