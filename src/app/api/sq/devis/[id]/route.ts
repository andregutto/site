import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseSQ } from '@/lib/supabase-sq'

type Ctx = { params: Promise<{ id: string }> }

export async function GET(_req: NextRequest, { params }: Ctx) {
  const { id } = await params
  const sb = getSupabaseSQ()
  if (!sb) return NextResponse.json({ error: 'no db' }, { status: 503 })
  const { data } = await sb.from('sq_devis').select('*, sq_clients(name, address, neighborhood, category, contact_name, contact_email)').eq('id', id).maybeSingle()
  return NextResponse.json({ devis: data })
}

export async function PATCH(req: NextRequest, { params }: Ctx) {
  const { id } = await params
  const body = await req.json()
  const sb = getSupabaseSQ()
  if (!sb) return NextResponse.json({ error: 'no db' }, { status: 503 })
  const { data, error } = await sb.from('sq_devis').update(body as never).eq('id', id).select('*, sq_clients(id)').maybeSingle()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // When devis is accepted: auto-populate client services_active + monthly_value
  if (body.status === 'accepted' && data) {
    const devis = data as any
    const clientId = devis.sq_clients?.id ?? devis.client_id
    const items: any[] = devis.items ?? []
    const services_active = items.map((i: any) => i.service).filter(Boolean)
    const monthly_value   = items.reduce((s: number, i: any) => s + (Number(i.price_monthly) || 0), 0)
    if (clientId && services_active.length > 0) {
      await (sb as any).from('sq_clients').update({ services_active, monthly_value }).eq('id', clientId)
    }
  }

  return NextResponse.json({ devis: data })
}

export async function DELETE(_req: NextRequest, { params }: Ctx) {
  const { id } = await params
  const sb = getSupabaseSQ()
  if (!sb) return NextResponse.json({ error: 'no db' }, { status: 503 })
  await sb.from('sq_devis').delete().eq('id', id)
  return NextResponse.json({ ok: true })
}
