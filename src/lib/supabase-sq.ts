import { createClient } from '@supabase/supabase-js'

let _client: ReturnType<typeof createClient> | null = null

export function getSupabaseSQ() {
  if (_client) return _client
  const url = process.env.SQ_SUPABASE_URL
  const key = process.env.SQ_SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  _client = createClient(url, key, { auth: { persistSession: false } })
  return _client
}
