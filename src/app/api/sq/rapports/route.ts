import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseSQ } from '@/lib/supabase-sq'

export async function GET(req: NextRequest) {
  const client_id = req.nextUrl.searchParams.get('client_id')
  const sb = getSupabaseSQ()
  if (!sb || !client_id) return NextResponse.json({ rapports: [] })
  const { data, error } = await (sb as any)
    .from('sq_rapports')
    .select('*')
    .eq('client_id', client_id)
    .order('created_at', { ascending: false })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ rapports: data ?? [] })
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  const sb = getSupabaseSQ()
  if (!sb) return NextResponse.json({ error: 'no db' }, { status: 503 })
  const { data, error } = await (sb as any)
    .from('sq_rapports')
    .insert(body)
    .select()
    .maybeSingle()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ rapport: data })
}
