import { NextRequest, NextResponse } from 'next/server'

const GKEY = process.env.GOOGLE_PLACES_API_KEY!

export async function GET(req: NextRequest) {
  const sp     = req.nextUrl.searchParams
  const lat    = sp.get('lat')
  const lng    = sp.get('lng')
  const radius = sp.get('radius') || '600'
  const type   = sp.get('type')
  const kw     = sp.get('keyword') || ''

  if (!lat || !lng || !type) {
    return NextResponse.json({ error: 'lat, lng, type required' }, { status: 400 })
  }

  // 1 — Nearby Search
  const nearbyUrl = new URL('https://maps.googleapis.com/maps/api/place/nearbysearch/json')
  nearbyUrl.searchParams.set('location', `${lat},${lng}`)
  nearbyUrl.searchParams.set('radius', radius)
  nearbyUrl.searchParams.set('type', type)
  if (kw) nearbyUrl.searchParams.set('keyword', kw)
  nearbyUrl.searchParams.set('language', 'fr')
  nearbyUrl.searchParams.set('key', GKEY)

  const nearby = await fetch(nearbyUrl.toString()).then(r => r.json())
  if (nearby.status !== 'OK' && nearby.status !== 'ZERO_RESULTS') {
    return NextResponse.json({ error: nearby.status, message: nearby.error_message }, { status: 502 })
  }

  const raw: any[] = nearby.results || []

  // 2 — Place Details (parallel, first 25 results)
  const batch = raw.slice(0, 25)
  const results = await Promise.all(batch.map(async (p: any) => {
    try {
      const detUrl = new URL('https://maps.googleapis.com/maps/api/place/details/json')
      detUrl.searchParams.set('place_id', p.place_id)
      detUrl.searchParams.set('fields', 'place_id,name,formatted_address,geometry,rating,user_ratings_total,website,formatted_phone_number,opening_hours,types,url')
      detUrl.searchParams.set('language', 'fr')
      detUrl.searchParams.set('key', GKEY)
      const det = await fetch(detUrl.toString()).then(r => r.json())
      const d = det.result || {}
      return {
        place_id:     p.place_id,
        name:         d.name     || p.name        || '',
        address:      d.formatted_address         || p.vicinity || '',
        lat:          d.geometry?.location?.lat   ?? p.geometry?.location?.lat ?? 0,
        lng:          d.geometry?.location?.lng   ?? p.geometry?.location?.lng ?? 0,
        rating:       d.rating                    ?? null,
        review_count: d.user_ratings_total        ?? 0,
        has_website:  !!d.website,
        website:      d.website                   || null,
        phone:        d.formatted_phone_number    || null,
        is_open:      d.opening_hours?.open_now   ?? null,
        maps_url:     d.url || `https://www.google.com/maps/place/?q=place_id:${p.place_id}`,
        google_types: d.types || p.types          || [],
      }
    } catch {
      return {
        place_id:     p.place_id,
        name:         p.name || '',
        address:      p.vicinity || '',
        lat:          p.geometry?.location?.lat ?? 0,
        lng:          p.geometry?.location?.lng ?? 0,
        rating:       p.rating ?? null,
        review_count: p.user_ratings_total ?? 0,
        has_website:  false,
        website:      null,
        phone:        null,
        is_open:      p.opening_hours?.open_now ?? null,
        maps_url:     `https://www.google.com/maps/place/?q=place_id:${p.place_id}`,
        google_types: p.types || [],
      }
    }
  }))

  return NextResponse.json({ results })
}
