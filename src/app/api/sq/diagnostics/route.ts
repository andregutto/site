import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseSQ } from '@/lib/supabase-sq'

export async function GET(req: NextRequest) {
  const client_id = req.nextUrl.searchParams.get('client_id')
  const sb = getSupabaseSQ()
  if (!sb || !client_id) return NextResponse.json({ diagnostics: [] })
  const { data } = await sb
    .from('sq_diagnostics')
    .select('*')
    .eq('client_id', client_id)
    .order('created_at', { ascending: false })
  return NextResponse.json({ diagnostics: data ?? [] })
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  const sb = getSupabaseSQ()
  if (!sb) return NextResponse.json({ error: 'no db' }, { status: 503 })
  const { data, error } = await sb.from('sq_diagnostics').insert(body as any).select().maybeSingle()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ diagnostic: data })
}
