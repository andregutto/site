import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'

const LS_KEY = 'portfolio-favorites'

function readLocal(): Set<number> {
  try {
    const raw = localStorage.getItem(LS_KEY)
    if (raw) return new Set(JSON.parse(raw) as number[])
  } catch {}
  return new Set()
}

export function useFavorites() {
  const [favorites, setFavorites] = useState<Set<number>>(readLocal)

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      const arr = data.user?.user_metadata?.favorites as number[] | undefined
      if (Array.isArray(arr)) {
        const s = new Set(arr)
        setFavorites(s)
        localStorage.setItem(LS_KEY, JSON.stringify(arr))
      }
    }).catch(() => {})
  }, [])

  const toggleFavorite = useCallback((id: number) => {
    setFavorites(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      const arr = [...next]
      localStorage.setItem(LS_KEY, JSON.stringify(arr))
      supabase.auth.updateUser({ data: { favorites: arr } }).catch(() => {})
      return next
    })
  }, [])

  return { favorites, toggleFavorite }
}
