import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseSQ } from '@/lib/supabase-sq'

export async function GET() {
  const sb = getSupabaseSQ()
  if (!sb) return NextResponse.json({ runs: [] })
  try {
    const { data } = await sb
      .from('sq_runs')
      .select('*')
      .order('created_at', { ascending: false })
    return NextResponse.json({ runs: data ?? [] })
  } catch {
    return NextResponse.json({ runs: [] })
  }
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  const sb = getSupabaseSQ()
  if (!sb) return NextResponse.json({ error: 'no db' }, { status: 503 })
  try {
    await sb.from('sq_runs').upsert(body as any, { onConflict: 'id' })
    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
