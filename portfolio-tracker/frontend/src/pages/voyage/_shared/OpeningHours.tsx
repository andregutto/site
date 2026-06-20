import { useState } from 'react'

// Google's weekdayDescriptions[] is Monday-first (index 0 = Monday … 6 = Sunday);
// JS Date#getDay() is Sunday-first (0 = Sunday … 6 = Saturday) — convert between them.
function todayIndex(): number {
  const jsDay = new Date().getDay()
  return jsDay === 0 ? 6 : jsDay - 1
}

export default function OpeningHoursBlock({ hours }: { hours: string[] | null | undefined }) {
  const [expanded, setExpanded] = useState(false)
  if (!hours || hours.length === 0) return null
  const idx = todayIndex()
  const today = hours[idx] ?? null

  return (
    <div style={{ marginBottom: 4 }}>
      <button
        type="button"
        onClick={() => setExpanded(v => !v)}
        style={{ display: 'flex', alignItems: 'center', gap: 4, background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontSize: 11, color: '#444', fontFamily: 'inherit' }}
      >
        🕐 {today ?? 'Horário de funcionamento'}
        <span style={{ fontSize: 9 }}>{expanded ? '▴' : '▾'}</span>
      </button>
      {expanded && (
        <ul style={{ margin: '4px 0 0', paddingLeft: 16, fontSize: 10.5, color: '#666', lineHeight: 1.5 }}>
          {hours.map((h, i) => (
            <li key={i} style={{ fontWeight: i === idx ? 600 : 400, color: i === idx ? '#333' : '#666' }}>{h}</li>
          ))}
        </ul>
      )}
    </div>
  )
}
