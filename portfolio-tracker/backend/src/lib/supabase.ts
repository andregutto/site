import { createClient } from '@supabase/supabase-js'

const url     = process.env.SUPABASE_URL!
const anon    = process.env.SUPABASE_ANON_KEY!
const service = process.env.SUPABASE_SERVICE_ROLE_KEY!

if (!url || !service) throw new Error('SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY são obrigatórios')

// Admin: bypassa RLS — usar só no backend, nunca expor ao cliente
export const supabaseAdmin = createClient(url, service, {
  auth: { autoRefreshToken: false, persistSession: false },
})

// Cria um client escopado ao usuário autenticado (respeita RLS)
export function createUserClient(jwt: string) {
  return createClient(url, anon, {
    global: { headers: { Authorization: `Bearer ${jwt}` } },
    auth:   { autoRefreshToken: false, persistSession: false },
  })
}
