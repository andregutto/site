import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseSQ } from '@/lib/supabase-sq'

export async function GET(req: NextRequest) {
  const status = req.nextUrl.searchParams.get('status')
  const sb = getSupabaseSQ()
  if (!sb) return NextResponse.json({ clients: [] })
  try {
    let q = sb.from('sq_clients').select('*').order('updated_at', { ascending: false })
    if (status && status !== 'tous') q = q.eq('status', status)
    const { data, error } = await q
    if (error) throw error
    return NextResponse.json({ clients: data ?? [] })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  const { clients } = await req.json() as { clients: any[] }
  const sb = getSupabaseSQ()
  if (!sb) return NextResponse.json({ error: 'no db' }, { status: 503 })
  try {
    const rows = clients.map(c => ({
      place_id:          c.place_id ?? null,
      name:              c.name,
      address:           c.address ?? null,
      neighborhood:      c.neighborhood ?? null,
      category:          c.category ?? null,
      phone_business:    c.phone ?? null,
      website:           c.website ?? null,
      instagram_url:     c.instagram_url ?? null,
      maps_url:          c.maps_url ?? null,
      google_rating:     c.rating ?? null,
      google_reviews:    c.review_count ?? null,
      score_initial:     c.score ?? null,
      services_suggested: c.services ?? null,
      ai_summary:        c.summary ?? null,
      status:            'prospect',
    }))
    const { data, error } = await sb
      .from('sq_clients')
      .upsert(rows as any, { onConflict: 'place_id', ignoreDuplicates: false })
      .select('id, name')
    if (error) throw error
    return NextResponse.json({ created: data })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
