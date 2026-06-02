'use client'

import { useState, useEffect } from 'react'
import { Barlow_Condensed } from 'next/font/google'
import { SQHeader } from '@/components/sq/SQHeader'
import { SQFooter } from '@/components/sq/SQFooter'
import { C, sans } from '@/lib/sq-design'

const barlow = Barlow_Condensed({ weight: ['900'], subsets: ['latin'] })

interface Settings {
  regime_fiscal: string       // 'auto_entrepreneur' | 'societe'
  agency_name: string
  agency_address: string
  agency_email: string
  agency_siret: string
  agency_website: string
}

const DEFAULTS: Settings = {
  regime_fiscal:   'auto_entrepreneur',
  agency_name:     'Studio Quartier',
  agency_address:  'Paris, France',
  agency_email:    '',
  agency_siret:    '',
  agency_website:  'studioquartier.fr',
}

const REGIME_OPTIONS = [
  {
    value: 'auto_entrepreneur',
    label: 'Auto-entrepreneur',
    desc: 'Franchise de TVA (art. 293 B du CGI). Aucune TVA sur vos factures. Seuil : 36 800 €/an pour les prestations de services.',
  },
  {
    value: 'societe',
    label: 'Société (SASU / EURL / SAS)',
    desc: 'TVA à 20% collectée et reversée à l\'État. Factures avec ligne TVA obligatoire.',
  },
]

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 20 }}>
      <span style={{ fontFamily: sans, textTransform: 'uppercase', letterSpacing: '0.14em', fontSize: 11, color: C.ink }}>{children}</span>
      <div style={{ height: '0.5px', background: C.ink, marginTop: 10 }} />
    </div>
  )
}

function Field({ label, hint, value, onChange, placeholder }: {
  label: string; hint?: string; value: string
  onChange: (v: string) => void; placeholder?: string
}) {
  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{ fontFamily: sans, fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.2em', color: C.muted, marginBottom: 4 }}>{label}</div>
      {hint && <div style={{ fontFamily: sans, fontSize: 11, color: C.muted, marginBottom: 6 }}>{hint}</div>}
      <input value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
        style={{ fontFamily: sans, fontSize: 13, color: C.ink, background: 'transparent', border: 'none', borderBottom: `0.5px solid ${C.ink}`, outline: 'none', padding: '4px 0', width: '100%', maxWidth: 400 }} />
    </div>
  )
}

export default function ParametresPage() {
  const [settings, setSettings] = useState<Settings>(DEFAULTS)
  const [loading,  setLoading]  = useState(true)
  const [saving,   setSaving]   = useState(false)
  const [saved,    setSaved]    = useState(false)

  useEffect(() => {
    fetch('/api/sq/settings').then(r => r.json()).then(d => {
      setSettings({ ...DEFAULTS, ...d.settings })
    }).finally(() => setLoading(false))
  }, [])

  function set(key: keyof Settings, value: string) {
    setSettings(prev => ({ ...prev, [key]: value }))
  }

  async function save() {
    setSaving(true)
    const pairs = Object.entries(settings).map(([key, value]) => ({ key, value }))
    await fetch('/api/sq/settings', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(pairs),
    })
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
    setSaving(false)
  }

  if (loading) return (
    <div style={{ background: C.paper, minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <span style={{ fontFamily: sans, fontSize: 13, color: C.muted }}>Chargement…</span>
    </div>
  )

  const tvaNote = settings.regime_fiscal === 'auto_entrepreneur'
    ? 'Les factures afficheront : "TVA non applicable — art. 293 B du CGI"'
    : 'Les factures afficheront une ligne TVA à 20%'

  return (
    <div style={{ background: C.paper, minHeight: '100vh', fontFamily: sans }}>
      <SQHeader />
      <main style={{ maxWidth: 800, margin: '0 auto', padding: '48px 48px 96px' }}>

        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 48 }}>
          <div>
            <h1 className={barlow.className} style={{ fontWeight: 900, textTransform: 'uppercase', fontSize: 36, color: C.ink, margin: '0 0 4px' }}>
              Paramètres
            </h1>
            <p style={{ fontFamily: sans, fontSize: 12, color: C.muted, margin: 0 }}>Configuration de l'agence — appliquée sur toutes les factures</p>
          </div>
          <button onClick={save} disabled={saving}
            style={{ fontFamily: sans, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.12em', padding: '8px 20px', border: 'none', background: C.ink, color: C.paper, cursor: saving ? 'wait' : 'pointer', borderRadius: 0, opacity: saving ? 0.6 : 1 }}>
            {saving ? 'Sauvegarde…' : saved ? 'Sauvegardé ✓' : 'Sauvegarder'}
          </button>
        </div>

        {/* Regime fiscal */}
        <div style={{ marginBottom: 48 }}>
          <SectionTitle>Régime fiscal</SectionTitle>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 16 }}>
            {REGIME_OPTIONS.map(opt => (
              <div key={opt.value}
                onClick={() => set('regime_fiscal', opt.value)}
                style={{ display: 'flex', gap: 16, padding: '16px 20px', border: `0.5px solid ${settings.regime_fiscal === opt.value ? C.ink : 'rgba(28,25,23,0.2)'}`, background: settings.regime_fiscal === opt.value ? C.warm : C.paper, cursor: 'pointer' }}>
                <div style={{ width: 16, height: 16, border: `0.5px solid ${C.ink}`, background: settings.regime_fiscal === opt.value ? C.ink : 'transparent', flexShrink: 0, marginTop: 2, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  {settings.regime_fiscal === opt.value && <span style={{ color: C.paper, fontSize: 9 }}>✓</span>}
                </div>
                <div>
                  <div style={{ fontFamily: sans, fontSize: 14, fontWeight: 600, color: C.ink, marginBottom: 4 }}>{opt.label}</div>
                  <div style={{ fontFamily: sans, fontSize: 12, color: C.muted, lineHeight: 1.6 }}>{opt.desc}</div>
                </div>
              </div>
            ))}
          </div>
          <div style={{ background: settings.regime_fiscal === 'auto_entrepreneur' ? '#186040' + '12' : '#2A42A8' + '12', border: `0.5px solid ${settings.regime_fiscal === 'auto_entrepreneur' ? '#186040' : '#2A42A8'}`, padding: '10px 16px' }}>
            <span style={{ fontFamily: sans, fontSize: 12, color: settings.regime_fiscal === 'auto_entrepreneur' ? '#186040' : '#2A42A8' }}>
              → {tvaNote}
            </span>
          </div>
        </div>

        {/* Informations agence */}
        <div style={{ marginBottom: 48 }}>
          <SectionTitle>Informations de l'agence</SectionTitle>
          <p style={{ fontFamily: sans, fontSize: 12, color: C.muted, marginBottom: 20 }}>
            Ces informations apparaissent sur toutes vos factures et propositions.
          </p>
          <Field label="Nom de l'agence"    value={settings.agency_name}    onChange={v => set('agency_name', v)}    placeholder="Studio Quartier" />
          <Field label="Adresse"            value={settings.agency_address} onChange={v => set('agency_address', v)} placeholder="12 rue des Abbesses, 75018 Paris" />
          <Field label="Email de facturation" hint="Affiché sur les factures" value={settings.agency_email} onChange={v => set('agency_email', v)} placeholder="contact@studioquartier.fr" />
          <Field label="SIRET"              value={settings.agency_siret}   onChange={v => set('agency_siret', v)}   placeholder="XXX XXX XXX XXXXX" />
          <Field label="Site web"           value={settings.agency_website} onChange={v => set('agency_website', v)} placeholder="studioquartier.fr" />
        </div>

        {/* Preview aperçu facture */}
        <div>
          <SectionTitle>Aperçu pied de facture</SectionTitle>
          <div style={{ border: `0.5px solid rgba(28,25,23,0.2)`, padding: '20px 24px', background: C.warm }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
              <div>
                <div style={{ fontFamily: sans, fontWeight: 700, fontSize: 13, color: C.ink }}>{settings.agency_name || 'Studio Quartier'}</div>
                <div style={{ fontFamily: sans, fontSize: 11, color: C.muted }}>{settings.agency_address || 'Paris, France'}</div>
                {settings.agency_email  && <div style={{ fontFamily: sans, fontSize: 11, color: C.muted }}>{settings.agency_email}</div>}
                {settings.agency_siret  && <div style={{ fontFamily: sans, fontSize: 11, color: C.muted }}>SIRET : {settings.agency_siret}</div>}
              </div>
              <div style={{ textAlign: 'right', fontFamily: sans, fontSize: 11, color: C.muted }}>{settings.agency_website || 'studioquartier.fr'}</div>
            </div>
            {settings.regime_fiscal === 'auto_entrepreneur' && (
              <div style={{ fontFamily: sans, fontSize: 10, color: C.muted, marginTop: 12, fontStyle: 'italic' }}>
                TVA non applicable — art. 293 B du CGI
              </div>
            )}
          </div>
        </div>

      </main>
      <SQFooter />
    </div>
  )
}
