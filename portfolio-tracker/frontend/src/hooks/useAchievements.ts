import { useState, useEffect, useCallback } from 'react'
import { apiFetch } from '../lib/api'
import { ACHIEVEMENT_MAP, getTotalXp } from '../lib/achievementDefs'

export interface EarnedAchievement {
  achievement_key: string
  earned_at: string
}

export function useAchievements() {
  const [earned, setEarned] = useState<EarnedAchievement[]>([])
  const [loading, setLoading] = useState(true)

  const reload = useCallback(async () => {
    try {
      const data = await apiFetch<EarnedAchievement[]>('/api/achievements')
      setEarned(data)
    } catch {
      // ignore
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { reload() }, [reload])

  const earnedKeys = earned.map(e => e.achievement_key)
  const totalXp = getTotalXp(earnedKeys)

  const checkAchievements = useCallback(async (total_brl?: number): Promise<string[]> => {
    try {
      const res = await apiFetch<{ newly_earned: string[] }>('/api/achievements/check', {
        method: 'POST',
        body: JSON.stringify({ total_brl }),
      })
      if (res.newly_earned.length > 0) {
        await reload()
      }
      return res.newly_earned
    } catch {
      return []
    }
  }, [reload])

  return { earned, earnedKeys, totalXp, loading, reload, checkAchievements }
}

export type { EarnedAchievement as Achievement }
export { ACHIEVEMENT_MAP }
