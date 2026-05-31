import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { getSupabaseSQ } from '@/lib/supabase-sq'

const CACHE_DAYS = 30

interface AnalyzeBody {
  place_id:     string
  name:         string
  address:      string
  lat:          number
  lng:          number
  google_types: string[]
  rating:       number | null
  review_count: number
  website:      string | null
  phone:        string | null
  maps_url:     string
  run_id?:      string
}

// ── Website fetch ─────────────────────────────────────────────────────────────

async function fetchWebsiteText(url: string): Promise<string | null> {
  try {
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), 3000)
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; StudioQuartier-bot/1.0)' },
    })
    clearTimeout(timer)
    const html = await res.text()
    const text = html
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
    return text.slice(0, 4000)
  } catch {
    return null
  }
}

function extractInstagram(html: string): string | null {
  const m = html.match(/instagram\.com\/([a-zA-Z0-9._]{2,30})/i)
  if (!m) return null
  const handle = m[1]
  if (['p', 'explore', 'reel', 'reels', 'stories', 'tv', 'accounts'].includes(handle)) return null
  return `https://www.instagram.com/${handle}`
}

// ── Route ─────────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const body: AnalyzeBody = await req.json()
  const { place_id, name, address, lat, lng, google_types, rating, review_count, website, phone, maps_url, run_id } = body

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: 'ANTHROPIC_API_KEY non configurée — ajoutez-la dans .env.local' }, { status: 503 })
  }

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

  // ── 1. Cache check ────────────────────────────────────────────────────────
  try {
    const sb = getSupabaseSQ()
    if (sb) {
      const cutoff = new Date(Date.now() - CACHE_DAYS * 86400_000).toISOString()
      const { data } = await sb
        .from('sq_places')
        .select('*')
        .eq('place_id', place_id)
        .gte('analyzed_at', cutoff)
        .maybeSingle()
      if (data) {
        const cached = data as Record<string, unknown>
        return NextResponse.json({ ...cached, from_cache: true })
      }
    }
  } catch { /* continue without cache */ }

  // ── 2. Haiku pre-filter (chain / large brand detection) ──────────────────
  let classification: 'CHAIN' | 'LARGE' | 'PROSPECT' = 'PROSPECT'
  let class_reason = ''
  try {
    const classMsg = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 120,
      temperature: 0,
      messages: [{
        role: 'user',
        content: `Is this a chain, franchise, or large national/international brand that already has a dedicated marketing agency?

Name: ${name}
Address: ${address}
Google types: ${google_types.join(', ')}

Classify:
- CHAIN: national/international chain or franchise (Starbucks, McDonald's, MUJI, COS, MAJE, H&M, Carhartt, Maisons du Monde, Paul bakeries, Brioche Dorée, Ladurée, Nespresso, Sephora, Fnac, etc.)
- LARGE: regional brand with 10+ locations across multiple cities
- PROSPECT: independent local business that could benefit from a startup digital marketing agency

Reply with JSON only, no markdown:
{"classification":"CHAIN","reason":"one line"}`
      }]
    })
    const raw = (classMsg.content[0] as any).text?.trim() ?? ''
    const jsonStr = raw.replace(/^```json?\s*/i, '').replace(/```\s*$/, '').trim()
    const parsed = JSON.parse(jsonStr)
    classification = parsed.classification ?? 'PROSPECT'
    class_reason   = parsed.reason ?? ''
  } catch (e) {
    // Haiku parse error — be permissive, treat as PROSPECT
    class_reason = 'classification parse error'
  }

  const baseRecord = {
    place_id, name, address, lat, lng, rating, review_count,
    website, phone, maps_url,
    google_types,
    classification,
    class_reason,
    analyzed_at: new Date().toISOString(),
  }

  // ── 3. Save and return if skipped ────────────────────────────────────────
  if (classification !== 'PROSPECT') {
    try {
      const sb = getSupabaseSQ()
      if (sb) {
        await sb.from('sq_places').upsert(baseRecord as any, { onConflict: 'place_id' })
        if (run_id) await sb.from('sq_run_places').upsert({ run_id, place_id } as any, { onConflict: 'run_id,place_id' })
      }
    } catch { /* skip */ }
    return NextResponse.json({ ...baseRecord, from_cache: false })
  }

  // ── 4. Full Sonnet analysis (PROSPECT only) ───────────────────────────────
  let websiteText: string | null = null
  let instagramUrl: string | null = null
  if (website) {
    const rawHtml = await fetchWebsiteText(website).catch(() => null)
    if (rawHtml) {
      websiteText  = rawHtml
      instagramUrl = extractInstagram(rawHtml)
    }
  }

  let score = 50
  let score_breakdown = { website: 50, social: 50, local_seo: 50, engagement: 50 }
  let services: string[] = []
  let summary = ''
  let has_instagram = !!instagramUrl
  let website_quality: string = website ? 'BASIC' : 'NONE'

  try {
    const analysisMsg = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 600,
      temperature: 0,
      messages: [{
        role: 'user',
        content: `Tu travailles pour Studio Quartier, une nouvelle agence de marketing digital à Paris qui cible les commerces de quartier indépendants (restaurants, boulangeries, cafés, boutiques locales).

Analyse cette opportunité commerciale et retourne UNIQUEMENT un objet JSON, sans markdown ni texte autour.

Établissement: ${name}
Adresse: ${address}
Types Google: ${google_types.join(', ')}
Note Google: ${rating ?? 'n/a'}/5 (${review_count} avis)
Téléphone: ${phone || 'non renseigné'}
Site web: ${website || 'AUCUN'}
${instagramUrl ? `Instagram détecté: ${instagramUrl}` : 'Instagram: non détecté sur le site'}
${websiteText ? `\nContenu site (extrait):\n${websiteText.slice(0, 2000)}` : ''}

Règle de score: 100 = présence digitale quasi inexistante + fort potentiel pour nos services. 0 = déjà très bien géré digitalement.

{"score":0-100,"score_breakdown":{"website":0-100,"social":0-100,"local_seo":0-100,"engagement":0-100},"services":["service1","service2"],"summary":"2-3 phrases en français spécifiques à ce commerce","has_instagram":boolean,"instagram_url":"url ou null","website_quality":"NONE"|"BASIC"|"OUTDATED"|"DECENT"|"GOOD"}`
      }]
    })
    const raw = (analysisMsg.content[0] as any).text?.trim() ?? ''
    const jsonStr = raw.replace(/^```json?\s*/i, '').replace(/```\s*$/, '').trim()
    const parsed = JSON.parse(jsonStr)
    score            = Math.min(100, Math.max(0, Number(parsed.score) || 50))
    score_breakdown  = parsed.score_breakdown ?? score_breakdown
    services         = Array.isArray(parsed.services) ? parsed.services.slice(0, 4) : []
    summary          = parsed.summary ?? ''
    has_instagram    = parsed.has_instagram ?? has_instagram
    instagramUrl     = parsed.instagram_url ?? instagramUrl
    website_quality  = parsed.website_quality ?? website_quality
  } catch { /* keep defaults */ }

  const fullRecord = {
    ...baseRecord,
    score,
    score_breakdown,
    services,
    summary,
    has_instagram,
    instagram_url: instagramUrl,
    website_quality,
  }

  // ── 5. Save to Supabase ───────────────────────────────────────────────────
  try {
    const sb = getSupabaseSQ()
    if (sb) {
      await sb.from('sq_places').upsert(fullRecord as any, { onConflict: 'place_id' })
      if (run_id) await sb.from('sq_run_places').upsert({ run_id, place_id } as any, { onConflict: 'run_id,place_id' })
    }
  } catch { /* skip */ }

  return NextResponse.json({ ...fullRecord, from_cache: false })
}
