import { useEffect, useState } from 'react'

export interface CurrentLocation {
  lat: number
  lng: number
  accuracy: number
}

// Watches the browser's geolocation so map pages can show a "you are here"
// marker. Silently returns null on denial/unsupported browsers — location
// is a nice-to-have overlay, never required to use the map.
export function useCurrentLocation(enabled = true): CurrentLocation | null {
  const [location, setLocation] = useState<CurrentLocation | null>(null)

  useEffect(() => {
    if (!enabled || !navigator.geolocation) return
    const watchId = navigator.geolocation.watchPosition(
      pos => setLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy }),
      () => setLocation(null),
      { enableHighAccuracy: true, maximumAge: 15000, timeout: 10000 }
    )
    return () => navigator.geolocation.clearWatch(watchId)
  }, [enabled])

  return location
}
