import React, { createContext, useContext, useState, useCallback, useRef } from 'react'
import { useAchievements } from '../hooks/useAchievements'
import type { EarnedAchievement } from '../hooks/useAchievements'
import { ACHIEVEMENT_MAP } from '../lib/achievementDefs'
import AchievementToast from '../components/AchievementToast'
import CelebrationModal from '../components/CelebrationModal'

interface AchievementContextValue {
  earned: EarnedAchievement[]
  earnedKeys: string[]
  totalXp: number
  loading: boolean
  triggerCheck: (total_brl?: number, total_display?: number, currency?: string) => Promise<void>
}

const AchievementContext = createContext<AchievementContextValue | null>(null)

export function AchievementProvider({ children }: { children: React.ReactNode }) {
  const { earned, earnedKeys, totalXp, loading, checkAchievements } = useAchievements()
  const [toastQueue, setToastQueue] = useState<string[]>([])
  const [celebrateKey, setCelebrateKey] = useState<string | null>(null)
  const checking = useRef(false)

  const triggerCheck = useCallback(async (total_brl?: number, total_display?: number, currency?: string) => {
    if (checking.current) return
    checking.current = true
    try {
      const newKeys = await checkAchievements(total_brl, total_display, currency)
      if (newKeys.length > 0) {
        setCelebrateKey(newKeys[0])
        if (newKeys.length > 1) {
          setToastQueue(newKeys.slice(1))
        }
      }
    } finally {
      checking.current = false
    }
  }, [checkAchievements])

  const dismissCelebration = useCallback(() => {
    setCelebrateKey(null)
    if (toastQueue.length > 0) {
      const [next, ...rest] = toastQueue
      setTimeout(() => {
        setCelebrateKey(next)
        setToastQueue(rest)
      }, 400)
    }
  }, [toastQueue])

  const celebrateDef = celebrateKey ? ACHIEVEMENT_MAP[celebrateKey] : null

  return (
    <AchievementContext.Provider value={{ earned, earnedKeys, totalXp, loading, triggerCheck }}>
      {children}
      {toastQueue.map(key => {
        const def = ACHIEVEMENT_MAP[key]
        return def ? <AchievementToast key={key} def={def} onClose={() => setToastQueue(q => q.filter(k => k !== key))} /> : null
      })}
      {celebrateDef && (
        <CelebrationModal def={celebrateDef} onClose={dismissCelebration} />
      )}
    </AchievementContext.Provider>
  )
}

export function useAchievementContext() {
  const ctx = useContext(AchievementContext)
  if (!ctx) throw new Error('useAchievementContext must be used inside AchievementProvider')
  return ctx
}
