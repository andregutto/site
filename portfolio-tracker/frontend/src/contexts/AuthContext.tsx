import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import type { User, Session } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import { isNativeApp, NATIVE_AUTH_CALLBACK_URL } from '../lib/platform'

interface AuthContextType {
  user: User | null
  session: Session | null
  loading: boolean
  signIn: (email: string, password: string) => Promise<void>
  signInWithGoogle: (redirectPath?: string) => Promise<void>
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

// First sign-in via OAuth: mirror the metadata the email/password register flow
// writes (first_name, last_name, default_currency, preferred_locale) so the rest
// of the app — /profile, people search, achievements — sees OAuth users the same
// way. The profiles row + default classes/envelopes come from the DB trigger
// (handle_new_user), which runs for OAuth inserts too.
async function bootstrapOAuthProfile(u: User) {
  if (u.app_metadata?.provider === 'google' && !u.user_metadata?.oauth_profile_synced) {
    const meta = u.user_metadata ?? {}
    const fullName: string = meta.full_name ?? meta.name ?? ''
    const firstName: string = meta.given_name ?? fullName.split(' ')[0] ?? ''
    const lastName: string  = meta.family_name ?? fullName.split(' ').slice(1).join(' ')
    const storedLocale = localStorage.getItem('portfolio-locale')
    const data: Record<string, unknown> = { oauth_profile_synced: true }
    if (!meta.first_name && firstName)        data.first_name = firstName
    if (!meta.last_name && lastName)          data.last_name = lastName
    if (!meta.default_currency)               data.default_currency = 'BRL'
    if (!meta.preferred_locale && storedLocale) data.preferred_locale = storedLocale
    // Google's OAuth payload carries the profile photo as `picture` (GoTrue
    // also mirrors it into `avatar_url` for some providers, but not reliably
    // for Google, so read both). Only seed it if the user hasn't set one.
    const googlePhoto: string | undefined = meta.avatar_url ?? meta.picture
    if (!meta.avatar_url && googlePhoto)      data.avatar_url = googlePhoto
    await supabase.auth.updateUser({ data })
    // Same newsletter opt-in the register form does
    fetch('/api/newsletter/subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: u.email,
        first_name: firstName || undefined,
        last_name: lastName || undefined,
      }),
    }).catch(() => {})
  }
}

// O gate de Recursos grava sessionStorage['signup_source'] (ex:
// 'resource:planilha-custo-de-vida-paris') ANTES de mandar pro Google —
// só sobrevive ao redirect via sessionStorage mesmo, porque o OAuth authorize
// da Supabase não repassa query params arbitrários de volta. No fluxo
// email/senha isso vai direto no signUp() (options.data), mas no Google o
// usuário já existe (sem metadata) quando a gente volta do redirect, então
// precisa de um updateUser() aqui — o trigger de 072_signup_source_oauth_fix.sql
// (AFTER UPDATE OF raw_user_meta_data) que grava em profiles.signup_source.
async function bootstrapResourceSignupSource(u: User) {
  const pending = sessionStorage.getItem('signup_source')
  if (!pending || u.user_metadata?.signup_source) return
  sessionStorage.removeItem('signup_source')
  await supabase.auth.updateUser({ data: { signup_source: pending } }).catch(() => {})
}

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
      if (event === 'SIGNED_IN' && sess?.user) {
        bootstrapOAuthProfile(sess.user).catch(err => {
          console.warn('[auth] OAuth profile bootstrap failed:', err)
        })
        bootstrapResourceSignupSource(sess.user).catch(err => {
          console.warn('[auth] resource signup_source bootstrap failed:', err)
        })
      }
    })

    return () => subscription.unsubscribe()
  }, [])

  async function signIn(email: string, password: string) {
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) throw error
  }

  async function signInWithGoogle(redirectPath = '/login') {
    // Redirects to Google via the Supabase authorize endpoint (through the /sb
    // proxy in prod). On return, detectSessionInUrl picks up the tokens on
    // whatever path is passed here — defaults to /login (which then handles
    // pending_invite_token etc.), but callers like the resource gate page
    // pass their own path so the OAuth round-trip lands directly back on
    // them instead of visibly bouncing through /login first.
    //
    // Inside a Capacitor shell, window.location.origin isn't a real reachable web
    // origin, so the redirect must target the reserved custom scheme instead — this
    // only sets up the correct redirectTo URL. Actually catching the deep link back
    // (opening the system browser via @capacitor/browser, listening for appUrlOpen
    // via @capacitor/app, then exchanging the code for a session) still needs to be
    // wired once those packages are added; isNativeApp() is always false until then,
    // so this branch is unreachable today and web/PWA behavior is unchanged.
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: isNativeApp() ? NATIVE_AUTH_CALLBACK_URL : `${window.location.origin}${redirectPath}`,
        queryParams: { prompt: 'select_account' },
      },
    })
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
    <AuthContext.Provider value={{ user, session, loading, signIn, signInWithGoogle, signUp, signOut }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider')
  return ctx
}
