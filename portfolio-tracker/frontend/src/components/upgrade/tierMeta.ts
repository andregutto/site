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

// Ordem canônica das capacidades (gates + quotas intercalados por tema).
// Usada para montar as listas de check dos cards da /planos.
export const ROW_ORDER: string[] = [
  'patrimonio',
  'community',
  'messaging',
  'moments_create',
  'shared_groups_create',
  'budget',
  'freedom_plans',
  'trips_own',
  'split_expenses_per_day',
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
  plus: ['patrimonio', 'community', 'messaging', 'moments_create', 'budget', 'csv_import'],
  pro: ['insights', 'diversification', 'ir_france', 'ai_more', 'everything_plus'],
}

// Retorna a lista de frases de benefício a mostrar no modal para um tier.
// Quando o gate disparador pertence ao tier, sua frase sobe pro topo (mais
// relevante pro contexto), sem repetir.
export function curatedBenefits(requiredTier: GateTier, gate: string, s: Record<string, any>): string[] {
  const bucket = (requiredTier === 'pro' ? 'pro' : 'plus') as 'plus' | 'pro'
  const dict = (s.benefits?.[bucket] ?? {}) as Record<string, string>
  const keys = [...CURATED[bucket]]
  // Se o gate tem benefício próprio nesse bucket e não está no topo, promove.
  if (dict[gate] && keys[0] !== gate) {
    const i = keys.indexOf(gate)
    if (i > 0) keys.splice(i, 1)
    keys.unshift(gate)
  }
  return keys.map(k => dict[k]).filter(Boolean).slice(0, 6)
}
