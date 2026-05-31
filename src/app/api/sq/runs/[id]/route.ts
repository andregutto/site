import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseSQ } from '@/lib/supabase-sq'

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const sb = getSupabaseSQ()
  if (!sb) return NextResponse.json({ error: 'no db' }, { status: 503 })

  const [{ data: run }, { data: runPlaces }] = await Promise.all([
    sb.from('sq_runs').select('*').eq('id', id).maybeSingle(),
    sb.from('sq_run_places').select('place_id').eq('run_id', id),
  ])

  const placeIds = (runPlaces ?? []).map((r: any) => r.place_id)
  let places: any[] = []
  if (placeIds.length > 0) {
    const { data } = await sb
      .from('sq_places')
      .select('*')
      .in('place_id', placeIds)
      .order('score', { ascending: false, nullsFirst: false })
    places = data ?? []
  }

  return NextResponse.json({ run, places })
}
