import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseSQ } from '@/lib/supabase-sq'

export async function GET(req: NextRequest) {
  const client_id = req.nextUrl.searchParams.get('client_id')
  const sb = getSupabaseSQ()
  if (!sb || !client_id) return NextResponse.json({ briefing: null })
  const { data } = await sb.from('sq_briefings').select('*').eq('client_id', client_id).order('created_at', { ascending: false }).limit(1).maybeSingle()
  return NextResponse.json({ briefing: data })
}

export async function POST(req: NextRequest) {
  const { client_id } = await req.json()
  const sb = getSupabaseSQ()
  if (!sb || !client_id) return NextResponse.json({ error: 'missing client_id' }, { status: 400 })
  const token = crypto.randomUUID()
  const { data, error } = await sb.from('sq_briefings').insert({ client_id, token } as any).select().maybeSingle()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ briefing: data })
}
