export interface RouteStop {
  lat: number
  lng: number
}

// Google's directions URL caps at 25 waypoints total (origin + destination +
// up to 23 in between). Routes longer than that are split into consecutive
// legs so every stop still ends up in some link.
const MAX_STOPS_PER_URL = 25

function coord(s: RouteStop) {
  return `${s.lat},${s.lng}`
}

// Builds one or more Google Maps "directions" URLs covering all stops in
// order. If `origin` is given (e.g. the user's current location) it's used
// as the starting point of the first leg only — later legs chain from the
// previous leg's last stop.
export function buildDirectionsUrls(stops: RouteStop[], origin?: RouteStop | null): string[] {
  if (stops.length === 0) return []
  const urls: string[] = []
  let i = 0
  let chainOrigin = origin ?? null
  while (i < stops.length) {
    const remainingCapacity = chainOrigin ? MAX_STOPS_PER_URL - 1 : MAX_STOPS_PER_URL
    const chunk = stops.slice(i, i + remainingCapacity)
    const points = chainOrigin ? [chainOrigin, ...chunk] : chunk
    const params = new URLSearchParams({
      api: '1',
      origin: coord(points[0]),
      destination: coord(points[points.length - 1]),
    })
    if (points.length > 2) {
      params.set('waypoints', points.slice(1, -1).map(coord).join('|'))
    }
    urls.push(`https://www.google.com/maps/dir/?${params.toString()}`)
    chainOrigin = chunk[chunk.length - 1]
    i += chunk.length
  }
  return urls
}

export function openDirections(stops: RouteStop[], origin?: RouteStop | null) {
  const urls = buildDirectionsUrls(stops, origin)
  urls.forEach(u => window.open(u, '_blank', 'noopener,noreferrer'))
}
