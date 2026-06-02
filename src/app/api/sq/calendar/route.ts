import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseSQ } from '@/lib/supabase-sq'

export async function GET(req: NextRequest) {
  const client_id = req.nextUrl.searchParams.get('client_id')
  const month     = req.nextUrl.searchParams.get('month')
  const sb = getSupabaseSQ()
  if (!sb) return NextResponse.json({ posts: [] })

  let query = (sb as any).from('sq_calendar_posts').select('*, sq_clients(id, name)')
  if (client_id) query = query.eq('client_id', client_id)
  if (month) {
    const start = `${month}-01`
    const [y, m] = month.split('-').map(Number)
    const end = new Date(y, m, 0).toISOString().slice(0, 10) // last day of month
    query = query.gte('post_date', start).lte('post_date', end)
  }
  const { data, error } = await query.order('post_date')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ posts: data ?? [] })
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  const sb = getSupabaseSQ()
  if (!sb) return NextResponse.json({ error: 'no db' }, { status: 503 })
  const { data, error } = await (sb as any)
    .from('sq_calendar_posts')
    .insert(body)
    .select()
    .maybeSingle()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ post: data })
}
