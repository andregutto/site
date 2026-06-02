import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseSQ } from '@/lib/supabase-sq'

// Tasks that are always present regardless of services
const ADMIN_TASKS = [
  { category: 'Admin', task: 'Envoyer rapport mensuel au client' },
  { category: 'Admin', task: 'Envoyer la facture mensuelle' },
]

// Tasks generated based on contracted services
const SERVICE_TASKS: { match: string; tasks: { category: string; task: string }[] }[] = [
  {
    match: 'réseaux sociaux',
    tasks: [
      { category: 'Contenu', task: 'Publier 8 posts Instagram' },
      { category: 'Contenu', task: 'Publier 4 stories Instagram' },
      { category: 'Contenu', task: 'Publier 1 post Facebook' },
    ],
  },
  {
    match: 'google',
    tasks: [
      { category: 'Contenu', task: 'Publier 1 post Google Business' },
      { category: 'SEO local', task: 'Vérifier les informations Google Business (horaires, photos)' },
    ],
  },
  {
    match: 'seo',
    tasks: [
      { category: 'SEO local', task: 'Vérifier le positionnement local sur Google' },
      { category: 'SEO local', task: 'Répondre à tous les nouveaux avis Google' },
    ],
  },
  {
    match: 'avis',
    tasks: [
      { category: 'SEO local', task: 'Répondre à tous les nouveaux avis Google' },
      { category: 'SEO local', task: 'Vérifier les réponses automatiques aux avis' },
    ],
  },
  {
    match: 'site web',
    tasks: [
      { category: 'Site web', task: 'Vérifier les analytics du site web' },
      { category: 'Site web', task: 'Mettre à jour le contenu du site si nécessaire' },
    ],
  },
  {
    match: 'email',
    tasks: [
      { category: 'Contenu', task: 'Préparer et envoyer la newsletter mensuelle' },
    ],
  },
  {
    match: 'publicité',
    tasks: [
      { category: 'Publicité', task: 'Vérifier les performances des campagnes Ads' },
      { category: 'Publicité', task: 'Ajuster les budgets et ciblages si nécessaire' },
    ],
  },
  {
    match: 'photo',
    tasks: [
      { category: 'Contenu', task: 'Planifier / réaliser la séance photo du mois' },
      { category: 'Contenu', task: 'Livrer les visuels traités au client' },
    ],
  },
]

// Fallback when no services are active
const DEFAULT_TASKS = [
  { category: 'Contenu',   task: 'Publier 8 posts Instagram' },
  { category: 'Contenu',   task: 'Publier 4 stories Instagram' },
  { category: 'Contenu',   task: 'Publier 1 post Google Business' },
  { category: 'SEO local', task: 'Répondre à tous les nouveaux avis Google' },
  { category: 'SEO local', task: 'Vérifier les informations Google Business (horaires, photos)' },
]

function buildTasksFromServices(services: string[]): { category: string; task: string }[] {
  if (!services || services.length === 0) return DEFAULT_TASKS

  const seen = new Set<string>()
  const tasks: { category: string; task: string }[] = []

  for (const svc of services) {
    const key = svc.toLowerCase()
    for (const rule of SERVICE_TASKS) {
      if (key.includes(rule.match)) {
        for (const t of rule.tasks) {
          if (!seen.has(t.task)) {
            seen.add(t.task)
            tasks.push(t)
          }
        }
      }
    }
  }

  return tasks.length > 0 ? tasks : DEFAULT_TASKS
}

export async function GET(req: NextRequest) {
  const client_id = req.nextUrl.searchParams.get('client_id')
  const month     = req.nextUrl.searchParams.get('month') ?? new Date().toISOString().slice(0, 7)
  const sb = getSupabaseSQ()
  if (!sb || !client_id) return NextResponse.json({ checklist: null })

  const { data } = await sb.from('sq_checklists').select('*').eq('client_id', client_id).eq('month', month).maybeSingle()
  if (data) return NextResponse.json({ checklist: data })

  // Fetch client services + previous month custom tasks in parallel
  const [year, mon] = month.split('-').map(Number)
  const prevDate  = new Date(year, mon - 2, 1)
  const prevMonth = `${prevDate.getFullYear()}-${String(prevDate.getMonth() + 1).padStart(2, '0')}`

  const [clientRes, prevRes] = await Promise.all([
    sb.from('sq_clients').select('services_active').eq('id', client_id).maybeSingle(),
    sb.from('sq_checklists').select('items').eq('client_id', client_id).eq('month', prevMonth).maybeSingle(),
  ])

  const services: string[] = (clientRes.data as any)?.services_active ?? []
  const serviceTasks = buildTasksFromServices(services)
  const allStandardTasks = [...serviceTasks, ...ADMIN_TASKS]
  const standardTaskSet  = new Set(allStandardTasks.map(t => t.task))

  const standardItems = allStandardTasks.map((t, i) => ({ id: `std_${i}`, ...t, done: false }))

  // Carry over custom tasks from previous month
  const customItems = prevRes.data
    ? ((prevRes.data as any).items as any[])
        .filter(i => !standardTaskSet.has(i.task))
        .map(i => ({ ...i, done: false }))
    : []

  const items = [...standardItems, ...customItems]
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
