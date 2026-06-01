'use client'

import { C, sans } from '@/lib/sq-design'

export function SQFooter() {
  return (
    <footer style={{
      borderTop: `0.5px solid ${C.ink}`,
      marginTop: 'auto',
    }}>
      <div style={{
        maxWidth: 1300, margin: '0 auto', padding: '20px 48px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        fontFamily: sans,
      }}>
        <span style={{ fontSize: 11, color: C.muted, letterSpacing: '0.04em' }}>
          © 2026 Studio Quartier · Paris
        </span>
        <a href="/sq" style={{
          fontSize: 11, color: C.muted, textDecoration: 'none',
          letterSpacing: '0.04em',
        }}
          onMouseEnter={e => (e.currentTarget.style.color = C.ink)}
          onMouseLeave={e => (e.currentTarget.style.color = C.muted)}
        >
          Site public →
        </a>
      </div>
    </footer>
  )
}
