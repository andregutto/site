import { createContext, useContext, useState, useEffect, useCallback, useRef, type ReactNode } from 'react'
import { apiFetch, ApiError } from '../lib/api'
import UpgradeModal from '../components/upgrade/UpgradeModal'

// Contexto central dos tiers no frontend. Responsável por:
//  - buscar GET /api/entitlements 1x (cache em memória) e reexpor a matriz
//  - abrir o UpgradeModal (por gate/quota) de qualquer lugar do app
//  - interceptar 403 { error: 'upgrade_required' } via handleUpgradeError()
//  - lembrar quais gates o usuário já registrou interesse (CTA "avisar")
//
// Estratégia e matriz em docs/TIERS_PLAN.md. A fonte executável dos defaults
// é shared-api/src/lib/entitlements.ts — aqui só consumimos o payload.

export type Tier = 'free' | 'plus' | 'pro' | 'beta'
export type GateTier = 'free' | 'plus' | 'pro'
export const TIER_RANK: Record<Tier, number> = { free: 0, plus: 1, pro: 2, beta: 3 }

export interface QuotaDef {
  limits: { free: number | null; plus: number | null; pro: number | null; beta: number | null }
  period: 'live' | 'day' | 'month'
}

export interface Entitlements {
  tier: Tier
  gates: Record<string, GateTier>
  quotas: Record<string, QuotaDef>
  usage: Record<string, number>
}

// Dado extra que o modal exibe (limit/used vindos de um 403 de quota).
export interface UpgradeExtra {
  limit?: number
  used?: number
}

interface UpgradeCtx {
  entitlements: Entitlements | null
  loading: boolean
  refetch: () => Promise<void>
  /** Abre o modal de upgrade para um gate/quota específico. */
  openUpgrade: (gate: string, requiredTier: GateTier, extra?: UpgradeExtra) => void
  /** Fecha o modal. */
  closeUpgrade: () => void
  /** true se o tier atual já satisfaz o gate (ou o gate está liberado). */
  hasGate: (gate: string) => boolean
  /** Intercepta um erro: se for upgrade_required, abre o modal e retorna true. */
  handleUpgradeError: (e: unknown) => boolean
  /** Registra interesse num gate (CTA "avisar quando abrir"). */
  registerInterest: (gate: string) => Promise<void>
  /** Gates cujo interesse já foi registrado nesta sessão. */
  interestedGates: Set<string>
}

const Ctx = createContext<UpgradeCtx | null>(null)

interface ModalState {
  gate: string
  requiredTier: GateTier
  extra?: UpgradeExtra
}

export function UpgradeProvider({ children }: { children: ReactNode }) {
  const [entitlements, setEntitlements] = useState<Entitlements | null>(null)
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState<ModalState | null>(null)
  const [interestedGates, setInterestedGates] = useState<Set<string>>(new Set())
  const fetchedRef = useRef(false)

  const refetch = useCallback(async () => {
    try {
      const data = await apiFetch<Entitlements>('/entitlements')
      setEntitlements(data)
    } catch {
      // Falha silenciosa: sem entitlements o app segue funcionando (os gates
      // ainda são reforçados pelo backend via 403). Não bloquear a UI.
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (fetchedRef.current) return
    fetchedRef.current = true
    refetch()
  }, [refetch])

  const openUpgrade = useCallback((gate: string, requiredTier: GateTier, extra?: UpgradeExtra) => {
    setModal({ gate, requiredTier, extra })
  }, [])

  const closeUpgrade = useCallback(() => setModal(null), [])

  const hasGate = useCallback((gate: string): boolean => {
    if (!entitlements) return true // otimista até carregar; o 403 do backend cobre
    const required = entitlements.gates[gate]
    if (!required || required === 'free') return true
    return TIER_RANK[entitlements.tier] >= TIER_RANK[required]
  }, [entitlements])

  const handleUpgradeError = useCallback((e: unknown): boolean => {
    const body = e instanceof ApiError ? e.body : null
    if (body && body.error === 'upgrade_required' && typeof body.gate === 'string') {
      const required = (body.required_tier as GateTier) ?? 'plus'
      const extra: UpgradeExtra = {}
      if (typeof body.limit === 'number') extra.limit = body.limit
      if (typeof body.used === 'number') extra.used = body.used
      openUpgrade(body.gate, required, extra)
      return true
    }
    return false
  }, [openUpgrade])

  const registerInterest = useCallback(async (gate: string) => {
    setInterestedGates(prev => new Set(prev).add(gate))
    try {
      await apiFetch('/entitlements/interest', { method: 'POST', body: JSON.stringify({ gate }) })
    } catch {
      // Idempotente no backend (1 por usuário+gate); mesmo se falhar deixamos o
      // estado local marcado — reabrir e reenviar não muda nada.
    }
  }, [])

  return (
    <Ctx.Provider value={{
      entitlements, loading, refetch,
      openUpgrade, closeUpgrade, hasGate, handleUpgradeError,
      registerInterest, interestedGates,
    }}>
      {children}
      {modal && (
        <UpgradeModal
          gate={modal.gate}
          requiredTier={modal.requiredTier}
          extra={modal.extra}
          onClose={closeUpgrade}
        />
      )}
    </Ctx.Provider>
  )
}

export function useUpgrade() {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useUpgrade must be used inside UpgradeProvider')
  return ctx
}
