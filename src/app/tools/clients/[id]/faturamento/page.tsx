'use client'

import { useState, useEffect, use } from 'react'
import { useSearchParams } from 'next/navigation'
import { Barlow_Condensed } from 'next/font/google'
import { C, sans } from '@/lib/sq-design'

const barlow = Barlow_Condensed({ weight: ['900'], subsets: ['latin'] })

interface InvoiceItem { service: string; qty: number; unit_price: number }
interface Invoice {
  id: string; client_id: string; month: string; items: InvoiceItem[]
  total: number; status: string; notes: string | null; invoice_number: string | null
  created_at: string; sent_at: string | null; paid_at: string | null
}

const STATUS_LABELS: Record<string, string> = { brouillon: 'Brouillon', envoyee: 'Envoyée', payee: 'Payée' }
const STATUS_COLORS: Record<string, string> = { brouillon: C.muted, envoyee: '#7c5a00', payee: '#186040' }

function calcTotal(items: InvoiceItem[]) {
  return items.reduce((sum, i) => sum + i.qty * i.unit_price, 0)
}

function InvoiceEditor({ invoice, clientId, onSave, onCancel }: {
  invoice: Partial<Invoice> | null; clientId: string; onSave: (inv: Invoice) => void; onCancel: () => void
}) {
  const today = new Date().toISOString().slice(0, 7)
  const [month,  setMonth]  = useState(invoice?.month ?? today)
  const [items,  setItems]  = useState<InvoiceItem[]>(invoice?.items ?? [{ service: '', qty: 1, unit_price: 0 }])
  const [notes,  setNotes]  = useState(invoice?.notes ?? '')
  const [saving, setSaving] = useState(false)

  const total = calcTotal(items)

  function updateItem(idx: number, field: keyof InvoiceItem, value: string | number) {
    setItems(prev => prev.map((it, i) => i === idx ? { ...it, [field]: value } : it))
  }
  function addItem() { setItems(prev => [...prev, { service: '', qty: 1, unit_price: 0 }]) }
  function removeItem(idx: number) { setItems(prev => prev.filter((_, i) => i !== idx)) }

  async function save() {
    setSaving(true)
    const payload = { client_id: clientId, month, items, total, notes: notes || null, status: invoice?.status ?? 'brouillon' }
    const url  = invoice?.id ? `/api/sq/invoices/${invoice.id}` : '/api/sq/invoices'
    const meth = invoice?.id ? 'PATCH' : 'POST'
    const res  = await fetch(url, { method: meth, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
    const data = await res.json()
    if (data.invoice) onSave(data.invoice)
    setSaving(false)
  }

  return (
    <div style={{ border: `0.5px solid ${C.ink}`, padding: 24, background: C.warm, marginBottom: 24 }}>
      <div style={{ display: 'flex', gap: 24, marginBottom: 20, flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontFamily: sans, fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.2em', color: C.muted, marginBottom: 4 }}>Mois</div>
          <input type="month" value={month} onChange={e => setMonth(e.target.value)}
            style={{ fontFamily: sans, fontSize: 13, color: C.ink, background: 'transparent', border: 'none', borderBottom: `0.5px solid ${C.ink}`, outline: 'none', padding: '2px 0' }} />
        </div>
      </div>

      {/* Line items */}
      <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 12 }}>
        <thead>
          <tr>
            {['Service / Prestation', 'Qté', 'Prix unit. (€)', 'Total (€)', ''].map(h => (
              <th key={h} style={{ fontFamily: sans, fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.18em', color: C.muted, padding: '6px 8px', textAlign: 'left', borderBottom: `0.5px solid rgba(28,25,23,0.15)` }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {items.map((item, idx) => (
            <tr key={idx}>
              <td style={{ padding: '6px 8px' }}>
                <input value={item.service} onChange={e => updateItem(idx, 'service', e.target.value)} placeholder="Nom du service…"
                  style={{ fontFamily: sans, fontSize: 13, color: C.ink, background: 'transparent', border: 'none', borderBottom: `0.5px solid rgba(28,25,23,0.2)`, outline: 'none', padding: '2px 0', width: '100%' }} />
              </td>
              <td style={{ padding: '6px 8px', width: 60 }}>
                <input type="number" value={item.qty} onChange={e => updateItem(idx, 'qty', Number(e.target.value))} min={1}
                  style={{ fontFamily: sans, fontSize: 13, color: C.ink, background: 'transparent', border: 'none', borderBottom: `0.5px solid rgba(28,25,23,0.2)`, outline: 'none', padding: '2px 0', width: '100%' }} />
              </td>
              <td style={{ padding: '6px 8px', width: 120 }}>
                <input type="number" value={item.unit_price} onChange={e => updateItem(idx, 'unit_price', Number(e.target.value))} min={0}
                  style={{ fontFamily: sans, fontSize: 13, color: C.ink, background: 'transparent', border: 'none', borderBottom: `0.5px solid rgba(28,25,23,0.2)`, outline: 'none', padding: '2px 0', width: '100%' }} />
              </td>
              <td style={{ padding: '6px 8px', width: 100, fontFamily: sans, fontSize: 13, color: C.ink }}>
                {(item.qty * item.unit_price).toLocaleString('fr-FR')} €
              </td>
              <td style={{ padding: '6px 8px', width: 36 }}>
                <button onClick={() => removeItem(idx)} style={{ fontFamily: sans, fontSize: 12, padding: '2px 6px', border: `0.5px solid ${C.muted}`, background: 'transparent', color: C.muted, cursor: 'pointer', borderRadius: 0 }}>×</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <button onClick={addItem} style={{ fontFamily: sans, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.1em', padding: '5px 12px', border: `0.5px solid ${C.muted}`, background: 'transparent', color: C.muted, cursor: 'pointer', borderRadius: 0, marginBottom: 20 }}>+ Ligne</button>

      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 20 }}>
        <div style={{ fontFamily: sans, fontSize: 18, fontWeight: 700, color: C.ink }}>Total : {total.toLocaleString('fr-FR')} €</div>
      </div>

      <div style={{ marginBottom: 16 }}>
        <div style={{ fontFamily: sans, fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.2em', color: C.muted, marginBottom: 4 }}>Notes / Conditions</div>
        <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} placeholder="Ex: Paiement à 30 jours…"
          style={{ width: '100%', fontFamily: sans, fontSize: 13, color: C.ink, background: 'transparent', border: 'none', borderBottom: `0.5px solid rgba(28,25,23,0.2)`, outline: 'none', resize: 'none', padding: '4px 0', boxSizing: 'border-box' }} />
      </div>

      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <button onClick={onCancel} style={{ fontFamily: sans, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.1em', padding: '8px 16px', border: `0.5px solid ${C.muted}`, background: 'transparent', color: C.muted, cursor: 'pointer', borderRadius: 0 }}>Annuler</button>
        <button onClick={save} disabled={saving} style={{ fontFamily: sans, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.1em', padding: '8px 20px', border: 'none', background: C.ink, color: C.paper, cursor: saving ? 'wait' : 'pointer', borderRadius: 0, opacity: saving ? 0.6 : 1 }}>
          {saving ? 'Sauvegarde…' : 'Sauvegarder'}
        </button>
      </div>
    </div>
  )
}

function InvoicePreview({ invoice, clientName, onClose }: { invoice: Invoice; clientName: string; onClose: () => void }) {
  const monthLabel = new Date(`${invoice.month}-01`).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })
  const invoiceNum = invoice.invoice_number ?? `SQ-${invoice.month.replace('-', '')}-${invoice.id.slice(-4).toUpperCase()}`

  return (
    <>
      <style>{`
        @media print { .no-print { display: none !important; } body { background: white !important; } @page { margin: 20mm 18mm; } }
        @media screen { .print-page { max-width: 760px; margin: 0 auto; padding: 60px 48px 96px; } }
      `}</style>
      <div className="no-print" style={{ position: 'fixed', top: 0, left: 0, right: 0, zIndex: 100, background: C.warm, borderBottom: `0.5px solid ${C.ink}`, padding: '10px 32px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <button onClick={onClose} style={{ fontFamily: sans, fontSize: 12, color: C.muted, background: 'transparent', border: 'none', cursor: 'pointer', padding: 0 }}>← Retour</button>
        <button onClick={() => window.print()} style={{ fontFamily: sans, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.12em', padding: '6px 16px', border: 'none', background: C.ink, color: C.paper, cursor: 'pointer', borderRadius: 0 }}>
          Sauvegarder PDF ↓
        </button>
      </div>
      <div style={{ background: C.paper, minHeight: '100vh', paddingTop: 60 }}>
        <div className="print-page">
          {/* Header */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 48 }}>
            <div>
              <div style={{ fontFamily: sans, textTransform: 'uppercase', letterSpacing: '0.2em', fontSize: 9, color: C.muted, marginBottom: 6 }}>Studio Quartier · Facture</div>
              <h1 className={barlow.className} style={{ fontWeight: 900, textTransform: 'uppercase', fontSize: 36, letterSpacing: '-0.01em', lineHeight: 1, margin: '0 0 8px', color: C.ink }}>
                {clientName}
              </h1>
              <div style={{ fontFamily: sans, fontSize: 13, color: C.muted }}>{monthLabel}</div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontFamily: sans, fontSize: 13, fontWeight: 700, color: C.ink }}>{invoiceNum}</div>
              <div style={{ fontFamily: sans, fontSize: 11, color: C.muted, marginTop: 4 }}>
                Émise le {new Date(invoice.created_at).toLocaleDateString('fr-FR')}
              </div>
              {invoice.sent_at && <div style={{ fontFamily: sans, fontSize: 11, color: C.muted }}>Envoyée le {new Date(invoice.sent_at).toLocaleDateString('fr-FR')}</div>}
              {invoice.paid_at && <div style={{ fontFamily: sans, fontSize: 11, color: '#186040' }}>Payée le {new Date(invoice.paid_at).toLocaleDateString('fr-FR')} ✓</div>}
            </div>
          </div>

          <div style={{ height: '1px', background: C.ink, marginBottom: 40 }} />

          {/* Items table */}
          <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 32 }}>
            <thead>
              <tr style={{ borderBottom: `0.5px solid rgba(28,25,23,0.3)` }}>
                {['Prestation', 'Qté', 'Prix unitaire', 'Total'].map(h => (
                  <th key={h} style={{ fontFamily: sans, fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.18em', color: C.muted, padding: '8px 0', textAlign: h === 'Qté' || h === 'Prix unitaire' || h === 'Total' ? 'right' : 'left' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {invoice.items.map((item, i) => (
                <tr key={i} style={{ borderBottom: `0.5px solid rgba(28,25,23,0.08)` }}>
                  <td style={{ fontFamily: sans, fontSize: 14, color: C.ink, padding: '12px 0' }}>{item.service}</td>
                  <td style={{ fontFamily: sans, fontSize: 14, color: C.muted, padding: '12px 0', textAlign: 'right' }}>{item.qty}</td>
                  <td style={{ fontFamily: sans, fontSize: 14, color: C.muted, padding: '12px 0', textAlign: 'right' }}>{item.unit_price.toLocaleString('fr-FR')} €</td>
                  <td style={{ fontFamily: sans, fontSize: 14, fontWeight: 600, color: C.ink, padding: '12px 0', textAlign: 'right' }}>{(item.qty * item.unit_price).toLocaleString('fr-FR')} €</td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Total */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 40 }}>
            <div style={{ border: `0.5px solid ${C.ink}`, padding: '16px 24px', minWidth: 240 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 48, fontFamily: sans, fontSize: 13, color: C.muted, marginBottom: 8 }}>
                <span>Sous-total HT</span><span>{invoice.total.toLocaleString('fr-FR')} €</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 48, fontFamily: sans, fontSize: 13, color: C.muted, marginBottom: 12 }}>
                <span>TVA (20%)</span><span>{(invoice.total * 0.2).toLocaleString('fr-FR', { maximumFractionDigits: 2 })} €</span>
              </div>
              <div style={{ height: '0.5px', background: C.ink, marginBottom: 12 }} />
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 48, fontFamily: sans, fontSize: 16, fontWeight: 700, color: C.ink }}>
                <span>Total TTC</span><span>{(invoice.total * 1.2).toLocaleString('fr-FR', { maximumFractionDigits: 2 })} €</span>
              </div>
            </div>
          </div>

          {/* Notes */}
          {invoice.notes && (
            <div style={{ background: C.warm, padding: '16px 20px', marginBottom: 40 }}>
              <div style={{ fontFamily: sans, fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.18em', color: C.muted, marginBottom: 6 }}>Conditions</div>
              <p style={{ fontFamily: sans, fontSize: 13, color: C.ink, margin: 0, lineHeight: 1.7 }}>{invoice.notes}</p>
            </div>
          )}

          {/* Footer */}
          <div style={{ borderTop: `0.5px solid rgba(28,25,23,0.2)`, paddingTop: 24, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div style={{ fontFamily: sans, fontWeight: 700, fontSize: 13, color: C.ink }}>Studio Quartier</div>
              <div style={{ fontFamily: sans, fontSize: 11, color: C.muted }}>Agence de marketing digital · Paris</div>
            </div>
            <div style={{ textAlign: 'right', fontFamily: sans, fontSize: 11, color: C.muted }}>studioquartier.fr</div>
          </div>
        </div>
      </div>
    </>
  )
}

export default function FaturamentoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const searchParams = useSearchParams()
  const fromDevis    = searchParams.get('from_devis')
  const [client,   setClient]   = useState<any>(null)
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [loading,  setLoading]  = useState(true)
  const [editing,  setEditing]  = useState<Partial<Invoice> | null | false>(false)
  const [preview,  setPreview]  = useState<Invoice | null>(null)

  useEffect(() => {
    const requests: Promise<any>[] = [
      fetch(`/api/sq/clients/${id}`).then(r => r.json()),
      fetch(`/api/sq/invoices?client_id=${id}`).then(r => r.json()),
    ]
    if (fromDevis) requests.push(fetch(`/api/sq/devis/${fromDevis}`).then(r => r.json()))

    Promise.all(requests).then(([c, inv, devisData]) => {
      setClient(c.client)
      setInvoices(inv.invoices ?? [])
      // Pre-populate editor from approved devis
      if (devisData?.devis) {
        const d = devisData.devis
        const items: InvoiceItem[] = d.items.map((i: any) => ({
          service:    i.service,
          qty:        1,
          unit_price: Number(i.price_monthly) || 0,
        }))
        const today = new Date().toISOString().slice(0, 7)
        setEditing({ items, month: today, notes: d.notes ?? null })
      }
    }).finally(() => setLoading(false))
  }, [id])

  async function markStatus(inv: Invoice, status: string) {
    const patch: any = { status }
    if (status === 'envoyee' && !inv.sent_at) patch.sent_at = new Date().toISOString()
    if (status === 'payee'   && !inv.paid_at) patch.paid_at = new Date().toISOString()
    const res = await fetch(`/api/sq/invoices/${inv.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(patch) })
    const data = await res.json()
    if (data.invoice) setInvoices(prev => prev.map(i => i.id === inv.id ? data.invoice : i))
  }

  async function deleteInvoice(invId: string) {
    if (!confirm('Supprimer cette facture ?')) return
    await fetch(`/api/sq/invoices/${invId}`, { method: 'DELETE' })
    setInvoices(prev => prev.filter(i => i.id !== invId))
  }

  if (loading) return <div style={{ background: C.paper, minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><span style={{ fontFamily: sans, fontSize: 13, color: C.muted }}>Chargement…</span></div>

  if (preview) return <InvoicePreview invoice={preview} clientName={client?.name ?? ''} onClose={() => setPreview(null)} />

  return (
    <div style={{ background: C.paper, minHeight: '100vh', fontFamily: sans }}>
      {/* Toolbar */}
      <div style={{ position: 'sticky', top: 0, zIndex: 50, background: C.warm, borderBottom: `0.5px solid ${C.ink}`, padding: '10px 32px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <a href={`/tools/clients/${id}`} style={{ fontFamily: sans, fontSize: 12, color: C.muted, textDecoration: 'none' }}>← {client?.name ?? 'Dossier'}</a>
        <button onClick={() => setEditing({})} disabled={editing !== false}
          style={{ fontFamily: sans, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.12em', padding: '6px 16px', border: `0.5px solid ${C.ink}`, background: 'transparent', color: C.ink, cursor: 'pointer', borderRadius: 0, opacity: editing !== false ? 0.4 : 1 }}>
          + Nouvelle facture
        </button>
      </div>

      <main style={{ maxWidth: 900, margin: '0 auto', padding: '48px 48px 96px' }}>
        <h1 className={barlow.className} style={{ fontWeight: 900, textTransform: 'uppercase', fontSize: 36, color: C.ink, margin: '0 0 8px' }}>{client?.name}</h1>
        <p style={{ fontFamily: sans, fontSize: 12, color: C.muted, marginBottom: 40 }}>Facturation</p>

        {/* Editor */}
        {editing !== false && (
          <InvoiceEditor
            invoice={editing || null}
            clientId={id}
            onSave={inv => {
              setInvoices(prev => {
                const idx = prev.findIndex(i => i.id === inv.id)
                if (idx >= 0) { const next = [...prev]; next[idx] = inv; return next }
                return [inv, ...prev]
              })
              setEditing(false)
            }}
            onCancel={() => setEditing(false)}
          />
        )}

        {/* Invoices list */}
        {invoices.length === 0 && editing === false && (
          <div style={{ textAlign: 'center', padding: '60px 0' }}>
            <p style={{ fontFamily: sans, fontSize: 14, color: C.muted }}>Aucune facture pour ce client.</p>
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {invoices.map(inv => {
            const monthLabel = new Date(`${inv.month}-01`).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })
            const invNum = inv.invoice_number ?? `SQ-${inv.month.replace('-', '')}-${inv.id.slice(-4).toUpperCase()}`
            return (
              <div key={inv.id} style={{ border: `0.5px solid ${C.ink}`, padding: '16px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, marginBottom: 4 }}>
                    <span style={{ fontFamily: sans, fontSize: 14, fontWeight: 700, color: C.ink }}>{monthLabel}</span>
                    <span style={{ fontFamily: sans, fontSize: 10, color: C.muted }}>{invNum}</span>
                  </div>
                  <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
                    <span style={{ fontFamily: sans, fontSize: 13, color: C.ink }}>{inv.total.toLocaleString('fr-FR')} € HT</span>
                    <span style={{ fontFamily: sans, fontSize: 11, fontWeight: 600, color: STATUS_COLORS[inv.status] ?? C.muted, textTransform: 'uppercase', letterSpacing: '0.1em' }}>{STATUS_LABELS[inv.status] ?? inv.status}</span>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  <button onClick={() => setPreview(inv)} style={{ fontFamily: sans, fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.1em', padding: '5px 10px', border: `0.5px solid ${C.muted}`, background: 'transparent', color: C.muted, cursor: 'pointer', borderRadius: 0 }}>Aperçu PDF</button>
                  {/* Email button — opens mailto with public link, marks as sent */}
                  <button onClick={async () => {
                    const publicUrl = `${window.location.origin}/facturation/${inv.id}`
                    const subject   = encodeURIComponent(`Facture ${invNum} — Studio Quartier`)
                    const body      = encodeURIComponent(
                      `Bonjour,\n\nVeuillez trouver ci-dessous votre facture ${invNum} pour le mois de ${new Date(`${inv.month}-01`).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })}.\n\nMontant : ${Number(inv.total).toLocaleString('fr-FR')} € HT\n\nConsultez et téléchargez votre facture ici :\n${publicUrl}\n\nCordialement,\nStudio Quartier`
                    )
                    window.open(`mailto:?subject=${subject}&body=${body}`)
                    if (inv.status === 'brouillon') await markStatus(inv, 'envoyee')
                  }} style={{ fontFamily: sans, fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.1em', padding: '5px 10px', border: `0.5px solid #2A42A8`, background: 'transparent', color: '#2A42A8', cursor: 'pointer', borderRadius: 0 }}>✉ Envoyer</button>
                  {inv.status === 'brouillon' && <button onClick={() => markStatus(inv, 'envoyee')} style={{ fontFamily: sans, fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.1em', padding: '5px 10px', border: `0.5px solid #7c5a00`, background: 'transparent', color: '#7c5a00', cursor: 'pointer', borderRadius: 0 }}>Marquer envoyée</button>}
                  {inv.status === 'envoyee'   && <button onClick={() => markStatus(inv, 'payee')}   style={{ fontFamily: sans, fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.1em', padding: '5px 10px', border: `0.5px solid #186040`, background: 'transparent', color: '#186040', cursor: 'pointer', borderRadius: 0 }}>Marquer payée ✓</button>}
                  <button onClick={() => setEditing(inv)} style={{ fontFamily: sans, fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.1em', padding: '5px 10px', border: `0.5px solid ${C.muted}`, background: 'transparent', color: C.muted, cursor: 'pointer', borderRadius: 0 }}>Modifier</button>
                  <button onClick={() => deleteInvoice(inv.id)} style={{ fontFamily: sans, fontSize: 12, padding: '5px 8px', border: `0.5px solid ${C.muted}`, background: 'transparent', color: C.muted, cursor: 'pointer', borderRadius: 0 }}>×</button>
                </div>
              </div>
            )
          })}
        </div>
      </main>
    </div>
  )
}
