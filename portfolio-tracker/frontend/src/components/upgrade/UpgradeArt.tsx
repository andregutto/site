import { useState } from 'react'

// Banner de arte no topo do modal/página de planos. O André vai fornecer
// /upgrade-art.png depois; até lá (e se der 404), cai num gradiente autoral com
// as vars do design system — nada quebra. A imagem, quando existe, cobre o
// gradiente por cima.
export default function UpgradeArt({ height = 132 }: { height?: number }) {
  const [imgOk, setImgOk] = useState(true)
  return (
    <div
      style={{
        position: 'relative', height, borderRadius: 16, overflow: 'hidden',
        background: 'linear-gradient(135deg, var(--arvo-black) 0%, #2A2620 45%, var(--arvo-gold) 160%)',
        boxShadow: 'inset 0 0 60px -10px rgba(0,0,0,0.5)',
      }}
    >
      {/* Composição decorativa (glow dourado + arcos) — vive por trás da imagem. */}
      <div style={{ position: 'absolute', inset: 0, background: 'var(--arvo-shadow-glow-gold, radial-gradient(circle at 75% 30%, rgba(200,184,154,0.35), transparent 60%))', opacity: 0.9 }} />
      <div style={{ position: 'absolute', right: -30, top: -30, width: 160, height: 160, borderRadius: '50%', border: '1px solid rgba(200,184,154,0.25)' }} />
      <div style={{ position: 'absolute', right: 10, bottom: -50, width: 120, height: 120, borderRadius: '50%', border: '1px solid rgba(200,184,154,0.18)' }} />
      <div style={{ position: 'absolute', left: 20, bottom: 16, fontFamily: 'var(--arvo-font-display)', fontSize: 15, letterSpacing: '0.30em', textIndent: '0.30em', color: 'rgba(242,237,228,0.92)' }}>
        arvo
      </div>
      {imgOk && (
        <img
          src="/upgrade-art.png"
          alt=""
          onError={() => setImgOk(false)}
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }}
        />
      )}
    </div>
  )
}
