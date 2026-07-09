import { Router, Response } from 'express'
import { requireAuth, AuthRequest } from '../middleware/auth.js'
import { supabaseAdmin } from '../lib/supabase.js'
import { cache } from '../lib/cache.js'
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

// GoTrue expõe `banned_until` como ISO (ou ausente). Um usuário está de fato
// bloqueado apenas se a data for no futuro — bans expirados não contam.
export function isBannedUntil(bannedUntil: string | null | undefined): boolean {
  if (!bannedUntil) return false
  const t = Date.parse(bannedUntil)
  return Number.isFinite(t) && t > Date.now()
}

// Contagem "live" das quotas que a UI mostra ("X de Y usados"). trips_own e
// import_accounts contam linhas existentes; split/ai vêm de entitlement_usage
// no período corrente.
async function currentUsage(userId: string): Promise<Record<QuotaKey, number>> {
  const [tripsOwn, importAccounts, splitDay, aiMonth, aiChatMonth] = await Promise.all([
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
    getUsage(userId, 'ai_chat_messages_month', usagePeriod('month')),
  ])
  return {
    trips_own: tripsOwn,
    import_accounts: importAccounts,
    split_expenses_per_day: splitDay,
    ai_categorize_month: aiMonth,
    ai_chat_messages_month: aiChatMonth,
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
    // Pseudo-gates dos CTAs da página /planos (interesse num plano inteiro,
    // sem funcionalidade específica) — não existem na matriz.
    const PLAN_GATES: Record<string, 'plus' | 'pro'> = { plans: 'plus', plan_plus: 'plus', plan_pro: 'pro' }
    if (!isGateKey(gate) && !isQuotaKey(gate) && !(gate in PLAN_GATES)) {
      res.status(400).json({ error: 'gate inválido' }); return
    }

    // required_tier efetivo no momento do clique (a matriz pode evoluir).
    let requiredTier: 'plus' | 'pro'
    if (gate in PLAN_GATES) {
      requiredTier = PLAN_GATES[gate]
    } else if (isGateKey(gate)) {
      const gates = await getEffectiveGates()
      const req_ = gates[gate]
      requiredTier = req_ === 'pro' ? 'pro' : 'plus'
    } else {
      // Quota: menor tier acima de 'free' cujo limite é maior que o do free.
      const quotas = await getEffectiveQuotas()
      // O narrowing de string → QuotaKey se perde com o check `in PLAN_GATES`
      // acima; a validação já garantiu isQuotaKey(gate) neste branch.
      const limits = quotas[gate as QuotaKey].limits
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

// Set de admins — mesma chave/TTL de cache que community.ts e leads.ts usam
// (`community:admins`), invalidada por cache.deletePattern nos promote/demote.
async function getAdminIds(): Promise<Set<string>> {
  return cache.getOrFetch('community:admins', 60_000, async () => {
    const { data } = await supabaseAdmin.from('community_admins').select('user_id')
    return new Set<string>((data ?? []).map((r: { user_id: string }) => r.user_id))
  })
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

// ═══════════════════════════════════════════════════════════════════════════
// Gestão de usuários (/api/entitlements/admin/users/*) — lista TODOS os
// usuários da plataforma (não só quem entrou na comunidade) e permite atribuir
// tier e papel de admin. A aba "Membros" da comunidade só enxerga quem tem
// linha em community_members (criada no 1º acesso ao fórum), então não serve
// pra gestão de tier de todo mundo.
// ═══════════════════════════════════════════════════════════════════════════

const USERS_PAGE_SIZE = 30

// ── GET /api/entitlements/admin/users?q=&page= ───────────────────────────────
// Lista todos os usuários (auth.users, paginado). Enriquece com display/tier/
// admin. Busca `q` filtra por nome/@username/email na página corrente.
router.get('/admin/users', async (req: any, res: Response) => {
  const adminId = await requireAdmin(req, res)
  if (!adminId) return
  const q = String(req.query.q ?? '').trim().toLowerCase()
  const page = Math.max(1, parseInt(String(req.query.page ?? '1'), 10) || 1)

  try {
    // supabaseAdmin.auth.admin.listUsers pagina em 1-index; perPage máx 1000.
    const { data: list, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage: USERS_PAGE_SIZE })
    if (error) { res.status(500).json({ error: error.message }); return }
    const authUsers = list?.users ?? []

    // LEFT JOIN manual: tiers de quem tem linha (resto = 'free') + set de admins.
    const ids = authUsers.map(u => u.id)
    const [{ data: memberRows }, adminIds] = await Promise.all([
      ids.length
        ? supabaseAdmin.from('community_members').select('user_id, tier').in('user_id', ids)
        : Promise.resolve({ data: [] as any[] }),
      getAdminIds(),
    ])
    const tierByUser = new Map<string, string>((memberRows ?? []).map((m: any) => [m.user_id, m.tier]))

    const rows = await Promise.all(authUsers.map(async u => {
      const d = await userDisplay(u.id)
      const meta = u.user_metadata ?? {}
      return {
        id: u.id,
        name: d.name ?? d.email,
        username: d.username ?? null,
        avatar_url: d.avatar_url ?? null,
        email: u.email ?? d.email ?? null,
        created_at: u.created_at ?? null,
        signup_source: typeof meta.signup_source === 'string' ? meta.signup_source : null,
        tier: tierByUser.get(u.id) ?? 'free',
        is_admin: adminIds.has(u.id),
        // banned_until vem do GoTrue como ISO (ou ausente). Considera bloqueado
        // só se for uma data no futuro — bans expirados voltam a false.
        banned: isBannedUntil((u as { banned_until?: string }).banned_until),
      }
    }))

    const filtered = q
      ? rows.filter(r =>
          (r.name ?? '').toLowerCase().includes(q) ||
          (r.username ?? '').toLowerCase().includes(q) ||
          (r.email ?? '').toLowerCase().includes(q))
      : rows

    // has_more olha a página crua (antes do filtro): há mais páginas a carregar.
    res.json({ users: filtered, page, has_more: authUsers.length === USERS_PAGE_SIZE })
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? 'Erro ao carregar usuários' })
  }
})

// ── PUT /api/entitlements/admin/users/:id/tier  { tier } ─────────────────────
// UPSERT em community_members (o usuário pode não ter linha ainda, então não
// pode exigir linha existente como o endpoint de tier da comunidade fazia).
router.put('/admin/users/:id/tier', async (req: any, res: Response) => {
  const adminId = await requireAdmin(req, res)
  if (!adminId) return
  const targetId = String(req.params.id)
  const tier = String(req.body?.tier ?? '')
  if (!['free', 'plus', 'pro', 'beta'].includes(tier)) {
    res.status(400).json({ error: 'tier inválido (free|plus|pro|beta)' }); return
  }
  try {
    const { error } = await supabaseAdmin
      .from('community_members')
      .upsert({ user_id: targetId, tier }, { onConflict: 'user_id' })
    if (error) { res.status(500).json({ error: error.message }); return }
    res.json({ ok: true })
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? 'Erro ao gravar tier' })
  }
})

// ── POST /api/entitlements/admin/users/:id/promote | /demote ─────────────────
// Papel de admin (community_admins) — governa comunidade + recursos + aquisição
// + planos. Upsert/delete por user_id (não exige linha de membro).
router.post('/admin/users/:id/promote', async (req: any, res: Response) => {
  const adminId = await requireAdmin(req, res)
  if (!adminId) return
  const targetId = String(req.params.id)
  try {
    const { error } = await supabaseAdmin
      .from('community_admins')
      .upsert({ user_id: targetId, promoted_by: adminId }, { onConflict: 'user_id' })
    if (error) { res.status(500).json({ error: error.message }); return }
    cache.deletePattern('community:admins')
    res.json({ ok: true })
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? 'Erro ao promover admin' })
  }
})

router.post('/admin/users/:id/demote', async (req: any, res: Response) => {
  const adminId = await requireAdmin(req, res)
  if (!adminId) return
  const targetId = String(req.params.id)
  try {
    const adminIds = await getAdminIds()
    if (adminIds.has(targetId) && adminIds.size <= 1) {
      res.status(400).json({ error: 'cannot demote the last admin' }); return
    }
    const { error } = await supabaseAdmin.from('community_admins').delete().eq('user_id', targetId)
    if (error) { res.status(500).json({ error: error.message }); return }
    cache.deletePattern('community:admins')
    res.json({ ok: true })
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? 'Erro ao rebaixar admin' })
  }
})

// ── POST /api/entitlements/admin/users/:id/block | /unblock ──────────────────
// Bloqueio de conta via GoTrue ban (ban_duration). Bloqueado = não consegue
// logar (o signInWithPassword retorna erro de banido) e, se já estava logado,
// é cortado na próxima request pelo requireAuth (403 account_blocked).
// GUARDAS: não pode bloquear a si mesmo nem outro admin.
const BAN_DURATION = '876000h' // ~100 anos

router.post('/admin/users/:id/block', async (req: any, res: Response) => {
  const adminId = await requireAdmin(req, res)
  if (!adminId) return
  const targetId = String(req.params.id)
  if (targetId === adminId) {
    res.status(400).json({ error: 'Você não pode bloquear a si mesmo' }); return
  }
  try {
    const adminIds = await getAdminIds()
    if (adminIds.has(targetId)) {
      res.status(400).json({ error: 'Não é possível bloquear um admin' }); return
    }
    const { error } = await supabaseAdmin.auth.admin.updateUserById(targetId, { ban_duration: BAN_DURATION })
    if (error) { res.status(500).json({ error: error.message }); return }
    res.json({ ok: true })
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? 'Erro ao bloquear usuário' })
  }
})

router.post('/admin/users/:id/unblock', async (req: any, res: Response) => {
  const adminId = await requireAdmin(req, res)
  if (!adminId) return
  const targetId = String(req.params.id)
  try {
    const { error } = await supabaseAdmin.auth.admin.updateUserById(targetId, { ban_duration: 'none' })
    if (error) { res.status(500).json({ error: error.message }); return }
    res.json({ ok: true })
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? 'Erro ao desbloquear usuário' })
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
