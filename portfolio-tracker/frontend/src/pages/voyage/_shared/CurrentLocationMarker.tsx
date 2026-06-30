import { Marker, Popup } from 'react-leaflet'
import L from 'leaflet'
import { useCurrentLocation } from './useCurrentLocation'

const BLUE = '#3B82F6'

let cachedIcon: L.DivIcon | null = null
function dotIcon() {
  if (cachedIcon) return cachedIcon
  cachedIcon = L.divIcon({
    html: `<div style="position:relative;width:18px;height:18px"><div style="position:absolute;inset:0;border-radius:999px;background:${BLUE};opacity:0.25;animation:arvo-pulse 2s ease-out infinite"></div><div style="position:absolute;inset:4px;border-radius:999px;background:${BLUE};border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,0.4)"></div></div><style>@keyframes arvo-pulse{0%{transform:scale(0.6);opacity:0.35}100%{transform:scale(2.4);opacity:0}}</style>`,
    className: '',
    iconSize: [18, 18],
    iconAnchor: [9, 9],
  })
  return cachedIcon
}

// Renders a "you are here" pulsing dot using the browser's geolocation.
// Must be used inside a react-leaflet <MapContainer>.
export default function CurrentLocationMarker({ label }: { label?: string }) {
  const location = useCurrentLocation()
  if (!location) return null
  return (
    <Marker position={[location.lat, location.lng]} icon={dotIcon()} zIndexOffset={1000}>
      <Popup>{label ?? 'Você está aqui'}</Popup>
    </Marker>
  )
}
