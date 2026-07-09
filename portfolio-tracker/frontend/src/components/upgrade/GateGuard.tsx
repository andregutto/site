import { useEffect, useRef, type ReactNode } from 'react'
import { useUpgrade, type GateTier } from '../../contexts/UpgradeContext'
import GatedEmptyState from './GatedEmptyState'
import { PageLoader } from '../ArvoLoader'

// Guarda de rota por gate. Decide pelo tier do usuário (UpgradeContext.hasGate),
// sem depender do 403 do backend: se o gate se aplica, o children NUNCA monta —
// renderizamos o painel bloqueado premium NO LUGAR da página, e a página real
// jamais fica utilizável por trás. O modal abre automaticamente 1x; fechá-lo
// mantém o painel bloqueado. Ver docs/TIERS_PLAN.md.
export default function GateGuard({ gate, requiredTier = 'plus', children }: {
  gate: string
  requiredTier?: GateTier
  children: ReactNode
}) {
  const { hasGate, openUpgrade, loading, entitlements } = useUpgrade()
  const allowed = hasGate(gate)
  const openedRef = useRef(false)

  // Abre o modal 1x quando o bloqueio se confirma (entitlements já carregados).
  useEffect(() => {
    if (!loading && entitlements && !allowed && !openedRef.current) {
      openedRef.current = true
      openUpgrade(gate, requiredTier)
    }
  }, [loading, entitlements, allowed, gate, requiredTier, openUpgrade])

  // Enquanto os entitlements não carregaram, não expomos a página: seguramos num
  // loader. Só depois de saber o tier é que liberamos o children ou mostramos o
  // painel bloqueado. (Antes o children montava otimista e piscava a página real
  // por trás — bug corrigido.)
  if (loading || !entitlements) return <PageLoader />
  if (!allowed) return <GatedEmptyState gate={gate} requiredTier={requiredTier} />
  return <>{children}</>
}
