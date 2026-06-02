import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { getSupabaseSQ } from '@/lib/supabase-sq'

export async function POST(req: NextRequest) {
  const { client_id, month } = await req.json()
  const sb = getSupabaseSQ()
  if (!sb) return NextResponse.json({ error: 'no db' }, { status: 503 })

  // Fetch client
  const { data: clientRaw } = await sb.from('sq_clients').select('*').eq('id', client_id).maybeSingle()
  const client = clientRaw as any
  if (!client) return NextResponse.json({ error: 'client not found' }, { status: 404 })

  // Fetch checklist for this month
  const { data: checklist } = await (sb as any)
    .from('sq_checklists')
    .select('items')
    .eq('client_id', client_id)
    .eq('month', month)
    .maybeSingle()

  const items: any[] = (checklist as any)?.items ?? []
  const done = items.filter(i => i.done)
  const pending = items.filter(i => !i.done)
  const completionPct = items.length > 0 ? Math.round((done.length / items.length) * 100) : 0

  // Fetch events from this month
  const startOfMonth = `${month}-01T00:00:00Z`
  const [y, m] = month.split('-').map(Number)
  const endOfMonth = new Date(y, m, 0, 23, 59, 59).toISOString()

  const { data: events } = await (sb as any)
    .from('sq_client_events')
    .select('type, content, created_at')
    .eq('client_id', client_id)
    .gte('created_at', startOfMonth)
    .lte('created_at', endOfMonth)
    .order('created_at')

  const monthLabel = new Date(`${month}-01`).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })

  const prompt = `Tu es un consultant senior en marketing digital pour Studio Quartier. Tu dois rédiger un rapport mensuel professionnel pour un client.

Ce rapport est DESTINÉ AU CLIENT — il doit être clair, valorisant, et montrer concrètement ce qui a été fait et les résultats obtenus. Ton français est impeccable.

Client : ${client.name}
Catégorie : ${client.category ?? 'commerce local'}
Mois : ${monthLabel}
Services actifs : ${(client.services_active ?? []).join(', ') || 'non renseignés'}

Checklist du mois (${completionPct}% complétée — ${done.length}/${items.length} tâches) :
Tâches réalisées : ${done.map((i: any) => i.task).join(', ') || 'aucune'}
Tâches non réalisées : ${pending.map((i: any) => i.task).join(', ') || 'aucune'}

Activités du mois :
${(events ?? []).map((e: any) => `- [${e.type}] ${e.content}`).join('\n') || '- Aucune activité enregistrée'}

Note Google actuelle : ${client.google_rating ?? 'N/A'}/5 · ${client.google_reviews ?? 0} avis

Génère UNIQUEMENT un objet JSON sans markdown avec cette structure :
{
  "headline": "Titre du rapport — une phrase synthétique sur le mois (15-20 mots)",
  "summary": "2-3 phrases de résumé global du mois — bilan honnête et positif",
  "actions_done": ["Action réalisée 1", "Action réalisée 2", "..."],
  "highlights": [
    { "title": "Point fort (3-5 mots)", "body": "1-2 phrases sur ce point, avec impact concret si possible" }
  ],
  "next_steps": ["Priorité pour le mois prochain 1", "Priorité 2", "Priorité 3"]
}

Contraintes :
- Maximum 5 actions_done, 3 highlights, 3 next_steps
- Ton professionnel, chaleureux, valorisant — montrer la valeur du travail
- Si peu de tâches complétées, rester positif sur ce qui a été fait
- En français, JSON strict`

  try {
    const msg = await anthropic.messages.create({
      model: 'claude-sonnet-4-5',
      max_tokens: 1200,
      messages: [{ role: 'user', content: prompt }],
    })
    const raw = (msg.content[0] as any).text?.trim() ?? ''
    const json = raw.startsWith('{') ? raw : raw.slice(raw.indexOf('{'), raw.lastIndexOf('}') + 1)
    const rapport = JSON.parse(json)
    return NextResponse.json({ rapport, client })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
