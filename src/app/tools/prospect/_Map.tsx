'use client'

import { MapContainer, TileLayer, CircleMarker, Popup } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'

const C = { paper: '#FDFAF5', ink: '#1C1917', warm: '#F4F0E6', muted: '#6B6760' }
const sans = 'Arial, "Helvetica Neue", Helvetica, sans-serif'

export interface MapMarker {
  place_id:   string
  name:       string
  lat:        number
  lng:        number
  score:      number
  services:   string[]
  summary:    string
  maps_url:   string
  website:    string | null
}

function scoreColor(score: number): string {
  if (score >= 75) return C.ink
  if (score >= 55) return '#4A3728'
  if (score >= 35) return '#9B7540'
  return '#B0A898'
}

export default function ProspectMap({ markers, center }: { markers: MapMarker[]; center: [number, number] }) {
  return (
    <MapContainer center={center} zoom={15} style={{ height: 500, width: '100%' }} scrollWheelZoom>
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      {markers.map(m => (
        <CircleMarker
          key={m.place_id}
          center={[m.lat, m.lng]}
          radius={m.score >= 75 ? 12 : m.score >= 55 ? 10 : 8}
          pathOptions={{
            fillColor: scoreColor(m.score),
            color: C.ink,
            weight: 0.5,
            fillOpacity: 0.88,
          }}
        >
          <Popup maxWidth={220}>
            <div style={{ fontFamily: sans, fontSize: 12, lineHeight: 1.4 }}>
              <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 4 }}>{m.name}</div>
              <div style={{ display: 'inline-block', background: scoreColor(m.score), color: m.score >= 35 ? '#fff' : C.ink, padding: '2px 8px', fontSize: 11, fontVariantNumeric: 'tabular-nums', marginBottom: 6 }}>
                {m.score} / 100
              </div>
              {m.services.length > 0 && (
                <div style={{ fontSize: 11, color: C.muted, marginBottom: 4 }}>
                  {m.services.slice(0, 3).join(' · ')}
                </div>
              )}
              {m.summary && (
                <div style={{ fontSize: 11, color: '#444', marginBottom: 6 }}>{m.summary}</div>
              )}
              <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
                <a href={m.maps_url} target="_blank" rel="noopener noreferrer"
                  style={{ fontSize: 11, color: C.ink, textDecoration: 'underline' }}>Maps ↗</a>
                {m.website && (
                  <a href={m.website} target="_blank" rel="noopener noreferrer"
                    style={{ fontSize: 11, color: C.ink, textDecoration: 'underline' }}>Site ↗</a>
                )}
              </div>
            </div>
          </Popup>
        </CircleMarker>
      ))}
    </MapContainer>
  )
}
