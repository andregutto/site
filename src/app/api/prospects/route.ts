import { NextRequest, NextResponse } from 'next/server'

export const runtime = 'nodejs'

interface PlaceResult {
  place_id: string
  name: string
  vicinity: string
  rating?: number
  user_ratings_total?: number
  website?: string
  opening_hours?: { open_now?: boolean }
  geometry: { location: { lat: number; lng: number } }
}

interface PlacesResponse {
  results: PlaceResult[]
  status: string
  error_message?: string
}

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl
  const lat     = searchParams.get('lat')
  const lng     = searchParams.get('lng')
  const radius  = searchParams.get('radius') || '500'
  const type    = searchParams.get('type')    || 'restaurant'
  const keyword = searchParams.get('keyword') || ''

  if (!lat || !lng) {
    return NextResponse.json({ error: 'lat e lng são obrigatórios' }, { status: 400 })
  }

  const apiKey = process.env.GOOGLE_PLACES_API_KEY
  if (!apiKey) {
    return NextResponse.json({ error: 'GOOGLE_PLACES_API_KEY não configurada' }, { status: 500 })
  }

  const url = new URL('https://maps.googleapis.com/maps/api/place/nearbysearch/json')
  url.searchParams.set('location', `${lat},${lng}`)
  url.searchParams.set('radius', radius)
  url.searchParams.set('type', type)
  url.searchParams.set('key', apiKey)
  if (keyword) url.searchParams.set('keyword', keyword)

  const res = await fetch(url.toString())
  if (!res.ok) {
    return NextResponse.json({ error: `Google Places error: ${res.status}` }, { status: 502 })
  }

  const data: PlacesResponse = await res.json()
  if (data.status !== 'OK' && data.status !== 'ZERO_RESULTS') {
    return NextResponse.json({ error: data.error_message || data.status }, { status: 502 })
  }

  // Fetch details for each place to get website
  const details = await Promise.all(
    data.results.map(async (place) => {
      const detailUrl = new URL('https://maps.googleapis.com/maps/api/place/details/json')
      detailUrl.searchParams.set('place_id', place.place_id)
      detailUrl.searchParams.set('fields', 'website')
      detailUrl.searchParams.set('key', apiKey)

      try {
        const dr = await fetch(detailUrl.toString())
        const dd = await dr.json() as { result?: { website?: string } }
        return dd.result?.website ?? null
      } catch {
        return null
      }
    })
  )

  const prospects = data.results.map((place, i) => ({
    place_id:       place.place_id,
    name:           place.name,
    address:        place.vicinity,
    rating:         place.rating ?? null,
    review_count:   place.user_ratings_total ?? 0,
    website:        details[i] ?? null,
    has_website:    !!details[i],
    is_open:        place.opening_hours?.open_now ?? null,
    maps_url:       `https://www.google.com/maps/place/?q=place_id:${place.place_id}`,
  }))

  // Prioridade: 1) sem site  2) < 50 avaliações  3) resto
  prospects.sort((a, b) => {
    const score = (p: typeof a) => {
      if (!p.has_website) return 0
      if (p.review_count < 50) return 1
      return 2
    }
    return score(a) - score(b)
  })

  return NextResponse.json({ results: prospects, total: prospects.length })
}
