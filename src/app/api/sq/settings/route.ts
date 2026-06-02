import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseSQ } from '@/lib/supabase-sq'

export async function GET() {
  const sb = getSupabaseSQ()
  if (!sb) return NextResponse.json({ settings: {} })
  const { data } = await (sb as any).from('sq_settings').select('key, value')
  const settings: Record<string, string> = {}
  for (const row of (data ?? [])) settings[row.key] = row.value
  return NextResponse.json({ settings })
}

export async function PATCH(req: NextRequest) {
  const body = await req.json() // { key: string, value: string }[]
  const sb = getSupabaseSQ()
  if (!sb) return NextResponse.json({ error: 'no db' }, { status: 503 })
  for (const { key, value } of body) {
    await (sb as any).from('sq_settings').upsert({ key, value }, { onConflict: 'key' })
  }
  return NextResponse.json({ ok: true })
}
