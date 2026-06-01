import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseSQ } from '@/lib/supabase-sq'

const STANDARD_TASKS = [
  { category: 'Contenu',    task: 'Publier 8 posts Instagram' },
  { category: 'Contenu',    task: 'Publier 4 stories Instagram' },
  { category: 'Contenu',    task: 'Publier 1 post Google Business' },
  { category: 'SEO local',  task: 'Répondre à tous les nouveaux avis Google' },
  { category: 'SEO local',  task: 'Vérifier les informations Google Business (horaires, photos)' },
  { category: 'Reporting',  task: 'Envoyer rapport mensuel au client' },
  { category: 'Admin',      task: 'Envoyer la facture mensuelle' },
  { category: 'Admin',      task: 'Vérifier les analytics du site web' },
]

export async function GET(req: NextRequest) {
  const client_id = req.nextUrl.searchParams.get('client_id')
  const month     = req.nextUrl.searchParams.get('month') ?? new Date().toISOString().slice(0, 7)
  const sb = getSupabaseSQ()
  if (!sb || !client_id) return NextResponse.json({ checklist: null })

  const { data } = await sb.from('sq_checklists').select('*').eq('client_id', client_id).eq('month', month).maybeSingle()
  if (data) return NextResponse.json({ checklist: data })

  // Create with standard tasks for new month
  const items = STANDARD_TASKS.map((t, i) => ({ id: `std_${i}`, ...t, done: false }))
  const { data: created } = await sb.from('sq_checklists').insert({ client_id, month, items } as any).select().maybeSingle()
  return NextResponse.json({ checklist: created })
}

export async function PATCH(req: NextRequest) {
  const { client_id, month, items } = await req.json()
  const sb = getSupabaseSQ()
  if (!sb) return NextResponse.json({ error: 'no db' }, { status: 503 })
  const { data, error } = await (sb as any).from('sq_checklists').update({ items }).eq('client_id', client_id).eq('month', month).select().maybeSingle()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ checklist: data })
}
