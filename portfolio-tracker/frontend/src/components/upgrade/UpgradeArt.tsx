import { useState, type CSSProperties } from 'react'
import type { GateTier } from '../../contexts/UpgradeContext'
import { TIER_IDENTITY } from './tierMeta'

// Composição visual sempre-dark reutilizada pelo modal (coluna lateral), pelo
// painel bloqueado do GateGuard e pela /planos. Superfície #0D0D0D com a
// linguagem da landing — grain, círculos dourados finos, glow, wordmark Tenor —
// AGORA com foto autoral por tier (mapa TIER_IDENTITY em tierMeta) escurecida
// por cima do gradiente. Se a imagem 404, o fallback 100% CSS segue elegante:
// nada quebra sem a imagem.

const GRAIN =
  "url(\"data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")"

export default function UpgradeArt({
  style,
  className,
  showWordmark = true,
  eyebrow,
  tier,
  photo,
  photoOpacity,
}: {
  style?: CSSProperties
  className?: string
  showWordmark?: boolean
  eyebrow?: string
  /** Se dado, usa a foto autoral desse tier (de TIER_IDENTITY). */
  tier?: GateTier
  /** Sobrepõe a foto (ou desliga a foto passando ''). */
  photo?: string
  /** Opacidade da foto sobre o gradiente. */
  photoOpacity?: number
}) {
  // Foto explícita > foto do tier > legado /upgrade-art.png.
  const src = photo !== undefined ? photo : tier ? TIER_IDENTITY[tier].photo : '/upgrade-art.png'
  const [imgOk, setImgOk] = useState(true)
  const opacity = photoOpacity ?? (src && src !== '/upgrade-art.png' ? 0.46 : 0.28)
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
      {/* Foto do tier, escurecida — nunca domina a composição. */}
      {imgOk && src && (
        <img
          src={src}
          alt=""
          onError={() => setImgOk(false)}
          style={{
            position: 'absolute', inset: 0, width: '100%', height: '100%',
            objectFit: 'cover', opacity,
            filter: 'brightness(0.42) sepia(0.28) saturate(1.2)',
          }}
        />
      )}

      {/* Escurecimento por baixo do conteúdo pra legibilidade do texto. */}
      <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, rgba(13,13,13,0.28) 0%, rgba(13,13,13,0.68) 100%)' }} />

      {/* Glow dourado difuso no alto. */}
      <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(60% 45% at 76% 14%, rgba(200,184,154,0.28), transparent 70%)' }} />

      {/* Círculos concêntricos finos — a assinatura da landing. */}
      <div style={{ position: 'absolute', right: -70, top: -70, width: 260, height: 260, borderRadius: '50%', border: '1px solid rgba(200,184,154,0.2)' }} />
      <div style={{ position: 'absolute', right: -30, top: -30, width: 180, height: 180, borderRadius: '50%', border: '1px solid rgba(200,184,154,0.14)' }} />
      <div style={{ position: 'absolute', right: 24, bottom: -60, width: 150, height: 150, borderRadius: '50%', border: '1px solid rgba(200,184,154,0.1)' }} />

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
