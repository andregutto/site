'use client'

import { useState, useEffect } from 'react'
import { Barlow_Condensed } from 'next/font/google'
import { SQHeader } from '@/components/sq/SQHeader'
import { SQFooter } from '@/components/sq/SQFooter'
import { C, sans } from '@/lib/sq-design'

const barlow = Barlow_Condensed({ weight: ['900'], subsets: ['latin'] })

interface Invoice {
  id: string; client_id: string; month: string; items: any[]
  total: number; status: string; notes: string | null
  created_at: string; sent_at: string | null; paid_at: string | null
  sq_clients?: { id: string; name: string }
}

const STATUS_LABELS: Record<string, string> = { brouillon: 'Brouillon', envoyee: 'Envoyée', payee: 'Payée' }
const STATUS_COLORS: Record<string, string> = { brouillon: C.muted, envoyee: '#7c5a00', payee: '#186040' }

function monthsBetween(from: string, to: string): string[] {
  const result: string[] = []
  const [fy, fm] = from.split('-').map(Number)
  const [ty, tm] = to.split('-').map(Number)
  let y = fy, m = fm
  while (y < ty || (y === ty && m <= tm)) {
    result.push(`${y}-${String(m).padStart(2, '0')}`)
    m++; if (m > 12) { m = 1; y++ }
  }
  return result
}

export default function FinancesPage() {
  const [invoices,     setInvoices]     = useState<Invoice[]>([])
  const [loading,      setLoading]      = useState(true)
  const [filterStatus, setFilterStatus] = useState<string>('all')
  const [filterClient, setFilterClient] = useState<string>('all')
  const [viewMode,     setViewMode]     = useState<'table' | 'cashflow'>('table')
  const [generating,   setGenerating]   = useState(false)
  const [genResult,    setGenResult]    = useState<string | null>(null)
  const [regime,       setRegime]       = useState<string>('auto_entrepreneur')

  useEffect(() => {
    Promise.all([
      fetch('/api/sq/invoices').then(r => r.json()),
      fetch('/api/sq/settings').then(r => r.json()),
    ]).then(([inv, cfg]) => {
      setInvoices(inv.invoices ?? [])
      setRegime(cfg.settings?.regime_fiscal ?? 'auto_entrepreneur')
    }).finally(() => setLoading(false))
  }, [])

  async function generateRecurring() {
    setGenerating(true); setGenResult(null)
    const res  = await fetch('/api/sq/invoices/auto-generate', { method: 'POST' })
    const data = await res.json()
    if (data.created > 0) {
      setGenResult(`${data.created} facture(s) créée(s) : ${data.clients_created.join(', ')}`)
      // Reload invoices
      const inv = await fetch('/api/sq/invoices').then(r => r.json())
      setInvoices(inv.invoices ?? [])
    } else {
      setGenResult('Aucune nouvelle facture à générer (déjà créées ce mois ou aucun devis récurrent actif).')
    }
    setGenerating(false)
  }

  async function markStatus(inv: Invoice, status: string) {
    const patch: any = { status }
    if (status === 'envoyee' && !inv.sent_at) patch.sent_at = new Date().toISOString()
    if (status === 'payee'   && !inv.paid_at) patch.paid_at = new Date().toISOString()
    const res  = await fetch(`/api/sq/invoices/${inv.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(patch) })
    const data = await res.json()
    if (data.invoice) setInvoices(prev => prev.map(i => i.id === inv.id ? { ...i, ...data.invoice, sq_clients: i.sq_clients } : i))
  }

  const clients = Array.from(
    new Map(invoices.filter(i => i.sq_clients).map(i => [i.client_id, i.sq_clients!.name])).entries()
  ).map(([id, name]) => ({ id, name }))

  const visible = invoices.filter(inv =>
    (filterStatus === 'all' || inv.status === filterStatus) &&
    (filterClient === 'all' || inv.client_id === filterClient)
  )

  // KPIs
  const totalInvoiced  = invoices.reduce((s, i) => s + Number(i.total), 0)
  const totalReceived  = invoices.filter(i => i.status === 'payee').reduce((s, i) => s + Number(i.total), 0)
  const totalPending   = invoices.filter(i => i.status === 'envoyee').reduce((s, i) => s + Number(i.total), 0)
  const totalDraft     = invoices.filter(i => i.status === 'brouillon').reduce((s, i) => s + Number(i.total), 0)

  // Estimativa só para auto-entrepreneur (société é variável — depende de salário, dividendos, IS)
  const cotisRate   = 0.221
  const cotisations = regime === 'auto_entrepreneur' ? totalReceived * cotisRate : 0
  const netEstime   = totalReceived - cotisations

  // Cash flow by month
  const allMonths = invoices.length > 0
    ? monthsBetween(
        invoices.reduce((min, i) => i.month < min ? i.month : min, invoices[0].month),
        new Date().toISOString().slice(0, 7)
      )
    : []

  const cashflowData = allMonths.map(mo => {
    const monthInvoices = invoices.filter(i => i.month === mo)
    return {
      month: mo,
      invoiced: monthInvoices.reduce((s, i) => s + Number(i.total), 0),
      received: monthInvoices.filter(i => i.status === 'payee').reduce((s, i) => s + Number(i.total), 0),
    }
  })

  const maxVal = Math.max(...cashflowData.map(d => d.invoiced), 1)

  return (
    <div style={{ background: C.paper, minHeight: '100vh', fontFamily: sans }}>
      <SQHeader />
      <main style={{ maxWidth: 1200, margin: '0 auto', padding: '40px 48px 96px' }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 36, gap: 16, flexWrap: 'wrap' }}>
          <div>
            <h1 className={barlow.className} style={{ fontWeight: 900, textTransform: 'uppercase', fontSize: 36, color: C.ink, margin: '0 0 4px' }}>
              Finances
            </h1>
            <p style={{ fontFamily: sans, fontSize: 12, color: C.muted, margin: 0 }}>Suivi des factures et des encaissements</p>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6 }}>
            <button onClick={generateRecurring} disabled={generating}
              style={{ fontFamily: sans, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.12em', padding: '8px 16px', border: `0.5px solid ${C.ink}`, background: 'transparent', color: C.ink, cursor: generating ? 'wait' : 'pointer', borderRadius: 0, opacity: generating ? 0.6 : 1 }}>
              {generating ? 'Génération…' : '↻ Générer factures récurrentes'}
            </button>
            {genResult && <span style={{ fontFamily: sans, fontSize: 11, color: C.muted, maxWidth: 320, textAlign: 'right' }}>{genResult}</span>}
          </div>
        </div>

        {/* KPI strip */}
        <div style={{ display: 'flex', gap: 0, border: `0.5px solid ${C.ink}`, marginBottom: 16 }}>
          {[
            { label: 'Total facturé', val: totalInvoiced, color: C.ink },
            { label: 'Encaissé', val: totalReceived, color: '#186040' },
            { label: 'En attente', val: totalPending, color: '#7c5a00' },
            { label: 'Brouillons', val: totalDraft, color: C.muted },
          ].map(({ label, val, color }, i) => (
            <div key={label} style={{ flex: 1, padding: '20px 24px', borderRight: i < 3 ? `0.5px solid ${C.ink}` : 'none' }}>
              <div style={{ fontFamily: sans, fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.2em', color: C.muted, marginBottom: 8 }}>{label}</div>
              <div style={{ fontFamily: sans, fontSize: 28, fontWeight: 700, color }}>
                {val.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 })}
              </div>
            </div>
          ))}
        </div>

        {/* Estimativa fiscal — só mostra se houver receita encaissada */}
        {totalReceived > 0 && (
          <div style={{ display: 'flex', gap: 0, border: `0.5px solid rgba(28,25,23,0.2)`, borderTop: 'none', marginBottom: 40, background: C.warm }}>
            {regime === 'auto_entrepreneur' ? (
              <>
                <div style={{ flex: 1, padding: '12px 24px', borderRight: `0.5px solid rgba(28,25,23,0.15)` }}>
                  <div style={{ fontFamily: sans, fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.2em', color: C.muted, marginBottom: 4 }}>
                    Cotisations URSSAF (~22%)
                  </div>
                  <div style={{ fontFamily: sans, fontSize: 18, fontWeight: 600, color: '#8C1A1A' }}>
                    −{cotisations.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 })}
                  </div>
                </div>
                <div style={{ flex: 1, padding: '12px 24px', borderRight: `0.5px solid rgba(28,25,23,0.15)` }}>
                  <div style={{ fontFamily: sans, fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.2em', color: C.muted, marginBottom: 4 }}>Net estimé</div>
                  <div style={{ fontFamily: sans, fontSize: 18, fontWeight: 700, color: '#186040' }}>
                    {netEstime.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 })}
                  </div>
                </div>
                <div style={{ flex: 2, padding: '12px 24px', display: 'flex', alignItems: 'center' }}>
                  <span style={{ fontFamily: sans, fontSize: 11, color: C.muted, lineHeight: 1.5 }}>
                    Estimation indicative. Cotisations sociales à déclarer sur <a href="https://www.autoentrepreneur.urssaf.fr" target="_blank" rel="noopener noreferrer" style={{ color: C.ink }}>urssaf.fr</a>. TVA non applicable.
                  </span>
                </div>
              </>
            ) : (
              <div style={{ flex: 1, padding: '12px 24px', display: 'flex', alignItems: 'center' }}>
                <span style={{ fontFamily: sans, fontSize: 11, color: C.muted, lineHeight: 1.5 }}>
                  En société, les charges dépendent de votre rémunération, dividendes et résultat. Consultez un comptable pour estimer votre net.
                </span>
              </div>
            )}
          </div>
        )}

        {/* Cash flow bar chart */}
        {cashflowData.length > 0 && (
          <div style={{ marginBottom: 48 }}>
            <div style={{ fontFamily: sans, textTransform: 'uppercase', letterSpacing: '0.14em', fontSize: 11, color: C.ink, marginBottom: 20 }}>
              Flux de trésorerie par mois
            </div>
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, height: 120, paddingBottom: 28, position: 'relative' }}>
              {/* Y baseline */}
              <div style={{ position: 'absolute', bottom: 28, left: 0, right: 0, height: '0.5px', background: `rgba(28,25,23,0.15)` }} />
              {cashflowData.map(({ month: mo, invoiced, received }) => {
                const moLabel = new Date(`${mo}-01`).toLocaleDateString('fr-FR', { month: 'short' })
                const isCurrentMonth = mo === new Date().toISOString().slice(0, 7)
                return (
                  <div key={mo} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, position: 'relative' }}>
                    <div style={{ width: '100%', display: 'flex', gap: 2, alignItems: 'flex-end', height: 92 }}>
                      {/* Invoiced bar */}
                      <div title={`Facturé: ${invoiced.toLocaleString('fr-FR')} €`}
                        style={{ flex: 1, background: `rgba(28,25,23,0.15)`, height: `${(invoiced / maxVal) * 92}px`, minHeight: invoiced > 0 ? 2 : 0 }} />
                      {/* Received bar */}
                      <div title={`Encaissé: ${received.toLocaleString('fr-FR')} €`}
                        style={{ flex: 1, background: '#186040', height: `${(received / maxVal) * 92}px`, minHeight: received > 0 ? 2 : 0 }} />
                    </div>
                    <span style={{ fontFamily: sans, fontSize: 9, color: isCurrentMonth ? C.ink : C.muted, textTransform: 'capitalize', fontWeight: isCurrentMonth ? 700 : 400, position: 'absolute', bottom: 4 }}>{moLabel}</span>
                  </div>
                )
              })}
            </div>
            <div style={{ display: 'flex', gap: 16, marginTop: 4 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}><div style={{ width: 10, height: 10, background: `rgba(28,25,23,0.15)` }} /><span style={{ fontFamily: sans, fontSize: 11, color: C.muted }}>Facturé</span></div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}><div style={{ width: 10, height: 10, background: '#186040' }} /><span style={{ fontFamily: sans, fontSize: 11, color: C.muted }}>Encaissé</span></div>
            </div>
          </div>
        )}

        {/* Filters + table */}
        <div style={{ display: 'flex', gap: 12, marginBottom: 20, alignItems: 'center', flexWrap: 'wrap' }}>
          {/* Status */}
          <div style={{ display: 'flex', gap: 0 }}>
            {['all', 'brouillon', 'envoyee', 'payee'].map((s, i) => (
              <button key={s} onClick={() => setFilterStatus(s)}
                style={{ fontFamily: sans, fontSize: 11, padding: '6px 12px', border: `0.5px solid ${C.ink}`, borderLeft: i === 0 ? undefined : 'none', background: filterStatus === s ? C.ink : 'transparent', color: filterStatus === s ? C.paper : C.muted, cursor: 'pointer', borderRadius: 0 }}>
                {s === 'all' ? 'Toutes' : STATUS_LABELS[s]}
              </button>
            ))}
          </div>

          {clients.length > 1 && (
            <>
              <div style={{ width: 1, height: 24, background: `rgba(28,25,23,0.15)` }} />
              <div style={{ display: 'flex', gap: 0 }}>
                <button onClick={() => setFilterClient('all')}
                  style={{ fontFamily: sans, fontSize: 11, padding: '6px 12px', border: `0.5px solid ${C.ink}`, background: filterClient === 'all' ? C.ink : 'transparent', color: filterClient === 'all' ? C.paper : C.muted, cursor: 'pointer', borderRadius: 0 }}>
                  Tous clients
                </button>
                {clients.map((c, i) => (
                  <button key={c.id} onClick={() => setFilterClient(c.id)}
                    style={{ fontFamily: sans, fontSize: 11, padding: '6px 12px', border: `0.5px solid ${C.ink}`, borderLeft: 'none', background: filterClient === c.id ? C.ink : 'transparent', color: filterClient === c.id ? C.paper : C.muted, cursor: 'pointer', borderRadius: 0 }}>
                    {c.name}
                  </button>
                ))}
              </div>
            </>
          )}

          <span style={{ fontFamily: sans, fontSize: 11, color: C.muted, marginLeft: 'auto' }}>
            {visible.length} facture{visible.length > 1 ? 's' : ''} · {visible.reduce((s, i) => s + Number(i.total), 0).toLocaleString('fr-FR')} € HT
          </span>
        </div>

        {/* Invoices table */}
        {loading ? (
          <div style={{ textAlign: 'center', padding: 60 }}><span style={{ fontFamily: sans, fontSize: 13, color: C.muted }}>Chargement…</span></div>
        ) : visible.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 60 }}>
            <p style={{ fontFamily: sans, fontSize: 14, color: C.muted }}>Aucune facture.</p>
            <a href="/tools/clients" style={{ fontFamily: sans, fontSize: 12, color: C.ink }}>Aller dans un dossier client pour créer une facture →</a>
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: `0.5px solid ${C.ink}` }}>
                {['Mois', 'Client', 'Montant HT', 'Statut', 'Envoyée le', 'Payée le', 'Actions'].map(h => (
                  <th key={h} style={{ fontFamily: sans, fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.18em', color: C.muted, padding: '8px 12px', textAlign: 'left', fontWeight: 400 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {visible.map((inv, i) => {
                const moLabel = new Date(`${inv.month}-01`).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })
                return (
                  <tr key={inv.id} style={{ borderBottom: `0.5px solid rgba(28,25,23,0.08)`, background: i % 2 === 0 ? C.paper : C.warm }}>
                    <td style={{ fontFamily: sans, fontSize: 13, color: C.ink, padding: '12px 12px', textTransform: 'capitalize' }}>{moLabel}</td>
                    <td style={{ padding: '12px 12px' }}>
                      <a href={`/tools/clients/${inv.client_id}/faturamento`} style={{ fontFamily: sans, fontSize: 13, color: C.ink, textDecoration: 'none', fontWeight: 600 }}>
                        {inv.sq_clients?.name ?? '—'}
                      </a>
                    </td>
                    <td style={{ fontFamily: sans, fontSize: 13, fontWeight: 700, color: C.ink, padding: '12px 12px' }}>
                      {Number(inv.total).toLocaleString('fr-FR')} €
                    </td>
                    <td style={{ padding: '12px 12px' }}>
                      <span style={{ fontFamily: sans, fontSize: 11, fontWeight: 600, color: STATUS_COLORS[inv.status] ?? C.muted, textTransform: 'uppercase', letterSpacing: '0.1em' }}>
                        {STATUS_LABELS[inv.status] ?? inv.status}
                      </span>
                    </td>
                    <td style={{ fontFamily: sans, fontSize: 12, color: C.muted, padding: '12px 12px' }}>
                      {inv.sent_at ? new Date(inv.sent_at).toLocaleDateString('fr-FR') : '—'}
                    </td>
                    <td style={{ fontFamily: sans, fontSize: 12, color: inv.paid_at ? '#186040' : C.muted, padding: '12px 12px', fontWeight: inv.paid_at ? 600 : 400 }}>
                      {inv.paid_at ? new Date(inv.paid_at).toLocaleDateString('fr-FR') + ' ✓' : '—'}
                    </td>
                    <td style={{ padding: '12px 12px' }}>
                      <div style={{ display: 'flex', gap: 4 }}>
                        {inv.status === 'brouillon' && (
                          <button onClick={() => markStatus(inv, 'envoyee')}
                            style={{ fontFamily: sans, fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.1em', padding: '4px 8px', border: `0.5px solid #7c5a00`, background: 'transparent', color: '#7c5a00', cursor: 'pointer', borderRadius: 0 }}>
                            Envoyée
                          </button>
                        )}
                        {inv.status === 'envoyee' && (
                          <button onClick={() => markStatus(inv, 'payee')}
                            style={{ fontFamily: sans, fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.1em', padding: '4px 8px', border: `0.5px solid #186040`, background: 'transparent', color: '#186040', cursor: 'pointer', borderRadius: 0 }}>
                            Payée ✓
                          </button>
                        )}
                        <a href={`/tools/clients/${inv.client_id}/faturamento`}
                          style={{ fontFamily: sans, fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.1em', padding: '4px 8px', border: `0.5px solid ${C.muted}`, color: C.muted, textDecoration: 'none', display: 'inline-block' }}>
                          Ouvrir
                        </a>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
            {visible.length > 0 && (
              <tfoot>
                <tr style={{ borderTop: `0.5px solid ${C.ink}` }}>
                  <td colSpan={2} style={{ fontFamily: sans, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.14em', color: C.muted, padding: '12px 12px' }}>Total sélection</td>
                  <td style={{ fontFamily: sans, fontSize: 14, fontWeight: 700, color: C.ink, padding: '12px 12px' }}>
                    {visible.reduce((s, i) => s + Number(i.total), 0).toLocaleString('fr-FR')} €
                  </td>
                  <td colSpan={4} />
                </tr>
              </tfoot>
            )}
          </table>
        )}

      </main>
      <SQFooter />
    </div>
  )
}
