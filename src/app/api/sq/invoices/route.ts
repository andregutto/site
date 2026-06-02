import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseSQ } from '@/lib/supabase-sq'

export async function GET(req: NextRequest) {
  const client_id = req.nextUrl.searchParams.get('client_id')
  const sb = getSupabaseSQ()
  if (!sb) return NextResponse.json({ invoices: [] })
  let query = (sb as any)
    .from('sq_invoices')
    .select('*, sq_clients(id, name)')
    .order('created_at', { ascending: false })
  if (client_id) query = query.eq('client_id', client_id)
  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ invoices: data ?? [] })
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  const sb = getSupabaseSQ()
  if (!sb) return NextResponse.json({ error: 'no db' }, { status: 503 })
  const { data, error } = await (sb as any)
    .from('sq_invoices')
    .insert(body)
    .select()
    .maybeSingle()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ invoice: data })
}
