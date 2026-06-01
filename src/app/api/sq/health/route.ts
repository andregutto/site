import { NextResponse } from 'next/server'
import { getSupabaseSQ } from '@/lib/supabase-sq'

export async function GET() {
  const url = process.env.SQ_SUPABASE_URL
  const key = process.env.SQ_SUPABASE_SERVICE_ROLE_KEY

  const envStatus = {
    SQ_SUPABASE_URL: url ? `✓ set (${url.slice(0, 30)}...)` : '✗ missing',
    SQ_SUPABASE_SERVICE_ROLE_KEY: key ? `✓ set (${key.slice(0, 20)}...)` : '✗ missing',
  }

  const sb = getSupabaseSQ()
  if (!sb) {
    return NextResponse.json({ status: 'error', reason: 'client not created — env vars missing', env: envStatus })
  }

  try {
    const { count: clients, error: e1 } = await sb.from('sq_clients').select('*', { count: 'exact', head: true })
    const { count: runs,    error: e2 } = await sb.from('sq_runs').select('*', { count: 'exact', head: true })
    const { count: places,  error: e3 } = await sb.from('sq_places').select('*', { count: 'exact', head: true })

    return NextResponse.json({
      status: 'ok',
      env: envStatus,
      tables: {
        sq_clients: e1 ? `error: ${e1.message}` : `${clients} rows`,
        sq_runs:    e2 ? `error: ${e2.message}` : `${runs} rows`,
        sq_places:  e3 ? `error: ${e3.message}` : `${places} rows`,
      },
    })
  } catch (e: any) {
    return NextResponse.json({ status: 'error', reason: e.message, env: envStatus })
  }
}
