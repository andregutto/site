import { useRef, useState } from 'react'
import type React from 'react'
import ArvoLoader from './ArvoLoader'

const PULL_THRESHOLD = 64 // px de arrasto pra soltar e disparar o refresh
const MAX_PULL = 96 // px — depois disso o arrasto passa a "resistir" mais

interface PullToRefreshProps {
  onRefresh: () => Promise<void>
  children: React.ReactNode
}

// Puxar-pra-atualizar — só ativa quando a página já está no topo do scroll
// (senão um scroll normal pra cima disparava o gesto sem querer). Feito com
// touch handlers puros em vez de libs externas pra não inflar o bundle por
// um gesto simples.
export default function PullToRefresh({ onRefresh, children }: PullToRefreshProps) {
  const [pullDistance, setPullDistance] = useState(0)
  const [refreshing, setRefreshing] = useState(false)
  const startY = useRef<number | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  function onTouchStart(e: React.TouchEvent) {
    if (refreshing) return
    if (window.scrollY > 0) { startY.current = null; return }
    startY.current = e.touches[0].clientY
  }

  function onTouchMove(e: React.TouchEvent) {
    if (startY.current == null || refreshing) return
    const delta = e.touches[0].clientY - startY.current
    if (delta <= 0) { setPullDistance(0); return }
    if (window.scrollY > 0) { startY.current = null; setPullDistance(0); return }
    e.preventDefault()
    setPullDistance(Math.min(MAX_PULL, delta * 0.5))
  }

  async function onTouchEnd() {
    if (startY.current == null) return
    startY.current = null
    if (pullDistance >= PULL_THRESHOLD * 0.5) {
      setRefreshing(true)
      setPullDistance(PULL_THRESHOLD * 0.5)
      try { await onRefresh() } finally {
        setRefreshing(false)
        setPullDistance(0)
      }
    } else {
      setPullDistance(0)
    }
  }

  return (
    <div
      ref={containerRef}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
    >
      <div
        className="flex justify-center overflow-hidden"
        style={{ height: pullDistance, transition: startY.current == null ? 'height 200ms ease' : 'none' }}
      >
        {pullDistance > 4 && (
          <div style={{ display: 'flex', alignItems: 'flex-end', paddingBottom: 6 }}>
            <ArvoLoader size={20} style={{ color: 'var(--arvo-gold)', opacity: Math.min(1, pullDistance / (PULL_THRESHOLD * 0.5)) }} />
          </div>
        )}
      </div>
      {children}
    </div>
  )
}
