import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseSQ } from '@/lib/supabase-sq'

type Ctx = { params: Promise<{ token: string }> }

export async function GET(_req: NextRequest, { params }: Ctx) {
  const { token } = await params
  const sb = getSupabaseSQ()
  if (!sb) return NextResponse.json({ error: 'no db' }, { status: 503 })

  const { data: briefing, error } = await sb
    .from('sq_briefings')
    .select('*')
    .eq('token', token)
    .maybeSingle()

  if (error || !briefing) return NextResponse.json({ error: 'not found' }, { status: 404 })

  // Fetch client name separately to avoid join issues
  const { data: clientRaw } = await sb
    .from('sq_clients')
    .select('name, category, neighborhood')
    .eq('id', (briefing as any).client_id)
    .maybeSingle()

  return NextResponse.json({ briefing: { ...(briefing as any), sq_clients: clientRaw } })
}

export async function PATCH(req: NextRequest, { params }: Ctx) {
  const { token } = await params
  const body = await req.json()
  const sb = getSupabaseSQ()
  if (!sb) return NextResponse.json({ error: 'no db' }, { status: 503 })
  const { data, error } = await (sb as any)
    .from('sq_briefings')
    .update({ ...body, filled_at: new Date().toISOString() })
    .eq('token', token)
    .select()
    .maybeSingle()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ briefing: data })
}
