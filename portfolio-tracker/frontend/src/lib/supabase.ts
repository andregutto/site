import { createClient } from '@supabase/supabase-js'
import { isNativeApp } from './platform'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL ?? ''
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY ?? ''

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('[supabase] Missing env vars: VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY not set at build time.')
}

// In production, route all Supabase traffic through our own domain (/sb/* → Vercel proxy → Supabase)
// so corporate firewalls blocking supabase.co don't affect users. Must stay same-origin
// (window.location.origin) — hardcoding a fixed domain here makes every request cross-origin
// whenever the app is accessed from a different alias (default Vercel domain, preview deploys),
// which breaks login/storage calls with "Failed to fetch". The one place this origin leaking into
// stored data actually matters is getPublicUrl() results for cover photos — normalize those to the
// canonical domain at the point they're saved (see normalizeStorageUrl in lib/storageUrl.ts),
// not by changing the client's own base URL.
//
// Inside a Capacitor shell there's no real web origin (window.location.origin resolves to
// something like capacitor://localhost, with no /sb proxy behind it), so the firewall-avoidance
// trick doesn't apply and would just break auth/storage. Native builds talk to Supabase directly.
const effectiveUrl = isNativeApp()
  ? (supabaseUrl || 'https://placeholder.supabase.co')
  : import.meta.env.PROD
    ? `${window.location.origin}/sb`
    : (supabaseUrl || 'https://placeholder.supabase.co')

export const supabase = createClient(
  effectiveUrl,
  supabaseAnonKey || 'placeholder-anon-key',
)
