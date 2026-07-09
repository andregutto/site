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

// Só o glifo, sem chip — útil como marca grande (ex. GatedEmptyState) e ao
// lado do wordmark no header. O antigo halo/glow foi removido (borrava sobre
// dark); a visibilidade em superfície escura vem do próprio degradê do tier.
// `onDark`: escolhe a variante do degradê. Em superfície clara o dourado do
// Plus lavava no branco, então usa `gradientOnLight` quando existe.
export function TierGlyph({
  tier, size = 16, onDark = true, style,
}: { tier: GateTier; size?: number; onDark?: boolean; style?: CSSProperties }) {
  const id = useId().replace(/:/g, '')
  if (tier === 'free') return null
  const identity = TIER_IDENTITY[tier]
  const stops = (!onDark && identity.gradientOnLight) ? identity.gradientOnLight : identity.gradient
  // Dimensões inteiras: width/height fracionários rasterizavam o SVG em
  // subpixel e o glifo pequeno saía borrado ('pixelado') no header.
  const height = Math.round(size * (180 / 174))
  // Em tamanho pequeno as camadas semitransparentes do glifo (0.6-0.9
  // sobrepostas) viram mingau sem definição — abaixo de 28px renderiza
  // SÓLIDO (opacidade 1 em tudo), com o degradê do tier preservado.
  const solid = size < 28
  return (
    <svg
      width={size}
      height={height}
      viewBox="0 0 174 180"
      fill="none"
      style={style}
      aria-hidden
    >
      <defs>
        <linearGradient id={`arvo-tier-${id}`} x1="0" y1="0" x2="1" y2="1">
          {stops.map((stop, i) => (
            <stop key={i} offset={`${stop.offset * 100}%`} stopColor={stop.color} />
          ))}
        </linearGradient>
      </defs>
      {ARVO_PATHS.map((p, i) => (
        <path key={i} d={p.d} fill={`url(#arvo-tier-${id})`} opacity={solid ? 1 : p.opacity} />
      ))}
    </svg>
  )
}

// Glifo do logo com as camadas em TONS SÓLIDOS pré-calculados: preserva a
// identidade das folhas (que a cor única chapada matava) sem as transparências
// do SVG original (que viravam mingau em 22px). Tons = fg blendado com a
// superfície do tema nos mesmos níveis das opacidades originais
// (1/.85/.7/.6/.8/.9), pintados opacos.
// Níveis do arvo-symbol-black.svg oficial: 1/.8/.65/.55/.75/.85 (mais suaves
// que os do símbolo dourado — usar os do dourado deixava o glifo preto demais).
const GLYPH_SHADES = {
  light: ['#0D0D0D', '#3C3C3B', '#605F5E', '#787775', '#484846', '#313030'],
  dark:  ['#FAF8F4', '#CBC9C6', '#A7A5A2', '#8F8E8B', '#BFBDBA', '#D6D5D1'],
} as const
export function ArvoGlyphSolid({ size = 22, onDark = false, style }: { size?: number; onDark?: boolean; style?: CSSProperties }) {
  const height = Math.round(size * (180 / 174))
  const shades = onDark ? GLYPH_SHADES.dark : GLYPH_SHADES.light
  return (
    <svg width={size} height={height} viewBox="0 0 174 180" fill="none" style={style} aria-hidden>
      {ARVO_PATHS.map((p, i) => (
        <path key={i} d={p.d} fill={shades[i]} />
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
      <TierGlyph tier={tier} size={size} onDark={onDark} style={{ display: 'block', flexShrink: 0 }} />
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
