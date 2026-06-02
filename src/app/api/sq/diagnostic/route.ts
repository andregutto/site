import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { getSupabaseSQ } from '@/lib/supabase-sq'

export async function POST(req: NextRequest) {
  const { client_id } = await req.json()
  const sb = getSupabaseSQ()
  if (!sb) return NextResponse.json({ error: 'no db' }, { status: 503 })

  const { data: clientRaw } = await sb.from('sq_clients').select('*').eq('id', client_id).maybeSingle()
  const client = clientRaw as any
  if (!client) return NextResponse.json({ error: 'client not found' }, { status: 404 })

  // Fetch briefing if filled
  const { data: briefing } = await (sb as any)
    .from('sq_briefings')
    .select('*')
    .eq('client_id', client_id)
    .not('filled_at', 'is', null)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })

  const signals: string[] = []
  if (!client.website) signals.push('Aucun site web')
  else if (client.website_quality === 'BASIC') signals.push('Site web basique, peu professionnel')
  else if (client.website_quality === 'OUTDATED') signals.push('Site web obsolète')
  if (!client.has_instagram && client.instagram_url === null) signals.push('Absence de présence Instagram')
  if (client.review_response_quality === 'NONE') signals.push('Aucune réponse aux avis Google')
  if (client.review_response_quality === 'INCONSISTENT') signals.push('Réponses aux avis irrégulières ou génériques')
  if (client.google_reviews !== null && client.google_reviews < 30) signals.push(`Peu d'avis Google (${client.google_reviews})`)

  const servicesRaw: string[] = client.services_suggested ?? []

  const briefingBlock = briefing ? `
Informations recueillies directement auprès du client (briefing rempli) :
${briefing.brand_tone       ? `- Comment il décrit son établissement : ${briefing.brand_tone}` : ''}
${briefing.goals            ? `- Objectif principal : ${briefing.goals}` : ''}
${briefing.target_customers ? `- Clientèle cible : ${briefing.target_customers}` : ''}
${briefing.visual_refs      ? `- Références visuelles : ${briefing.visual_refs}` : ''}
${briefing.dont_wants       ? `- Ce qu'il ne veut pas : ${briefing.dont_wants}` : ''}
${briefing.color_prefs      ? `- Préférences visuelles : ${briefing.color_prefs}` : ''}
${briefing.extra_notes      ? `- Notes complémentaires : ${briefing.extra_notes}` : ''}
Utilise ces informations pour personnaliser le diagnostic — fais référence à leurs mots, leurs objectifs, leur vision.` : ''

  const prompt = `Tu es un consultant senior en marketing digital pour Studio Quartier, une agence parisienne spécialisée dans les commerces de quartier indépendants.

Tu dois rédiger un diagnostic digital professionnel et persuasif à présenter à ce commerce lors d'un premier rendez-vous. Ce document est DESTINÉ AU CLIENT — il ne doit pas contenir de scores, de jargon technique interne ni de formules comme "notre outil a détecté". Il doit être humain, bienveillant, et créer l'envie d'agir.

Établissement : ${client.name}
Catégorie : ${client.category ?? 'commerce local'}
Zone : ${client.neighborhood ?? 'Paris'}
Note Google : ${client.google_rating ?? 'non renseigné'}/5 · ${client.google_reviews ?? 0} avis

Observations internes (NE PAS citer directement) :
${signals.length > 0 ? signals.map(s => `- ${s}`).join('\n') : '- Présence digitale globalement correcte'}

Services qui pourraient lui correspondre : ${servicesRaw.join(', ') || 'site web, réseaux sociaux, référencement local'}
${briefingBlock}

Génère UNIQUEMENT un objet JSON sans markdown avec cette structure :
{
  "headline": "Une phrase d'accroche forte et spécifique à ce commerce (15-20 mots)",
  "intro": "2-3 phrases sur leur situation actuelle, bienveillantes et précises, comme si vous les connaissiez déjà",
  "opportunities": [
    { "title": "Titre court (4-6 mots)", "body": "2-3 phrases sur cette opportunité spécifique — ce que ça représente concrètement pour eux, pas pour nous", "impact": "Bénéfice client en une phrase courte" }
  ],
  "closing": "1-2 phrases de clôture qui donnent envie de démarrer ensemble, sans être commerciales"
}

Contraintes :
- Maximum 3 opportunités
- Chaque champ body : 2 phrases max (concis et percutant)
- Ton professionnel mais chaleureux, jamais agressif
- Centré sur les bénéfices CLIENT, pas sur nos services
- Vocabulaire accessible, pas de jargon digital
- En français
- JSON strict, pas de markdown`

  try {
    const msg = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1500,
      temperature: 0.3,
      messages: [{ role: 'user', content: prompt }],
    })
    const raw = (msg.content[0] as any).text?.trim() ?? ''
    const jsonStr = raw.replace(/^```json?\s*/i, '').replace(/```\s*$/, '').trim()
    const parsed = JSON.parse(jsonStr)
    return NextResponse.json({ diagnostic: parsed, client })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
