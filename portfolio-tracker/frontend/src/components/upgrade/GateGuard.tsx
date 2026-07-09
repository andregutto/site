import { useEffect, type ReactNode } from 'react'
import { useUpgrade, type GateTier } from '../../contexts/UpgradeContext'
import GatedEmptyState from './GatedEmptyState'
import { PageLoader } from '../ArvoLoader'

// Guarda de rota por gate. Envolve uma página inteira: se o tier do usuário não
// alcança o gate, mostra o estado vazio + abre o modal, em vez de deixar a
// página bater num 403 do backend. A seção continua no nav (o gate aparece no
// uso, não some da navegação). Ver docs/TIERS_PLAN.md item "Pontos de gate".
export default function GateGuard({ gate, requiredTier = 'plus', children }: {
  gate: string
  requiredTier?: GateTier
  children: ReactNode
}) {
  const { hasGate, openUpgrade, loading, entitlements } = useUpgrade()
  const allowed = hasGate(gate)

  useEffect(() => {
    if (!loading && entitlements && !allowed) openUpgrade(gate, requiredTier)
  }, [loading, entitlements, allowed, gate, requiredTier, openUpgrade])

  // Enquanto os entitlements não carregaram, hasGate é otimista (true) — segue
  // renderizando a página; se depois vier negado, troca pro estado vazio.
  if (!loading && entitlements && !allowed) {
    return <GatedEmptyState gate={gate} requiredTier={requiredTier} />
  }
  if (loading && !entitlements) return <PageLoader />
  return <>{children}</>
}
