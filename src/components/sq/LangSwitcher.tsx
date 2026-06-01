'use client'

import { useTranslation, type Locale } from '@/lib/i18n'

const C = { ink: '#1C1917', paper: '#FDFAF5', muted: '#6B6760' }
const sans = 'Arial, "Helvetica Neue", Helvetica, sans-serif'

const LOCALES: { key: Locale; label: string }[] = [
  { key: 'fr', label: 'FR' },
  { key: 'pt', label: 'PT' },
]

export function LangSwitcher() {
  const { locale, setLocale } = useTranslation()
  return (
    <div style={{ display: 'flex', gap: 0 }}>
      {LOCALES.map((l, i) => (
        <button
          key={l.key}
          onClick={() => setLocale(l.key)}
          style={{
            fontFamily: sans,
            textTransform: 'uppercase',
            letterSpacing: '0.18em',
            fontSize: 9,
            padding: '4px 9px',
            border: `0.5px solid ${C.ink}`,
            borderLeft: i === 0 ? `0.5px solid ${C.ink}` : 'none',
            background: locale === l.key ? C.ink : 'transparent',
            color: locale === l.key ? C.paper : C.muted,
            cursor: 'pointer',
            borderRadius: 0,
          }}
        >
          {l.label}
        </button>
      ))}
    </div>
  )
}
