import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseSQ } from '@/lib/supabase-sq'

export async function GET() {
  const sb = getSupabaseSQ()
  if (!sb) return NextResponse.json({ services: [] })
  const { data } = await sb.from('sq_services').select('*').order('sort_order').order('created_at')
  return NextResponse.json({ services: data ?? [] })
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  const sb = getSupabaseSQ()
  if (!sb) return NextResponse.json({ error: 'no db' }, { status: 503 })
  const { data, error } = await sb.from('sq_services').insert(body as any).select().maybeSingle()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ service: data })
}
