import { useState, type CSSProperties } from 'react'
import type { GateTier } from '../../contexts/UpgradeContext'
import { TIER_IDENTITY } from './tierMeta'

// Faixa/coluna de foto autoral por tier, reutilizada pelo modal (lateral), pela
// /planos (hero) e pelo GatedEmptyState (faixa). A FOTO fica LIMPA: sem círculos
// dourados, grain ou glows por cima (o dono pediu remover toda ornamentação que
// sufocava as fotos). O único tratamento é um gradiente escuro sutil de um lado
// só, pra legibilidade do texto sobreposto. Se a imagem 404, o fundo sólido
// escuro segue elegante — nada quebra sem a imagem.

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
  // Foto mais presente agora que não há ornamento por cima; ainda com o
  // gradiente de legibilidade num lado só.
  const opacity = photoOpacity ?? (src && src !== '/upgrade-art.png' ? 0.9 : 0.4)
  return (
    <div
      className={className}
      style={{
        position: 'relative',
        overflow: 'hidden',
        background: '#14110d',
        ...style,
      }}
    >
      {/* Foto do tier, LIMPA — sem sepia/vinheta pesada, sem ornamento. */}
      {imgOk && src && (
        <img
          src={src}
          alt=""
          onError={() => setImgOk(false)}
          style={{
            position: 'absolute', inset: 0, width: '100%', height: '100%',
            objectFit: 'cover', objectPosition: (tier ? TIER_IDENTITY[tier].photoPosition : undefined) ?? 'center', opacity,
          }}
        />
      )}

      {/* Único tratamento: gradiente escuro sutil de baixo (ou esquerda) pra o
          texto sobreposto ter contraste. Nada de glow/círculo/grain. */}
      <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, rgba(13,13,13,0) 30%, rgba(13,13,13,0.55) 100%)' }} />

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
