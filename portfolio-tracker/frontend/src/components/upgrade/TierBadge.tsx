import { useId, type CSSProperties } from 'react'
import type { GateTier } from '../../contexts/UpgradeContext'
import { TIER_IDENTITY } from './tierMeta'

// Selo de tier reutilizável: o glifo arvo (mesmo desenho do badge admin do
// PostCard) preenchido com o degradê da identidade do tier, opcionalmente com
// um rótulo ("Plus"/"Pro"). Nasce na /planos e no modal de upgrade; feito pra
// futuramente aparecer também ao lado de usernames. A cor por tier vem de um
// único mapa (TIER_IDENTITY em tierMeta.ts) pra ser trivial trocar depois.
//
// Free não tem badge (é membro da comunidade, não um plano vendável) — passar
// tier='free' renderiza null.

// Paths do símbolo arvo (viewBox 174×180). Opacidades reproduzem o glifo
// original; o preenchimento é o gradiente do tier.
const ARVO_PATHS: { d: string; opacity?: number }[] = [
  { d: 'M96.9642 82.5762C83.7642 28.1762 141.798 5.2429 172.464 0.576233C173.464 15.7429 159.764 53.3762 96.9642 82.5762Z' },
  { d: 'M165.464 82.5762V53.5762L136.964 73.9631V111.674C144.263 106.015 151.778 100.102 155.964 96.5762C163.564 90.1762 165.464 84.5762 165.464 82.5762Z', opacity: 0.85 },
  { d: 'M121.464 85.0507V123.576C125.207 120.732 131.014 116.287 136.964 111.674V73.9631L121.464 85.0507Z', opacity: 0.7 },
  { d: 'M96.9642 102.576L121.464 123.576V85.0507L96.9642 102.576Z', opacity: 0.6 },
  { d: 'M121.464 155.576V123.576L96.9642 102.576V178.576L121.464 155.576Z', opacity: 0.8 },
  { d: 'M0.513985 24.5762V51.5762C0.513985 53.5762 -0.135759 66.6762 7.46424 73.0762L44.514 101.576V155.076L69.014 178.076V82.0762L37.9642 56.0762L0.513985 24.5762Z', opacity: 0.9 },
]

// Só o glifo, sem chip — útil como marca grande (ex. GatedEmptyState).
// `glow`: acende uma luz ambiente ATRÁS do glifo (halo radial), não um
// drop-shadow — o filtro contornava cada path individualmente e o brilho
// vazava pelas frestas internas, parecendo flutuar por cima do desenho.
// Só faz sentido sobre superfície escura.
// `glowRadius`: alcance do halo além do glifo, em px (grande ~8, tag ~3).
export function TierGlyph({
  tier, size = 16, glow = false, glowRadius = 8, style,
}: { tier: GateTier; size?: number; glow?: boolean; glowRadius?: number; style?: CSSProperties }) {
  const id = useId().replace(/:/g, '')
  if (tier === 'free') return null
  const identity = TIER_IDENTITY[tier]
  const height = size * (180 / 174)
  const hasGlow = glow && identity.glowColor
  // Margem extra no canvas pro halo respirar sem ser cortado pelo viewBox.
  const pad = hasGlow ? Math.ceil(glowRadius * 2.2) : 0
  const padUnits = (pad / size) * 174
  return (
    <svg
      width={size + pad * 2}
      height={height + pad * 2}
      viewBox={`${-padUnits} ${-padUnits} ${174 + padUnits * 2} ${180 + padUnits * 2}`}
      fill="none"
      style={{ margin: -pad, ...style }}
      aria-hidden
    >
      <defs>
        <linearGradient id={`arvo-tier-${id}`} x1="0" y1="0" x2="1" y2="1">
          {identity.gradient.map((stop, i) => (
            <stop key={i} offset={`${stop.offset * 100}%`} stopColor={stop.color} />
          ))}
        </linearGradient>
        {hasGlow && (
          <radialGradient id={`arvo-halo-${id}`} cx="0.5" cy="0.5" r="0.5">
            <stop offset="0%" stopColor={identity.glowColor!} stopOpacity="0.38" />
            <stop offset="55%" stopColor={identity.glowColor!} stopOpacity="0.14" />
            <stop offset="100%" stopColor={identity.glowColor!} stopOpacity="0" />
          </radialGradient>
        )}
      </defs>
      {hasGlow && (
        <circle cx="87" cy="90" r={110 + padUnits} fill={`url(#arvo-halo-${id})`} />
      )}
      {ARVO_PATHS.map((p, i) => (
        <path key={i} d={p.d} fill={`url(#arvo-tier-${id})`} opacity={p.opacity} />
      ))}
    </svg>
  )
}

export default function TierBadge({
  tier,
  label,
  size = 12,
  onDark = false,
  style,
}: {
  tier: GateTier
  /** Texto ao lado do glifo (ex. "Arvo Plus"). Sem ele, mostra só o glifo em chip. */
  label?: string
  /** Tamanho do glifo em px. */
  size?: number
  /** Ajusta o fundo/texto do chip pra superfície escura. */
  onDark?: boolean
  style?: CSSProperties
}) {
  if (tier === 'free') return null
  const identity = TIER_IDENTITY[tier]
  // Glow do glifo só sobre dark; em miniatura o raio é menor.
  const glow = onDark
  return (
    <span
      style={{
        display: 'inline-flex', alignItems: 'center', gap: label ? 7 : 0,
        padding: label ? '4px 11px 4px 8px' : 5,
        borderRadius: 999,
        background: onDark ? 'rgba(255,255,255,0.04)' : 'rgba(13,13,13,0.035)',
        border: `1px solid ${identity.chipBorder}`,
        lineHeight: 1,
        ...style,
      }}
    >
      <TierGlyph tier={tier} size={size} glow={glow} glowRadius={3} style={{ display: 'block', flexShrink: 0 }} />
      {label && (
        <span
          style={{
            fontFamily: 'var(--arvo-font-body)', fontSize: 10.5, fontWeight: 700,
            letterSpacing: '0.16em', textTransform: 'uppercase',
            color: identity.labelColor(onDark),
          }}
        >
          {label}
        </span>
      )}
    </span>
  )
}
