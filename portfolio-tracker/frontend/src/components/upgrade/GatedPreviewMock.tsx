import { useMemo } from 'react'

// Mock ESTÁTICO e FALSO da forma do conteúdo por trás do bloqueio (padrão
// Finary): dá desejo mostrando "uma página rica desfocada" sem NUNCA montar o
// children real nem tocar em dado nenhum (segurança + o backend nega os dados).
// É pura UI genérica e elegante — cards skeleton, um gráfico de área falso,
// barras e linhas de lista — nos tons do tema, com blur + leve dim por cima.
//
// Três variantes bastam pra cobrir todos os gates (o GatedEmptyState mapeia o
// gate → variante):
//  - 'chart': patrimônio / insights / diversificação (gráfico + cards de número)
//  - 'feed':  comunidade (feed de posts falsos com avatar + linhas)
//  - 'list':  mensagens / grupos (lista de conversas/itens falsos)

export type PreviewVariant = 'chart' | 'feed' | 'list'

// Mapa gate → variante. Gates não listados caem em 'chart' (a mais genérica e
// "rica"). O GateGuard já sabe o gate e o repassa.
const GATE_VARIANT: Record<string, PreviewVariant> = {
  patrimonio: 'chart',
  insights: 'chart',
  diversification: 'chart',
  community: 'feed',
  community_post: 'feed',
  messaging: 'list',
  shared_groups_create: 'list',
}

export function variantForGate(gate: string): PreviewVariant {
  return GATE_VARIANT[gate] ?? 'chart'
}

// Tokens do tema pro esqueleto — no dark caímos em superfícies escuras, no
// light nas claras. Tudo neutro: o mock é forma, não cor de vertical.
function tokens(onDark: boolean) {
  return {
    surface: onDark ? '#181613' : 'var(--arvo-surface)',
    surfaceSoft: onDark ? '#211E1A' : 'var(--arvo-surface-2, #F3EFE9)',
    border: onDark ? 'rgba(200,184,154,0.12)' : 'var(--arvo-border)',
    block: onDark ? 'rgba(242,237,228,0.10)' : 'rgba(13,13,13,0.06)',
    blockSoft: onDark ? 'rgba(242,237,228,0.06)' : 'rgba(13,13,13,0.035)',
    gold: onDark ? 'rgba(200,184,154,0.55)' : 'rgba(140,106,40,0.45)',
    goldFill: onDark ? 'rgba(200,184,154,0.16)' : 'rgba(200,184,154,0.22)',
  }
}

function Bar({ w, h = 10, r = 6, bg }: { w: number | string; h?: number; r?: number; bg: string }) {
  return <div style={{ width: w, height: h, borderRadius: r, background: bg }} />
}

// Cartão de número falso (label curta + número grande + mini-barra).
function StatCard({ t, wide }: { t: ReturnType<typeof tokens>; wide?: boolean }) {
  return (
    <div style={{ flex: wide ? 2 : 1, background: t.surface, border: `1px solid ${t.border}`, borderRadius: 14, padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
      <Bar w={54} h={8} bg={t.blockSoft} />
      <Bar w={wide ? 130 : 92} h={18} r={7} bg={t.block} />
      <Bar w={40} h={7} bg={t.goldFill} />
    </div>
  )
}

// Gráfico de área falso: curva suave subindo, preenchimento dourado sutil.
function AreaChart({ t }: { t: ReturnType<typeof tokens> }) {
  return (
    <div style={{ background: t.surface, border: `1px solid ${t.border}`, borderRadius: 16, padding: '16px 18px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 14 }}>
        <Bar w={90} h={10} bg={t.block} />
        <Bar w={48} h={10} bg={t.blockSoft} />
      </div>
      <svg viewBox="0 0 320 120" width="100%" height="120" preserveAspectRatio="none" aria-hidden>
        <defs>
          <linearGradient id="gpm-area" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={t.goldFill} />
            <stop offset="100%" stopColor="transparent" />
          </linearGradient>
        </defs>
        <path d="M0 96 C 40 90, 70 70, 105 74 S 165 52, 200 40 S 265 26, 320 12 L 320 120 L 0 120 Z" fill="url(#gpm-area)" />
        <path d="M0 96 C 40 90, 70 70, 105 74 S 165 52, 200 40 S 265 26, 320 12" fill="none" stroke={t.gold} strokeWidth={2.5} strokeLinecap="round" />
      </svg>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 12 }}>
        {[0, 1, 2, 3, 4].map(i => <Bar key={i} w={30} h={7} bg={t.blockSoft} />)}
      </div>
    </div>
  )
}

// Linha de barras falsas (distribuição/diversificação) — barras de alturas
// variadas com uma leve tinta dourada em uma delas.
function BarsRow({ t }: { t: ReturnType<typeof tokens> }) {
  const hs = [46, 72, 34, 88, 58, 40, 66]
  return (
    <div style={{ background: t.surface, border: `1px solid ${t.border}`, borderRadius: 16, padding: '16px 18px' }}>
      <Bar w={110} h={10} bg={t.block} />
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 10, height: 96, marginTop: 16 }}>
        {hs.map((h, i) => (
          <div key={i} style={{ flex: 1, height: h, borderRadius: 6, background: i === 3 ? t.goldFill : t.blockSoft, border: i === 3 ? `1px solid ${t.gold}` : 'none' }} />
        ))}
      </div>
    </div>
  )
}

// Linha de lista falsa: avatar/ícone + duas linhas de texto + valor à direita.
function ListRow({ t, avatar = true }: { t: ReturnType<typeof tokens>; avatar?: boolean }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 0', borderBottom: `1px solid ${t.border}` }}>
      <div style={{ width: 40, height: 40, borderRadius: avatar ? '50%' : 10, background: t.block, flexShrink: 0 }} />
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 7 }}>
        <Bar w="55%" h={10} bg={t.block} />
        <Bar w="80%" h={8} bg={t.blockSoft} />
      </div>
      <Bar w={44} h={12} r={7} bg={t.goldFill} />
    </div>
  )
}

// Post falso (feed da comunidade): cabeçalho com avatar + nome, título, corpo,
// e uma linha de reações.
function PostCard({ t }: { t: ReturnType<typeof tokens> }) {
  return (
    <div style={{ background: t.surface, border: `1px solid ${t.border}`, borderRadius: 16, padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ width: 34, height: 34, borderRadius: '50%', background: t.block }} />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <Bar w={110} h={9} bg={t.block} />
          <Bar w={64} h={7} bg={t.blockSoft} />
        </div>
      </div>
      <Bar w="70%" h={13} r={7} bg={t.block} />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <Bar w="100%" h={8} bg={t.blockSoft} />
        <Bar w="92%" h={8} bg={t.blockSoft} />
        <Bar w="60%" h={8} bg={t.blockSoft} />
      </div>
      <div style={{ display: 'flex', gap: 16, marginTop: 2 }}>
        <Bar w={48} h={9} r={99} bg={t.goldFill} />
        <Bar w={40} h={9} r={99} bg={t.blockSoft} />
      </div>
    </div>
  )
}

export default function GatedPreviewMock({ variant, onDark }: { variant: PreviewVariant; onDark: boolean }) {
  const t = useMemo(() => tokens(onDark), [onDark])

  const body = (() => {
    if (variant === 'feed') {
      return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <PostCard t={t} />
          <PostCard t={t} />
        </div>
      )
    }
    if (variant === 'list') {
      return (
        <div style={{ background: t.surface, border: `1px solid ${t.border}`, borderRadius: 16, padding: '4px 18px' }}>
          {[0, 1, 2, 3, 4].map(i => <ListRow key={i} t={t} />)}
        </div>
      )
    }
    // chart (default): cards de número + gráfico de área + barras
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ display: 'flex', gap: 14 }}>
          <StatCard t={t} wide />
          <StatCard t={t} />
        </div>
        <AreaChart t={t} />
        <BarsRow t={t} />
      </div>
    )
  })()

  return (
    <div
      aria-hidden
      style={{
        position: 'absolute', inset: 0, overflow: 'hidden',
        // Blur + leve dim: parece uma página rica desfocada, não um wireframe.
        // O -8px inset + escala compensa a "borda" transparente que o blur cria.
        filter: 'blur(7px)',
        transform: 'scale(1.04)',
        opacity: onDark ? 0.55 : 0.7,
        pointerEvents: 'none',
      }}
    >
      <div style={{ padding: '22px 24px', display: 'flex', flexDirection: 'column', gap: 14 }}>
        {body}
      </div>
    </div>
  )
}
