import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import type { User, Session } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'

interface AuthContextType {
  user: User | null
  session: Session | null
  loading: boolean
  signIn: (email: string, password: string) => Promise<void>
  signUp: (email: string, password: string, metadata?: Record<string, unknown>) => Promise<void>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextType | null>(null)

// Purge stale sb-*-auth-token keys from other URL configs.
// The canonical key is derived the same way @supabase/supabase-js does:
//   sb-${hostname.split('.')[0]}-auth-token
// In production (proxy URL = arvo.app/sb) → sb-arvo-auth-token
// In dev (direct Supabase URL) → sb-bkgpivxpzuzedezxtknd-auth-token
function purgeStaleAuthTokens() {
  try {
    const effectiveUrl = import.meta.env.PROD
      ? `${window.location.origin}/sb`
      : (import.meta.env.VITE_SUPABASE_URL ?? '')
    const hostname = new URL(effectiveUrl).hostname
    const canonical = `sb-${hostname.split('.')[0]}-auth-token`
    const stale: string[] = []
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i)
      if (k && k.startsWith('sb-') && k.endsWith('-auth-token') && k !== canonical) stale.push(k)
    }
    stale.forEach(k => localStorage.removeItem(k))
  } catch {}
}
purgeStaleAuthTokens()

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser]       = useState<User | null>(null)
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setUser(data.session?.user ?? null)
    }).catch((err) => {
      console.error('[auth] getSession failed:', err)
    }).finally(() => {
      setLoading(false)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, sess) => {
      if (event === 'SIGNED_OUT' || event === 'SIGNED_IN' || event === 'INITIAL_SESSION') {
        try {
          const keys: string[] = []
          for (let i = 0; i < localStorage.length; i++) {
            const k = localStorage.key(i)
            if (k && (
              k.startsWith('perf8_') ||
              k.startsWith('perf7_') ||           // legacy — purge old format
              k.startsWith('perf6_') ||           // legacy — purge old format
              k.startsWith('perf_inception_v1') ||
              k.startsWith('div_summary_') ||      // dividends cache — user-specific
              k === 'div_last_sync'
            )) keys.push(k)
          }
          keys.forEach(k => localStorage.removeItem(k))
        } catch {}
      }
      setSession(sess)
      setUser(sess?.user ?? null)
    })

    return () => subscription.unsubscribe()
  }, [])

  async function signIn(email: string, password: string) {
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) throw error
  }

  async function signUp(email: string, password: string, metadata?: Record<string, unknown>) {
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: metadata ? { data: metadata } : undefined,
    })
    if (error) throw error
  }

  async function signOut() {
    // Purge stale Supabase auth tokens from all URL configs (prevents header bloat → 494)
    try {
      const keys: string[] = []
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i)
        if (k && k.startsWith('sb-') && k.endsWith('-auth-token')) keys.push(k)
      }
      keys.forEach(k => localStorage.removeItem(k))
    } catch {}

    try {
      await supabase.auth.signOut({ scope: 'local' })
    } catch {
      // Force clear React state even if the API call fails
      setUser(null)
      setSession(null)
    }
  }

  return (
    <AuthContext.Provider value={{ user, session, loading, signIn, signUp, signOut }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider')
  return ctx
}
