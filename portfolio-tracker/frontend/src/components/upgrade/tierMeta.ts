// Metadados de apresentação dos tiers no frontend: ordem das linhas da tabela
// comparativa e a chave i18n de cada gate/quota. Os VALORES (tier requerido,
// limites) vêm sempre de GET /api/entitlements — aqui só mora o "como mostrar".
//
// Manter alinhado com GATE_DEFAULTS / QUOTA_DEFAULTS em
// shared-api/src/lib/entitlements.ts. Se um gate/quota novo entrar lá e não
// tiver entrada aqui, ele ainda renderiza (fallback pela própria chave), mas
// sem label bonito — adicione a tradução em i18n/*.json → upgrade.rows.

export type Tier = 'free' | 'plus' | 'pro' | 'beta'
export type GateTier = 'free' | 'plus' | 'pro'
export const USER_TIERS: GateTier[] = ['free', 'plus', 'pro']

// Ordem canônica das linhas na tabela (gates + quotas intercalados por tema).
// A chave é a mesma usada em entitlements.gates / entitlements.quotas.
export const ROW_ORDER: string[] = [
  'patrimonio',
  'moments_create',
  'budget',
  'freedom_plans',
  'shared_groups_create',
  'trips_own',
  'split_expenses_per_day',
  'community_post',
  'messaging',
  'csv_import',
  'import_accounts',
  'ai_categorize',
  'ai_categorize_month',
  'insights',
  'diversification',
  'ir_france',
]

// Gates que têm um título dedicado no modal (ex.: "Patrimônio faz parte do
// Arvo Plus"). Fallback: usa upgrade.rows.<key> + template genérico.
export const GATE_KEYS = new Set<string>([
  'patrimonio', 'moments_create', 'budget', 'freedom_plans', 'shared_groups_create',
  'community_post', 'messaging', 'csv_import', 'ai_categorize',
  'insights', 'diversification', 'ir_france',
])

export function tierLabel(t: GateTier, s: Record<string, string>): string {
  return t === 'free' ? (s.tierFree ?? 'Free') : t === 'plus' ? (s.tierPlus ?? 'Plus') : (s.tierPro ?? 'Pro')
}
