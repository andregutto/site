import { createClient } from '@supabase/supabase-js'

const url     = process.env.SUPABASE_URL     ?? process.env.VITE_SUPABASE_URL     ?? ''
const anon    = process.env.SUPABASE_ANON_KEY ?? process.env.VITE_SUPABASE_ANON_KEY ?? ''
const service = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''

if (!url || !service) {
  console.error('[supabase] env vars ausentes — url:', !!url, 'service:', !!service)
}

export const supabaseAdmin = createClient(
  url  || 'https://placeholder.supabase.co',
  service || 'placeholder-service-key',
  { auth: { autoRefreshToken: false, persistSession: false } },
)

export function createUserClient(jwt: string) {
  return createClient(
    url  || 'https://placeholder.supabase.co',
    anon || 'placeholder-anon-key',
    {
      global: { headers: { Authorization: `Bearer ${jwt}` } },
      auth:   { autoRefreshToken: false, persistSession: false },
    },
  )
}
