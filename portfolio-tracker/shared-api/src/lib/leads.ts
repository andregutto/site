import { supabaseAdmin } from './supabase.js'
import { cache } from './cache.js'

// Helpers do mecanismo de lead magnet (Recursos e viagens compartilhadas):
// extraídos de routes/resources.ts quando a frente B (gate de viagem,
// migration 074) passou a precisar dos mesmos — admin, atribuição de cadastro
// e captura de UTM são idênticos nos dois funis.

// Admins compartilhados com a comunidade (tabela community_admins, migration
// 067) — mesma chave de cache do community.ts pra invalidar junto.
export async function isAdmin(userId: string): Promise<boolean> {
  const ids = await cache.getOrFetch('community:admins', 60_000, async () => {
    const { data } = await supabaseAdmin.from('community_admins').select('user_id')
    return new Set<string>((data ?? []).map((r: { user_id: string }) => r.user_id))
  })
  return ids.has(userId)
}

export interface UtmFields {
  utm_source?: string
  utm_medium?: string
  utm_campaign?: string
  utm_content?: string
  referrer?: string
}

export function pickUtm(src: Record<string, unknown>): UtmFields {
  const clip = (v: unknown) => (typeof v === 'string' && v ? v.slice(0, 120) : undefined)
  return {
    utm_source:   clip(src.utm_source),
    utm_medium:   clip(src.utm_medium),
    utm_campaign: clip(src.utm_campaign),
    utm_content:  clip(src.utm_content),
    referrer:     typeof src.referrer === 'string' && src.referrer ? src.referrer.slice(0, 500) : undefined,
  }
}

// Fallback de atribuição: se o trigger não gravou (conta criada antes da
// migration, ou fluxo sem metadata), copia signup_source do user_metadata.
// Nunca lança.
export async function backfillSignupSource(userId: string): Promise<void> {
  try {
    const { data: profile } = await supabaseAdmin
      .from('profiles').select('signup_source').eq('id', userId).maybeSingle()
    if (profile && !profile.signup_source) {
      const { data: userData } = await supabaseAdmin.auth.admin.getUserById(userId)
      const metaSource = userData?.user?.user_metadata?.signup_source
      if (typeof metaSource === 'string' && metaSource) {
        await supabaseAdmin.from('profiles').update({ signup_source: metaSource }).eq('id', userId)
      }
    }
  } catch (err) {
    console.warn('[leads] signup_source backfill failed:', err)
  }
}

// Rótulo livre → utm_campaign ("Vídeo custo de vida" → 'video-custo-de-vida').
export function slugifyLabel(name: string): string {
  return name
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
}
