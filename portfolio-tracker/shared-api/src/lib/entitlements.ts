// Entitlements do Arvo — fonte única da matriz Free/Plus/Pro/Beta.
//
// Estratégia completa e racional em docs/TIERS_PLAN.md. Regras-resumo:
//   Free = fazer na mão + participar (quem divide nunca é bloqueado)
//   Plus = automatizar e conviver · Pro = analisar profissionalmente
//   Beta = interno/testers (topo do ranking, nunca aparece como oferta)
//
// Os valores abaixo são os DEFAULTS versionados. O admin pode sobrescrever
// qualquer gate/quota em produção via tabela entitlement_overrides (sem
// deploy); ausência de override = vale o default daqui. Ambas as camadas
// são mescladas em getEffectiveGates()/getEffectiveQuotas() com cache curto.

import { supabaseAdmin } from './supabase.js'
import { cache } from './cache.js'

export type Tier = 'free' | 'plus' | 'pro' | 'beta'
export const TIER_RANK: Record<Tier, number> = { free: 0, plus: 1, pro: 2, beta: 3 }
export const TIERS: Tier[] = ['free', 'plus', 'pro', 'beta']

// 'free' como requiredTier = gate desligado (funcionalidade liberada pra todos).
export type GateTier = 'free' | 'plus' | 'pro'

// ---------------------------------------------------------------------------
// Gates: funcionalidade inteira atrás de um tier.
// A chave é o identificador estável usado em upgrade_interest.gate e nos
// payloads de erro — não renomear sem migrar os dados.
// ---------------------------------------------------------------------------
export const GATE_DEFAULTS = {
  // Vertente inteira (contas/instituições ficam FORA — são de Finanças também)
  patrimonio:           'plus',
  // Criar Momento nomeado do zero. Promoção a partir de split (is_pair_default
  // → nomeado ao entrar 3ª pessoa) e momentos de viagem NÃO passam por aqui.
  moments_create:       'plus',
  freedom_plans:        'plus',
  budget:               'plus',
  shared_groups_create: 'plus',
  community_post:       'plus', // postar/curtir; leitura é livre pra logado
  messaging:            'plus',
  csv_import:           'plus', // + quota import_accounts
  ai_categorize:        'plus', // + quota ai_categorize_month
  insights:             'pro',
  diversification:      'pro',
  ir_france:            'pro',  // relatórios fiscais 2DC/2TR
} satisfies Record<string, GateTier>

export type GateKey = keyof typeof GATE_DEFAULTS

// ---------------------------------------------------------------------------
// Quotas: limite numérico por tier. null = ilimitado.
// period: como o consumo é medido — 'live' conta linhas existentes no banco,
// 'day'/'month' usam entitlement_usage via increment_entitlement_usage().
// ---------------------------------------------------------------------------
export const QUOTA_DEFAULTS = {
  trips_own:              { limits: { free: 1, plus: null, pro: null, beta: null }, period: 'live' },
  split_expenses_per_day: { limits: { free: 5, plus: null, pro: null, beta: null }, period: 'day' },
  import_accounts:        { limits: { free: 0, plus: 3,    pro: null, beta: null }, period: 'live' },
  ai_categorize_month:    { limits: { free: 0, plus: 100,  pro: 1000, beta: null }, period: 'month' },
} satisfies Record<string, { limits: Record<Tier, number | null>, period: 'live' | 'day' | 'month' }>

export type QuotaKey = keyof typeof QUOTA_DEFAULTS

// ---------------------------------------------------------------------------
// Overrides (entitlement_overrides) + matriz efetiva
// ---------------------------------------------------------------------------

interface OverrideRow { key: string; kind: 'gate' | 'quota'; value: any; updated_at: string }

const OVERRIDES_TTL = 60 * 1000 // staleness aceitável de 1 min após edição no admin

async function loadOverrides(): Promise<OverrideRow[]> {
  return cache.getOrFetch('entitlements:overrides', OVERRIDES_TTL, async () => {
    const { data } = await supabaseAdmin.from('entitlement_overrides').select('*')
    return data ?? []
  })
}

// Chamar depois de gravar/remover um override no admin pra refletir na hora
// (na instância que atendeu a request; as demais expiram pelo TTL).
export function invalidateOverridesCache(): void {
  cache.deletePattern('entitlements:overrides')
}

export async function getEffectiveGates(): Promise<Record<GateKey, GateTier>> {
  const overrides = await loadOverrides()
  const gates = { ...GATE_DEFAULTS } as Record<GateKey, GateTier>
  for (const o of overrides) {
    if (o.kind === 'gate' && o.key in gates && ['free', 'plus', 'pro'].includes(o.value?.requiredTier)) {
      gates[o.key as GateKey] = o.value.requiredTier
    }
  }
  return gates
}

export async function getEffectiveQuotas(): Promise<Record<QuotaKey, { limits: Record<Tier, number | null>, period: 'live' | 'day' | 'month' }>> {
  const overrides = await loadOverrides()
  const quotas = Object.fromEntries(
    Object.entries(QUOTA_DEFAULTS).map(([k, v]) => [k, { limits: { ...v.limits }, period: v.period }])
  ) as Record<QuotaKey, { limits: Record<Tier, number | null>, period: 'live' | 'day' | 'month' }>
  for (const o of overrides) {
    if (o.kind === 'quota' && o.key in quotas && o.value && typeof o.value === 'object') {
      for (const t of TIERS) {
        const v = o.value[t]
        if (v === null || typeof v === 'number') quotas[o.key as QuotaKey].limits[t] = v
      }
    }
  }
  return quotas
}

// ---------------------------------------------------------------------------
// Tier do usuário (community_members é a fonte; upsert 'free' no 1º acesso).
// community.ts delega pra cá — manter uma única implementação.
// ---------------------------------------------------------------------------
export async function getUserTier(userId: string): Promise<Tier> {
  const { data } = await supabaseAdmin.from('community_members').select('tier').eq('user_id', userId).maybeSingle()
  if (data) return data.tier as Tier
  await supabaseAdmin.from('community_members').insert({ user_id: userId, tier: 'free' })
  return 'free'
}

// ---------------------------------------------------------------------------
// Checagens. Payload de 403 padronizado — o frontend intercepta
// error === 'upgrade_required' e abre o UpgradeModal com gate/required_tier.
// ---------------------------------------------------------------------------

export interface UpgradeRequired {
  error: 'upgrade_required'
  gate: string
  required_tier: 'plus' | 'pro'
  limit?: number
  used?: number
}

export async function checkGate(userId: string, gate: GateKey): Promise<{ ok: true; tier: Tier } | { ok: false; payload: UpgradeRequired }> {
  const [tier, gates] = await Promise.all([getUserTier(userId), getEffectiveGates()])
  const required = gates[gate]
  if (required === 'free' || TIER_RANK[tier] >= TIER_RANK[required]) return { ok: true, tier }
  return { ok: false, payload: { error: 'upgrade_required', gate, required_tier: required } }
}

// Pra quotas: o chamador informa o consumo atual (contagem live ou retorno de
// increment_entitlement_usage). required_tier anunciado = menor tier cujo
// limite supera o do tier atual.
export async function checkQuota(userId: string, quota: QuotaKey, used: number): Promise<{ ok: true; tier: Tier; limit: number | null } | { ok: false; payload: UpgradeRequired }> {
  const [tier, quotas] = await Promise.all([getUserTier(userId), getEffectiveQuotas()])
  const limits = quotas[quota].limits
  const limit = limits[tier]
  if (limit === null || used < limit) return { ok: true, tier, limit }
  const next = (['plus', 'pro'] as const).find(t =>
    TIER_RANK[t] > TIER_RANK[tier] && (limits[t] === null || (limits[t] as number) > limit)
  ) ?? 'pro'
  return { ok: false, payload: { error: 'upgrade_required', gate: quota, required_tier: next, limit, used } }
}

// Período corrente pra quotas medidas por entitlement_usage.
export function usagePeriod(period: 'day' | 'month'): string {
  const now = new Date().toISOString()
  return period === 'day' ? now.slice(0, 10) : now.slice(0, 7)
}

export async function incrementUsage(userId: string, quota: QuotaKey, period: string, amount = 1): Promise<number> {
  const { data, error } = await supabaseAdmin.rpc('increment_entitlement_usage', {
    p_user_id: userId, p_quota_key: quota, p_period: period, p_amount: amount,
  })
  if (error) throw new Error(error.message)
  return data as number
}

export async function getUsage(userId: string, quota: QuotaKey, period: string): Promise<number> {
  const { data } = await supabaseAdmin
    .from('entitlement_usage').select('used')
    .eq('user_id', userId).eq('quota_key', quota).eq('period', period).maybeSingle()
  return data?.used ?? 0
}
