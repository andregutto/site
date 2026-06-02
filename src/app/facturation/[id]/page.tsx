'use client'

import { useState, useEffect, use } from 'react'
import { Barlow_Condensed } from 'next/font/google'
import { C, sans } from '@/lib/sq-design'

const barlow = Barlow_Condensed({ weight: ['900'], subsets: ['latin'] })

const SETTINGS_DEFAULTS = { regime_fiscal: 'auto_entrepreneur', agency_name: 'Studio Quartier', agency_address: 'Paris, France', agency_email: '', agency_siret: '', agency_website: 'studioquartier.fr' }

export default function PublicInvoicePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const [invoice,  setInvoice]  = useState<any>(null)
  const [settings, setSettings] = useState(SETTINGS_DEFAULTS)
  const [loading,  setLoading]  = useState(true)

  useEffect(() => {
    Promise.all([
      fetch(`/api/sq/invoices/${id}`).then(r => r.json()),
      fetch('/api/sq/settings').then(r => r.json()),
    ]).then(([inv, cfg]) => {
      setInvoice(inv.invoice)
      setSettings({ ...SETTINGS_DEFAULTS, ...cfg.settings })
    }).finally(() => setLoading(false))
  }, [id])

  if (loading) return (
    <div style={{ background: C.paper, minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <span style={{ fontFamily: sans, fontSize: 13, color: C.muted }}>Chargement…</span>
    </div>
  )
  if (!invoice) return (
    <div style={{ background: C.paper, minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <span style={{ fontFamily: sans, fontSize: 13, color: C.muted }}>Facture introuvable.</span>
    </div>
  )

  const client     = invoice.sq_clients
  const monthLabel = new Date(`${invoice.month}-01`).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })
  const invNum     = invoice.invoice_number ?? `SQ-${invoice.month.replace('-', '')}-${invoice.id.slice(-4).toUpperCase()}`

  return (
    <>
      <style>{`
        @media print { .no-print { display: none !important; } body { background: white !important; } @page { margin: 20mm 18mm; } }
        .print-page { max-width: 760px; margin: 0 auto; padding: 60px 48px 96px; }
      `}</style>

      <div className="no-print" style={{ background: C.warm, borderBottom: `0.5px solid ${C.ink}`, padding: '12px 32px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontFamily: sans, fontSize: 12, color: C.muted }}>Studio Quartier · Facture {invNum}</span>
        <button onClick={() => window.print()}
          style={{ fontFamily: sans, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.12em', padding: '6px 16px', border: 'none', background: C.ink, color: C.paper, cursor: 'pointer', borderRadius: 0 }}>
          Enregistrer PDF ↓
        </button>
      </div>

      <div style={{ background: C.paper, minHeight: '100vh' }}>
        <div className="print-page">
          {/* Header */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 48 }}>
            <div>
              <div style={{ fontFamily: sans, textTransform: 'uppercase', letterSpacing: '0.2em', fontSize: 9, color: C.muted, marginBottom: 6 }}>Studio Quartier · Facture</div>
              <h1 className={barlow.className} style={{ fontWeight: 900, textTransform: 'uppercase', fontSize: 36, letterSpacing: '-0.01em', lineHeight: 1, margin: '0 0 8px', color: C.ink }}>
                {client?.name}
              </h1>
              <div style={{ fontFamily: sans, fontSize: 13, color: C.muted, textTransform: 'capitalize' }}>{monthLabel}</div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontFamily: sans, fontSize: 14, fontWeight: 700, color: C.ink }}>{invNum}</div>
              <div style={{ fontFamily: sans, fontSize: 11, color: C.muted, marginTop: 4 }}>Émise le {new Date(invoice.created_at).toLocaleDateString('fr-FR')}</div>
              {invoice.sent_at  && <div style={{ fontFamily: sans, fontSize: 11, color: C.muted }}>Envoyée le {new Date(invoice.sent_at).toLocaleDateString('fr-FR')}</div>}
              {invoice.paid_at  && <div style={{ fontFamily: sans, fontSize: 11, color: '#186040', fontWeight: 600 }}>Payée le {new Date(invoice.paid_at).toLocaleDateString('fr-FR')} ✓</div>}
            </div>
          </div>

          <div style={{ height: '1px', background: C.ink, marginBottom: 40 }} />

          {/* Items */}
          <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 32 }}>
            <thead>
              <tr style={{ borderBottom: `0.5px solid rgba(28,25,23,0.3)` }}>
                {['Prestation', 'Qté', 'Prix unitaire', 'Total'].map((h, i) => (
                  <th key={h} style={{ fontFamily: sans, fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.18em', color: C.muted, padding: '8px 0', textAlign: i > 0 ? 'right' : 'left', fontWeight: 400 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(invoice.items ?? []).map((item: any, i: number) => (
                <tr key={i} style={{ borderBottom: `0.5px solid rgba(28,25,23,0.08)` }}>
                  <td style={{ fontFamily: sans, fontSize: 14, color: C.ink, padding: '12px 0' }}>{item.service}</td>
                  <td style={{ fontFamily: sans, fontSize: 14, color: C.muted, padding: '12px 0', textAlign: 'right' }}>{item.qty}</td>
                  <td style={{ fontFamily: sans, fontSize: 14, color: C.muted, padding: '12px 0', textAlign: 'right' }}>{Number(item.unit_price).toLocaleString('fr-FR')} €</td>
                  <td style={{ fontFamily: sans, fontSize: 14, fontWeight: 600, color: C.ink, padding: '12px 0', textAlign: 'right' }}>{(item.qty * item.unit_price).toLocaleString('fr-FR')} €</td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Total */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 40 }}>
            <div style={{ border: `0.5px solid ${C.ink}`, padding: '16px 24px', minWidth: 260 }}>
              {settings.regime_fiscal === 'societe' ? (
                <>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 48, fontFamily: sans, fontSize: 13, color: C.muted, marginBottom: 8 }}>
                    <span>Sous-total HT</span><span>{Number(invoice.total).toLocaleString('fr-FR')} €</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 48, fontFamily: sans, fontSize: 13, color: C.muted, marginBottom: 12 }}>
                    <span>TVA (20%)</span><span>{(Number(invoice.total) * 0.2).toLocaleString('fr-FR', { maximumFractionDigits: 2 })} €</span>
                  </div>
                  <div style={{ height: '0.5px', background: C.ink, marginBottom: 12 }} />
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 48, fontFamily: sans, fontSize: 16, fontWeight: 700, color: C.ink }}>
                    <span>Total TTC</span><span>{(Number(invoice.total) * 1.2).toLocaleString('fr-FR', { maximumFractionDigits: 2 })} €</span>
                  </div>
                </>
              ) : (
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 48, fontFamily: sans, fontSize: 16, fontWeight: 700, color: C.ink }}>
                  <span>Total</span><span>{Number(invoice.total).toLocaleString('fr-FR')} €</span>
                </div>
              )}
            </div>
          </div>

          {invoice.notes && (
            <div style={{ background: C.warm, padding: '16px 20px', marginBottom: 40 }}>
              <p style={{ fontFamily: sans, fontSize: 13, color: C.ink, margin: 0, lineHeight: 1.7 }}>{invoice.notes}</p>
            </div>
          )}

          {/* Footer */}
          <div style={{ borderTop: `0.5px solid rgba(28,25,23,0.2)`, paddingTop: 24 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
              <div>
                <div style={{ fontFamily: sans, fontWeight: 700, fontSize: 13, color: C.ink }}>{settings.agency_name}</div>
                <div style={{ fontFamily: sans, fontSize: 11, color: C.muted }}>{settings.agency_address}</div>
                {settings.agency_email && <div style={{ fontFamily: sans, fontSize: 11, color: C.muted }}>{settings.agency_email}</div>}
                {settings.agency_siret && <div style={{ fontFamily: sans, fontSize: 11, color: C.muted }}>SIRET : {settings.agency_siret}</div>}
              </div>
              <div style={{ fontFamily: sans, fontSize: 11, color: C.muted }}>{settings.agency_website}</div>
            </div>
            {settings.regime_fiscal === 'auto_entrepreneur' && (
              <div style={{ fontFamily: sans, fontSize: 10, color: C.muted, marginTop: 10, fontStyle: 'italic' }}>
                TVA non applicable — art. 293 B du CGI
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  )
}
