import { Router, Response } from 'express'
import { requireAuth, AuthRequest } from '../middleware/auth.js'
import { supabaseAdmin } from '../lib/supabase.js'
import { isAdmin } from '../lib/leads.js'
import { userDisplay } from './people.js'
import {
  GATE_DEFAULTS, QUOTA_DEFAULTS, TIERS,
  getEffectiveGates, getEffectiveQuotas, getUserTier,
  getUsage, usagePeriod, invalidateOverridesCache,
  type GateKey, type QuotaKey, type GateTier,
} from '../lib/entitlements.js'

// Router de entitlements (/api/entitlements):
//   GET  /            → matriz efetiva + tier do usuário + consumo atual dele
//   POST /interest    → registra "Avisar quando abrir" (1 por usuário+gate)
//   GET  /admin       → matriz efetiva (default/override/effective) + métricas de interesse
//   PUT  /admin/:key  → grava override de gate/quota
//   DELETE /admin/:key→ remove override (volta ao default)
//
// Fonte da matriz: lib/entitlements.ts (defaults em código + overrides em banco).

const router = Router()
router.use(requireAuth)

function uid(req: any): string {
  return (req as AuthRequest).userId
}

const GATE_KEYS = Object.keys(GATE_DEFAULTS) as GateKey[]
const QUOTA_KEYS = Object.keys(QUOTA_DEFAULTS) as QuotaKey[]

function isGateKey(k: string): k is GateKey { return (GATE_KEYS as string[]).includes(k) }
function isQuotaKey(k: string): k is QuotaKey { return (QUOTA_KEYS as string[]).includes(k) }

// Contagem "live" das quotas que a UI mostra ("X de Y usados"). trips_own e
// import_accounts contam linhas existentes; split/ai vêm de entitlement_usage
// no período corrente.
async function currentUsage(userId: string): Promise<Record<QuotaKey, number>> {
  const [tripsOwn, importAccounts, splitDay, aiMonth] = await Promise.all([
    supabaseAdmin.from('voyage_trips').select('id', { count: 'exact', head: true }).eq('user_id', userId)
      .then(r => r.count ?? 0),
    (async () => {
      // Contas distintas do usuário que já têm transações de import (source csv:).
      const { data } = await supabaseAdmin
        .from('finance_transactions').select('account_id')
        .eq('user_id', userId).like('source', 'csv:%').not('account_id', 'is', null)
      return new Set((data ?? []).map((r: any) => r.account_id)).size
    })(),
    getUsage(userId, 'split_expenses_per_day', usagePeriod('day')),
    getUsage(userId, 'ai_categorize_month', usagePeriod('month')),
  ])
  return {
    trips_own: tripsOwn,
    import_accounts: importAccounts,
    split_expenses_per_day: splitDay,
    ai_categorize_month: aiMonth,
  }
}

// ── GET /api/entitlements ────────────────────────────────────────────────────
// Matriz efetiva + tier + consumo atual. Alimenta o UpgradeModal, a página
// /planos e os medidores de cota.
router.get('/', async (req: any, res: Response) => {
  try {
    const userId = uid(req)
    const [tier, gates, quotas, usage] = await Promise.all([
      getUserTier(userId),
      getEffectiveGates(),
      getEffectiveQuotas(),
      currentUsage(userId),
    ])
    res.json({ tier, gates, quotas, usage })
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? 'Erro ao carregar entitlements' })
  }
})

// ── POST /api/entitlements/interest  { gate } ────────────────────────────────
// "Avisar quando abrir": 1 registro por usuário+gate (UNIQUE). Upsert ignorando
// duplicata — clicar de novo não vira voto extra nem erro.
router.post('/interest', async (req: any, res: Response) => {
  try {
    const userId = uid(req)
    const gate = String(req.body?.gate ?? '')
    // 'plans' é o pseudo-gate do CTA genérico da página /planos (interesse
    // geral em upgrade, sem funcionalidade específica) — não existe na matriz.
    if (!isGateKey(gate) && !isQuotaKey(gate) && gate !== 'plans') {
      res.status(400).json({ error: 'gate inválido' }); return
    }

    // required_tier efetivo no momento do clique (a matriz pode evoluir).
    let requiredTier: 'plus' | 'pro'
    if (gate === 'plans') {
      requiredTier = 'plus'
    } else if (isGateKey(gate)) {
      const gates = await getEffectiveGates()
      const req_ = gates[gate]
      requiredTier = req_ === 'pro' ? 'pro' : 'plus'
    } else {
      // Quota: menor tier acima de 'free' cujo limite é maior que o do free.
      const quotas = await getEffectiveQuotas()
      const limits = quotas[gate].limits
      const plusBetter = limits.plus === null || (typeof limits.plus === 'number' && (limits.free === null ? false : limits.plus > (limits.free ?? 0)))
      requiredTier = plusBetter ? 'plus' : 'pro'
    }

    const { error } = await supabaseAdmin
      .from('upgrade_interest')
      .upsert({ user_id: userId, gate, required_tier: requiredTier }, { onConflict: 'user_id,gate', ignoreDuplicates: true })
    if (error) { res.status(500).json({ error: error.message }); return }

    res.json({ ok: true })
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? 'Erro ao registrar interesse' })
  }
})

// ═══════════════════════════════════════════════════════════════════════════
// Admin (/api/entitlements/admin/*) — reusa isAdmin (community_admins).
// ═══════════════════════════════════════════════════════════════════════════

async function requireAdmin(req: any, res: Response): Promise<string | null> {
  const userId = uid(req)
  if (!(await isAdmin(userId))) { res.status(403).json({ error: 'admin only' }); return null }
  return userId
}

// ── GET /api/entitlements/admin ──────────────────────────────────────────────
// Matriz efetiva por linha (default/override/effective) + métricas de interesse.
router.get('/admin', async (req: any, res: Response) => {
  const adminId = await requireAdmin(req, res)
  if (!adminId) return
  try {
    const [effGates, effQuotas, { data: overrides }, { data: interest }] = await Promise.all([
      getEffectiveGates(),
      getEffectiveQuotas(),
      supabaseAdmin.from('entitlement_overrides').select('key, kind, value'),
      supabaseAdmin.from('upgrade_interest').select('user_id, gate, required_tier, created_at').order('created_at', { ascending: false }),
    ])

    const overrideByKey = new Map<string, any>((overrides ?? []).map((o: any) => [o.key, o]))

    const gates = GATE_KEYS.map(key => {
      const ov = overrideByKey.get(key)
      return {
        key,
        default: GATE_DEFAULTS[key],
        override: ov && ov.kind === 'gate' ? (ov.value?.requiredTier ?? null) : null,
        effective: effGates[key],
      }
    })

    const quotas = QUOTA_KEYS.map(key => {
      const ov = overrideByKey.get(key)
      return {
        key,
        default: QUOTA_DEFAULTS[key].limits,
        override: ov && ov.kind === 'quota' ? ov.value : null,
        effective: effQuotas[key].limits,
        period: effQuotas[key].period,
      }
    })

    // Interesse por gate (contagem + último clique) e feed recente (últimos 50).
    const rows = interest ?? []
    const byGateMap = new Map<string, { gate: string; required_tier: string; count: number; last_at: string }>()
    for (const r of rows) {
      const cur = byGateMap.get(r.gate)
      if (cur) {
        cur.count += 1
        if (r.created_at > cur.last_at) cur.last_at = r.created_at
      } else {
        byGateMap.set(r.gate, { gate: r.gate, required_tier: r.required_tier, count: 1, last_at: r.created_at })
      }
    }
    const by_gate = [...byGateMap.values()].sort((a, b) => b.count - a.count)

    const recentRows = rows.slice(0, 50)
    const displays = await Promise.all(
      [...new Set(recentRows.map((r: any) => r.user_id))].map(async id => [id, await userDisplay(id)] as const)
    )
    const displayMap = new Map(displays)
    const recent = recentRows.map((r: any) => {
      const d = displayMap.get(r.user_id)
      return {
        gate: r.gate,
        user: d ? { id: r.user_id, name: d.name ?? d.email, username: d.username ?? null, avatar_url: d.avatar_url ?? null } : { id: r.user_id },
        created_at: r.created_at,
      }
    })

    res.json({ gates, quotas, interest: { by_gate, recent, total: rows.length } })
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? 'Erro ao carregar admin de entitlements' })
  }
})

// ── PUT /api/entitlements/admin/:key  { kind, value } ────────────────────────
// Grava/atualiza um override. Valida o shape conforme o tipo (gate/quota).
router.put('/admin/:key', async (req: any, res: Response) => {
  const adminId = await requireAdmin(req, res)
  if (!adminId) return
  const key = String(req.params.key)
  const kind = String(req.body?.kind ?? '')
  const value = req.body?.value

  try {
    if (kind === 'gate') {
      if (!isGateKey(key)) { res.status(400).json({ error: 'gate desconhecido' }); return }
      const rt = value?.requiredTier
      if (!['free', 'plus', 'pro'].includes(rt)) {
        res.status(400).json({ error: 'value.requiredTier deve ser free|plus|pro' }); return
      }
      const normalized: { requiredTier: GateTier } = { requiredTier: rt }
      const { error } = await supabaseAdmin
        .from('entitlement_overrides')
        .upsert({ key, kind: 'gate', value: normalized, updated_at: new Date().toISOString() }, { onConflict: 'key' })
      if (error) { res.status(500).json({ error: error.message }); return }
    } else if (kind === 'quota') {
      if (!isQuotaKey(key)) { res.status(400).json({ error: 'quota desconhecida' }); return }
      if (!value || typeof value !== 'object') { res.status(400).json({ error: 'value deve ser um objeto' }); return }
      const normalized: Record<string, number | null> = {}
      for (const t of TIERS) {
        const v = value[t]
        if (v === undefined) continue
        if (v !== null && typeof v !== 'number') {
          res.status(400).json({ error: `value.${t} deve ser number ou null` }); return
        }
        normalized[t] = v
      }
      const { error } = await supabaseAdmin
        .from('entitlement_overrides')
        .upsert({ key, kind: 'quota', value: normalized, updated_at: new Date().toISOString() }, { onConflict: 'key' })
      if (error) { res.status(500).json({ error: error.message }); return }
    } else {
      res.status(400).json({ error: 'kind deve ser gate|quota' }); return
    }

    invalidateOverridesCache()
    res.json({ ok: true })
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? 'Erro ao gravar override' })
  }
})

// ── DELETE /api/entitlements/admin/:key ──────────────────────────────────────
// Remove o override → volta ao default versionado em código.
router.delete('/admin/:key', async (req: any, res: Response) => {
  const adminId = await requireAdmin(req, res)
  if (!adminId) return
  const key = String(req.params.key)
  try {
    const { error } = await supabaseAdmin.from('entitlement_overrides').delete().eq('key', key)
    if (error) { res.status(500).json({ error: error.message }); return }
    invalidateOverridesCache()
    res.json({ ok: true })
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? 'Erro ao remover override' })
  }
})

export default router
