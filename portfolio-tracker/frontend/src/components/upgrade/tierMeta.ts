// Metadados de apresentação dos tiers no frontend: ordem das capacidades,
// chave i18n de cada gate/quota, e a curadoria de benefícios por tier usada no
// modal (poucos, os mais desejáveis) e nos cards da /planos. Os VALORES (tier
// requerido, limites) vêm sempre de GET /api/entitlements — aqui só mora o
// "como mostrar" e "quais destacar".
//
// Manter alinhado com GATE_DEFAULTS / QUOTA_DEFAULTS em
// shared-api/src/lib/entitlements.ts. Se um gate/quota novo entrar lá e não
// tiver entrada aqui, ele ainda renderiza (fallback pela própria chave), mas
// sem label bonito — adicione a tradução em i18n/*.json → upgrade.rows.

export type Tier = 'free' | 'plus' | 'pro' | 'beta'
export type GateTier = 'free' | 'plus' | 'pro'
export const USER_TIERS: GateTier[] = ['free', 'plus', 'pro']
export const TIER_RANK: Record<GateTier, number> = { free: 0, plus: 1, pro: 2 }

// ---------------------------------------------------------------------------
// Identidade visual por tier — fonte ÚNICA de verdade pra cor/foto de cada
// plano. Alimenta TierBadge (degradê do glifo), a lateral do UpgradeModal, o
// hero/cards da /planos e o GatedEmptyState. Trocar aqui muda em todo lugar.
//
//  - gradient: paradas do degradê do glifo arvo (do claro pro escuro).
//    Plus = dourado; Pro = grafite→bronze ("cartão black" com reflexo dourado).
//  - photo:    foto autoral (/brand/imagery) usada como composição do tier.
//  - chipBorder/labelColor: cromo do chip do TierBadge, legível em claro e dark.
// ---------------------------------------------------------------------------
export interface GradientStop { color: string; offset: number } // offset 0..1

export interface TierIdentity {
  /** Paradas do degradê do glifo arvo (linearGradient x1=0 y1=0 x2=1 y2=1). */
  gradient: GradientStop[]
  /** drop-shadow do glifo sobre superfície escura (px de raio via helper). */
  glowColor: string | null
  photo: string
  chipBorder: string
  labelColor: (onDark: boolean) => string
}

export const TIER_IDENTITY: Record<GateTier, TierIdentity> = {
  free: {
    // Free não tem badge; guardamos a foto pra usar no card Free da /planos.
    gradient: [{ color: '#C8B89A', offset: 0 }, { color: '#8C6A28', offset: 1 }],
    glowColor: null,
    photo: '/brand/tiers/tier-free.jpg',
    chipBorder: 'rgba(200,184,154,0.3)',
    labelColor: onDark => (onDark ? 'rgba(242,237,228,0.8)' : 'var(--arvo-fg-muted)'),
  },
  plus: {
    // Degradê dourado, sem glow.
    gradient: [
      { color: '#E9DCBC', offset: 0 },
      { color: '#C8B89A', offset: 0.45 },
      { color: '#8C6A28', offset: 1 },
    ],
    glowColor: null,
    photo: '/brand/tiers/tier-plus.jpg',
    chipBorder: 'rgba(200,184,154,0.4)',
    labelColor: onDark => (onDark ? 'var(--arvo-gold)' : 'var(--arvo-gold-text)'),
  },
  pro: {
    // Bronze → grafite com tons erguidos (nada de preto puro no fim) + glow
    // dourado sobre dark: leitura "cartão black" com reflexo.
    gradient: [
      { color: '#C9A257', offset: 0 },
      { color: '#5A4E40', offset: 0.35 },
      { color: '#33302B', offset: 0.7 },
      { color: '#1E1C19', offset: 1 },
    ],
    glowColor: '#C9A257', // opacidade vem dos stops do halo radial no TierGlyph
    photo: '/brand/tiers/tier-pro.jpg',
    chipBorder: 'rgba(201,162,87,0.45)',
    labelColor: onDark => (onDark ? 'rgba(224,206,168,0.95)' : '#5A4A2E'),
  },
}

// Linhas "incluídas" — capacidades que TODO tier tem e que não moram na matriz
// de gates/quotas (participação, registro manual, etc). Existem pra que o card
// Free mostre explicitamente o que ele PODE, não só uma parede de "—". Cada
// chave tem label em upgrade.included.<key>; são sempre ✓ em todos os tiers.
export const INCLUDED_ROWS: string[] = [
  'unlimited_accounts',
  'personal_finances',
  'resources',
  'participate_shared',
]

// Ordem canônica das capacidades (gates + quotas intercalados por tema).
// Usada para montar as listas de check dos cards da /planos. As quotas de free
// (trips_own, split_expenses_per_day) vêm cedo pra reforçar o que ele pode.
export const ROW_ORDER: string[] = [
  'trips_own',
  'split_expenses_per_day',
  'patrimonio',
  'community',
  'messaging',
  'moments_create',
  'shared_groups_create',
  'budget',
  'freedom_plans',
  'csv_import',
  'import_accounts',
  'ai_categorize_month',
  'insights',
  'diversification',
  'ir_france',
]

export function tierLabel(t: GateTier, s: Record<string, string>): string {
  return t === 'free' ? (s.tierFree ?? 'Free') : t === 'plus' ? (s.tierPlus ?? 'Plus') : (s.tierPro ?? 'Pro')
}

export function tierTagline(t: Tier, s: Record<string, any>): string {
  const key = (t === 'beta' ? 'pro' : t) as GateTier
  return s.taglines?.[key] ?? ''
}

// Benefícios curados por tier requerido — a lista curta (4-6) que aparece no
// modal. Cada entrada é uma chave em upgrade.benefits.<tier>.<key>. Escolhidos
// pelo apelo, não pela exaustividade (a matriz completa vive na /planos).
const CURATED: Record<'plus' | 'pro', string[]> = {
  plus: ['patrimonio', 'community', 'messaging', 'moments_create', 'budget', 'ai_categorize'],
  pro: ['insights', 'diversification', 'ir_france', 'ai_more', 'everything_plus'],
}

// Chaves de benefício que falam de IA — o modal usa o ✨ (mesmo ícone da
// categorização por IA em Transações) no lugar do marcador ✦ padrão.
export const AI_BENEFIT_KEYS = new Set(['ai_categorize', 'ai_more'])

export interface Benefit { key: string; text: string }

// Retorna os benefícios a mostrar no modal para um tier (chave + texto).
// Quando o gate disparador pertence ao tier, sobe pro topo (mais relevante pro
// contexto), sem repetir.
export function curatedBenefits(requiredTier: GateTier, gate: string, s: Record<string, any>): Benefit[] {
  const bucket = (requiredTier === 'pro' ? 'pro' : 'plus') as 'plus' | 'pro'
  const dict = (s.benefits?.[bucket] ?? {}) as Record<string, string>
  const keys = [...CURATED[bucket]]
  // Se o gate tem benefício próprio nesse bucket e não está no topo, promove.
  if (dict[gate] && keys[0] !== gate) {
    const i = keys.indexOf(gate)
    if (i > 0) keys.splice(i, 1)
    keys.unshift(gate)
  }
  return keys.map(k => ({ key: k, text: dict[k] })).filter(b => b.text).slice(0, 6)
}
