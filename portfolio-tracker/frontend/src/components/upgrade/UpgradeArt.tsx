import { useState, type CSSProperties } from 'react'

// Composição visual sempre-dark reutilizada pelo modal (coluna lateral), pelo
// painel bloqueado do GateGuard e pela /planos. Não é mais um banner separado
// com faixa de imagem sem sentido: é uma superfície #0D0D0D com a linguagem da
// landing — grain, círculos dourados finos, glow, wordmark Tenor. Se existir
// /upgrade-art.png ela entra escurecida por cima do gradiente; senão, o fallback
// 100% CSS já é elegante por si só. Nada quebra sem a imagem.

const GRAIN =
  "url(\"data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")"

export default function UpgradeArt({
  style,
  className,
  showWordmark = true,
  eyebrow,
}: {
  style?: CSSProperties
  className?: string
  showWordmark?: boolean
  eyebrow?: string
}) {
  const [imgOk, setImgOk] = useState(true)
  return (
    <div
      className={className}
      style={{
        position: 'relative',
        overflow: 'hidden',
        background:
          'radial-gradient(120% 90% at 78% 12%, #241f18 0%, #14110d 42%, #0D0D0D 100%)',
        ...style,
      }}
    >
      {/* Imagem opcional, escurecida — nunca domina a composição. */}
      {imgOk && (
        <img
          src="/upgrade-art.png"
          alt=""
          onError={() => setImgOk(false)}
          style={{
            position: 'absolute', inset: 0, width: '100%', height: '100%',
            objectFit: 'cover', opacity: 0.28,
            filter: 'grayscale(0.2) brightness(0.7) sepia(0.25) saturate(1.1)',
            mixBlendMode: 'luminosity',
          }}
        />
      )}

      {/* Glow dourado difuso no alto. */}
      <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(60% 45% at 76% 14%, rgba(200,184,154,0.32), transparent 70%)' }} />

      {/* Círculos concêntricos finos — a assinatura da landing. */}
      <div style={{ position: 'absolute', right: -70, top: -70, width: 260, height: 260, borderRadius: '50%', border: '1px solid rgba(200,184,154,0.22)' }} />
      <div style={{ position: 'absolute', right: -30, top: -30, width: 180, height: 180, borderRadius: '50%', border: '1px solid rgba(200,184,154,0.16)' }} />
      <div style={{ position: 'absolute', right: 24, bottom: -60, width: 150, height: 150, borderRadius: '50%', border: '1px solid rgba(200,184,154,0.12)' }} />

      {/* Grain. */}
      <div style={{ position: 'absolute', inset: 0, backgroundImage: GRAIN, backgroundSize: '220px', opacity: 0.05, mixBlendMode: 'overlay', pointerEvents: 'none' }} />

      {eyebrow && (
        <div style={{ position: 'absolute', left: 22, top: 20, fontFamily: "var(--arvo-font-body)", fontSize: 10.5, letterSpacing: '0.22em', textTransform: 'uppercase', color: 'var(--arvo-gold)' }}>
          {eyebrow}
        </div>
      )}

      {showWordmark && (
        <div style={{ position: 'absolute', left: 22, bottom: 18, fontFamily: 'var(--arvo-font-display)', fontSize: 17, letterSpacing: '0.34em', textIndent: '0.34em', color: 'rgba(242,237,228,0.9)' }}>
          arvo
        </div>
      )}
    </div>
  )
}
