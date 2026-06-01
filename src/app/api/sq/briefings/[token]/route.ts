import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseSQ } from '@/lib/supabase-sq'

type Ctx = { params: Promise<{ token: string }> }

export async function GET(_req: NextRequest, { params }: Ctx) {
  const { token } = await params
  const sb = getSupabaseSQ()
  if (!sb) return NextResponse.json({ error: 'no db' }, { status: 503 })
  const { data: briefing } = await sb.from('sq_briefings').select('*, sq_clients(name, category, neighborhood)').eq('token', token).maybeSingle()
  if (!briefing) return NextResponse.json({ error: 'not found' }, { status: 404 })
  return NextResponse.json({ briefing })
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
