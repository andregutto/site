import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseSQ } from '@/lib/supabase-sq'

export async function GET(req: NextRequest) {
  const sb = getSupabaseSQ()
  if (!sb) return NextResponse.json({ places: [], total: 0 })

  const sp = req.nextUrl.searchParams
  const min_score             = parseInt(sp.get('min_score') || '0', 10)
  const max_score             = parseInt(sp.get('max_score') || '100', 10)
  const has_website           = sp.get('has_website') || 'all'     // all | yes | no
  const has_instagram         = sp.get('has_instagram') || 'all'   // all | yes | no
  const website_quality       = sp.get('website_quality') || 'all'
  const review_response       = sp.get('review_response') || 'all'
  const google_type           = sp.get('google_type') || 'all'

  try {
    let q = sb
      .from('sq_places')
      .select('*')
      .eq('classification', 'PROSPECT')
      .gte('score', min_score)
      .lte('score', max_score)
      .order('score', { ascending: false, nullsFirst: false })

    if (has_website === 'yes') q = q.not('website', 'is', null)
    if (has_website === 'no')  q = q.is('website', null)

    if (has_instagram === 'yes') q = q.eq('has_instagram', true)
    if (has_instagram === 'no')  q = q.eq('has_instagram', false)

    if (website_quality !== 'all') q = q.eq('website_quality', website_quality)
    if (review_response !== 'all') q = q.eq('review_response_quality', review_response)

    if (google_type !== 'all') q = (q as any).contains('google_types', [google_type])

    const { data, error } = await q
    if (error) throw error

    return NextResponse.json({ places: data ?? [], total: (data ?? []).length })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
