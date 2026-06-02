import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseSQ } from '@/lib/supabase-sq'

type Ctx = { params: Promise<{ id: string }> }

export async function GET(req: NextRequest, { params }: Ctx) {
  const { id } = await params
  const after  = req.nextUrl.searchParams.get('after')
  const before = req.nextUrl.searchParams.get('before')
  const sb = getSupabaseSQ()
  if (!sb) return NextResponse.json({ events: [] })
  let query = (sb as any).from('sq_client_events').select('*').eq('client_id', id).order('created_at', { ascending: false })
  if (after)  query = query.gte('created_at', after)
  if (before) query = query.lte('created_at', before)
  const { data } = await query
  return NextResponse.json({ events: data ?? [] })
}

export async function POST(req: NextRequest, { params }: Ctx) {
  const { id } = await params
  const body = await req.json()
  const sb = getSupabaseSQ()
  if (!sb) return NextResponse.json({ error: 'no db' }, { status: 503 })
  const { data, error } = await sb
    .from('sq_client_events')
    .insert({ client_id: id, ...body } as any as never)
    .select()
    .maybeSingle()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // If it's a status change, also update the client row
  if (body.type === 'statut_change' && body.meta?.to) {
    await sb.from('sq_clients').update({ status: body.meta.to } as never).eq('id', id)
  }

  return NextResponse.json({ event: data })
}
