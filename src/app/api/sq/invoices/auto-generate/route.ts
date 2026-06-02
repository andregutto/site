import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseSQ } from '@/lib/supabase-sq'

// Called by Vercel Cron on 1st of each month at 8am
// Also callable manually from the finances page
export async function POST(req: NextRequest) {
  // Simple secret check to avoid abuse
  const secret = req.headers.get('x-cron-secret')
  if (secret && secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const sb = getSupabaseSQ()
  if (!sb) return NextResponse.json({ error: 'no db' }, { status: 503 })

  const month = new Date().toISOString().slice(0, 7)
  const year  = new Date().getFullYear()

  // Fetch all accepted devis with auto_invoice = true
  const { data: devisList } = await (sb as any)
    .from('sq_devis')
    .select('*, sq_clients(id, name, contact_email)')
    .eq('status', 'accepted')
    .eq('auto_invoice', true)

  if (!devisList || devisList.length === 0) {
    return NextResponse.json({ created: 0, message: 'No recurring devis found' })
  }

  const created: string[] = []
  const skipped: string[] = []

  for (const devis of devisList) {
    // Check if invoice already exists for this month
    const { data: existing } = await (sb as any)
      .from('sq_invoices')
      .select('id')
      .eq('client_id', devis.client_id)
      .eq('month', month)
      .maybeSingle()

    if (existing) {
      skipped.push(devis.sq_clients?.name ?? devis.client_id)
      continue
    }

    // Compute sequential invoice number
    const { count } = await (sb as any)
      .from('sq_invoices')
      .select('*', { count: 'exact', head: true })
      .gte('created_at', `${year}-01-01T00:00:00Z`)

    const seq = String((count ?? 0) + 1).padStart(3, '0')
    const invoice_number = `SQ-${year}-${seq}`

    // Build invoice items from devis
    const items = (devis.items ?? []).map((i: any) => ({
      service:    i.service,
      qty:        1,
      unit_price: Number(i.price_monthly) || 0,
    }))
    const total = items.reduce((s: number, i: any) => s + i.unit_price, 0)

    await (sb as any).from('sq_invoices').insert({
      client_id: devis.client_id,
      month,
      items,
      total,
      status: 'brouillon',
      invoice_number,
      notes: devis.notes ?? null,
    })

    created.push(devis.sq_clients?.name ?? devis.client_id)
  }

  return NextResponse.json({
    month,
    created: created.length,
    skipped: skipped.length,
    clients_created: created,
    clients_skipped: skipped,
  })
}
