import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL ?? ''
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY ?? ''

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('[supabase] Missing env vars: VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY not set at build time.')
}

// In production, route all Supabase traffic through our own domain (/sb/* → Vercel proxy → Supabase)
// so corporate firewalls blocking supabase.co don't affect users.
const effectiveUrl = import.meta.env.PROD
  ? `${window.location.origin}/sb`
  : (supabaseUrl || 'https://placeholder.supabase.co')

export const supabase = createClient(
  effectiveUrl,
  supabaseAnonKey || 'placeholder-anon-key',
)
