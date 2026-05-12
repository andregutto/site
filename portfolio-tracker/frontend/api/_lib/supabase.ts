import { createClient } from '@supabase/supabase-js'

const url     = process.env.SUPABASE_URL     ?? process.env.VITE_SUPABASE_URL     ?? ''
const anon    = process.env.SUPABASE_ANON_KEY ?? process.env.VITE_SUPABASE_ANON_KEY ?? ''
const service = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''

if (!url || !service) throw new Error('SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY são obrigatórios')

export const supabaseAdmin = createClient(url, service, {
  auth: { autoRefreshToken: false, persistSession: false },
})

export function createUserClient(jwt: string) {
  return createClient(url, anon, {
    global: { headers: { Authorization: `Bearer ${jwt}` } },
    auth:   { autoRefreshToken: false, persistSession: false },
  })
}
