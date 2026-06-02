import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { getSupabaseSQ } from '@/lib/supabase-sq'

type Ctx = { params: Promise<{ id: string }> }

export async function POST(_req: NextRequest, { params }: Ctx) {
  const { id } = await params
  const sb = getSupabaseSQ()
  if (!sb) return NextResponse.json({ error: 'no db' }, { status: 503 })

  // Fetch devis + client + briefing in parallel
  const { data: devis } = await sb.from('sq_devis').select('*, sq_clients(*)').eq('id', id).maybeSingle()
  if (!devis) return NextResponse.json({ error: 'devis not found' }, { status: 404 })

  const client = (devis as any).sq_clients as any
  if (!client) return NextResponse.json({ error: 'client not found' }, { status: 404 })

  const { data: briefing } = await (sb as any)
    .from('sq_briefings')
    .select('*')
    .eq('client_id', client.id)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  const items: { service: string; description: string; price_monthly: number; price_setup: number }[] = (devis as any).items ?? []

  // Build context
  const briefingContext = briefing?.filled_at ? `
Informations recueillies lors du briefing client :
- Ton / positionnement souhaité : ${briefing.brand_tone ?? 'non renseigné'}
- Objectifs principaux : ${briefing.goals ?? 'non renseigné'}
- Clientèle cible : ${briefing.target_customers ?? 'non renseigné'}
- Ce qu'ils ne veulent pas : ${briefing.dont_wants ?? 'non renseigné'}
- Notes complémentaires : ${briefing.extra_notes ?? 'non renseigné'}` : ''

  const prompt = `Tu es un consultant senior chez Studio Quartier, une agence de marketing digital parisienne spécialisée dans les commerces indépendants de quartier.

Tu dois rédiger le contenu personnalisé d'une proposition commerciale pour ce client. Ton style : professionnel, chaleureux, direct. Pas de langue de bois.

CLIENT
Nom : ${client.name}
Catégorie : ${client.category ?? 'commerce local'}
Zone : ${client.neighborhood ?? 'Paris'}
Note Google : ${client.google_rating ?? 'n/a'}/5 · ${client.google_reviews ?? 0} avis
Site web actuel : ${client.website ?? 'aucun'}
Présence Instagram : ${client.has_instagram ? 'oui' : 'non'}
Réponse aux avis Google : ${client.review_response_quality ?? 'non analysé'}
Analyse IA : ${client.ai_summary ?? 'non disponible'}
${briefingContext}

SERVICES SÉLECTIONNÉS DANS CETTE PROPOSITION
${items.map(i => `- ${i.service} : ${i.price_monthly > 0 ? `${i.price_monthly}€/mois` : ''}${i.price_setup > 0 ? ` + ${i.price_setup}€ de mise en place` : ''}`).join('\n')}

INSTRUCTIONS
Génère UNIQUEMENT un objet JSON valide, sans markdown :
{
  "intro_text": "Paragraphe d'introduction (4-6 phrases). Doit faire référence à leur situation réelle, montrer que tu les connais, et créer l'envie de démarrer. Pas de formule générique.",
  "items": [
    {
      "service": "nom exact du service (identique à ci-dessus)",
      "description": "2-3 phrases adaptées à CE client spécifique — pourquoi ce service est pertinent pour eux, ce qu'il va changer concrètement dans leur quotidien ou leur visibilité"
    }
  ]
}

Contraintes :
- intro_text : max 6 phrases, ton chaleureux mais professionnel
- descriptions : spécifiques à leur activité et leur situation, jamais génériques
- En français, pas de jargon marketing`

  try {
    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })
    const msg = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1200,
      temperature: 0.4,
      messages: [{ role: 'user', content: prompt }],
    })
    const raw = (msg.content[0] as any).text?.trim() ?? ''
    const jsonStr = raw.replace(/^```json?\s*/i, '').replace(/```\s*$/, '').trim()
    const parsed = JSON.parse(jsonStr)
    return NextResponse.json({ generated: parsed })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
