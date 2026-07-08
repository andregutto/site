import { Router, Request, Response } from 'express'
import { requireAuth, AuthRequest } from '../middleware/auth.js'
import { supabaseAdmin } from '../lib/supabase.js'
import { isAdmin, pickUtm, backfillSignupSource, slugifyLabel, type UtmFields } from '../lib/leads.js'
import { TIER_RANK } from './community.js'

// Recursos (lead magnets do canal): página pública /resources/:slug com
// preview, mas download/conteúdo só depois de cadastro/login — mesmo espírito
// dos links compartilhados (shared.ts), porém com auth obrigatória em vez de
// acesso público. Migration 068. Atribuição: profiles.signup_source +
// resource_events medem qual vídeo/recurso trouxe cada usuário.

const router = Router()

const SLUG_RE = /^[a-z0-9-]{3,80}$/

function uid(req: Parameters<typeof requireAuth>[0]): string {
  return (req as AuthRequest).userId
}

// isAdmin/pickUtm/backfillSignupSource/slugifyLabel viviam aqui e migraram
// pra ../lib/leads.ts quando o gate de viagens (voyage.ts) passou a usar os
// mesmos helpers.

export interface ResourceRow {
  id: number
  slug: string
  title: string
  description: string | null
  resource_type: 'file' | 'link' | 'content'
  file_path: string | null
  external_url: string | null
  content_md: string | null
  preview_image_url: string | null
  cover_image_position: string | null
  visibility: 'free' | 'plus' | 'beta'
  kit_tag: string | null
  is_published: boolean
  sort_order: number
  created_at: string
  updated_at: string
}

async function getUserTier(userId: string): Promise<string> {
  const { data } = await supabaseAdmin
    .from('community_members').select('tier').eq('user_id', userId).maybeSingle()
  return data?.tier ?? 'free'
}

// Nunca lança: perder um evento de métrica não pode derrubar o request.
async function recordEvent(
  resourceId: number,
  eventType: 'view' | 'signup' | 'unlock' | 'download',
  userId: string | null,
  utm: UtmFields,
): Promise<void> {
  try {
    await supabaseAdmin.from('resource_events').insert({
      resource_id: resourceId,
      user_id: userId,
      event_type: eventType,
      ...utm,
    })
  } catch (err) {
    console.warn('[resources] failed to record event:', err)
  }
}

// ── Público ──────────────────────────────────────────────────────────────────

// GET /api/resources/public/:slug — preview sem auth (título, descrição,
// tipo, visibilidade). Registra evento 'view' com os utm_* da query string.
router.get('/public/:slug', async (req: Request, res: Response) => {
  const { slug } = req.params
  if (!SLUG_RE.test(slug)) { res.status(404).json({ error: 'Recurso não encontrado' }); return }

  const { data: resource } = await supabaseAdmin
    .from('resources')
    .select('id, slug, title, description, resource_type, preview_image_url, cover_image_position, visibility')
    .eq('slug', slug).eq('is_published', true)
    .maybeSingle()

  if (!resource) { res.status(404).json({ error: 'Recurso não encontrado' }); return }

  await recordEvent(resource.id, 'view', null, pickUtm({ ...req.query, referrer: req.headers.referer }))

  const { id: _id, ...preview } = resource
  res.json(preview)
})

// ── Autenticado ──────────────────────────────────────────────────────────────

// GET /api/resources/:slug — detalhe de um recurso pra quem já está logado
// (página /resources/:slug dentro do app, com header/nav normais — diferente
// do preview público, que é só título/descrição pro gate de cadastro).
// O gate real é o login: pra quem tem direito (free, ou tier suficiente) o
// conteúdo já vem pronto na resposta, sem clique de "Liberar" — o evento
// 'unlock' é registrado server-side na primeira abertura, com os utm_* da
// query string (a atribuição por vídeo continua funcionando igual).
router.get('/:slug', requireAuth, async (req, res: Response) => {
  const userId = uid(req)
  const { slug } = req.params
  if (!SLUG_RE.test(slug)) { res.status(404).json({ error: 'Recurso não encontrado' }); return }

  const { data: resource } = await supabaseAdmin
    .from('resources').select('*')
    .eq('slug', slug).eq('is_published', true)
    .maybeSingle() as { data: ResourceRow | null }

  if (!resource) { res.status(404).json({ error: 'Recurso não encontrado' }); return }

  const preview = {
    slug: resource.slug,
    title: resource.title,
    description: resource.description,
    resource_type: resource.resource_type,
    preview_image_url: resource.preview_image_url,
    cover_image_position: resource.cover_image_position,
    visibility: resource.visibility,
  }

  const requiredRank = TIER_RANK[resource.visibility] ?? 0
  if (requiredRank > 0) {
    const userRank = TIER_RANK[await getUserTier(userId)] ?? 0
    if (userRank < requiredRank) {
      res.json({ ...preview, unlocked: false, required_tier: resource.visibility })
      return
    }
  }

  const { data: events } = await supabaseAdmin
    .from('resource_events')
    .select('id')
    .eq('user_id', userId).eq('event_type', 'unlock').eq('resource_id', resource.id)
    .limit(1)

  if (!(events ?? []).length) {
    await backfillSignupSource(userId)
    await recordEvent(resource.id, 'unlock', userId, pickUtm(req.query as Record<string, unknown>))
    if (resource.resource_type === 'file') await recordEvent(resource.id, 'download', userId, {})
  }

  let content: Record<string, string> | null = null
  if (resource.resource_type === 'file' && resource.file_path) {
    const fileName = resource.file_path.split('/').pop() ?? 'download'
    const { data: signed } = await supabaseAdmin.storage
      .from('resources')
      .createSignedUrl(resource.file_path, 3600, { download: fileName })
    if (signed) content = { type: 'file', download_url: signed.signedUrl, file_name: fileName }
  } else if (resource.resource_type === 'link' && resource.external_url) {
    content = { type: 'link', external_url: resource.external_url }
  } else if (resource.resource_type === 'content') {
    content = { type: 'content', content_md: resource.content_md ?? '' }
  }

  res.json({ ...preview, unlocked: true, content })
})

// GET /api/resources — listagem no app, com flag de já-liberado por usuário
router.get('/', requireAuth, async (req, res: Response) => {
  const userId = uid(req)

  const { data: resources, error } = await supabaseAdmin
    .from('resources')
    .select('id, slug, title, description, resource_type, preview_image_url, cover_image_position, visibility, created_at')
    .eq('is_published', true)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: false })

  if (error) { res.status(500).json({ error: error.message }); return }

  const ids = (resources ?? []).map(r => r.id)
  const unlockedIds = new Set<number>()
  if (ids.length) {
    const { data: events } = await supabaseAdmin
      .from('resource_events')
      .select('resource_id')
      .eq('user_id', userId).eq('event_type', 'unlock')
      .in('resource_id', ids)
    for (const e of events ?? []) unlockedIds.add(e.resource_id)
  }

  res.json({
    resources: (resources ?? []).map(({ id, ...r }) => ({ ...r, unlocked: unlockedIds.has(id) })),
    is_admin: await isAdmin(userId),
  })
})

// POST /api/resources/:slug/unlock — o gate: exige login, registra o evento e
// devolve o conteúdo (signed URL do storage, link externo ou markdown).
router.post('/:slug/unlock', requireAuth, async (req, res: Response) => {
  const userId = uid(req)
  const { slug } = req.params
  if (!SLUG_RE.test(slug)) { res.status(404).json({ error: 'Recurso não encontrado' }); return }

  const { data: resource } = await supabaseAdmin
    .from('resources').select('*')
    .eq('slug', slug).eq('is_published', true)
    .maybeSingle() as { data: ResourceRow | null }

  if (!resource) { res.status(404).json({ error: 'Recurso não encontrado' }); return }

  const requiredRank = TIER_RANK[resource.visibility] ?? 0
  if (requiredRank > 0) {
    const userTier = await getUserTier(userId)
    const userRank = TIER_RANK[userTier] ?? 0
    if (userRank < requiredRank) {
      res.status(403).json({
        error: 'Recurso disponível apenas para membros',
        required_tier: resource.visibility,
      })
      return
    }
  }

  await backfillSignupSource(userId)
  await recordEvent(resource.id, 'unlock', userId, pickUtm(req.body ?? {}))

  if (resource.resource_type === 'file') {
    if (!resource.file_path) { res.status(500).json({ error: 'Recurso sem arquivo configurado' }); return }
    const fileName = resource.file_path.split('/').pop() ?? 'download'
    const { data: signed, error } = await supabaseAdmin.storage
      .from('resources')
      .createSignedUrl(resource.file_path, 3600, { download: fileName })
    if (error || !signed) { res.status(500).json({ error: error?.message ?? 'Falha ao gerar link de download' }); return }
    await recordEvent(resource.id, 'download', userId, {})
    res.json({ type: 'file', download_url: signed.signedUrl })
    return
  }

  if (resource.resource_type === 'link') {
    if (!resource.external_url) { res.status(500).json({ error: 'Recurso sem link configurado' }); return }
    res.json({ type: 'link', external_url: resource.external_url })
    return
  }

  res.json({ type: 'content', content_md: resource.content_md ?? '' })
})

// ── Admin (community_admins) ─────────────────────────────────────────────────

// GET /api/resources/admin/list — todos os recursos + funil por recurso
// (views, unlocks, downloads, cadastros atribuídos via profiles.signup_source)
router.get('/admin/list', requireAuth, async (req, res: Response) => {
  if (!(await isAdmin(uid(req)))) { res.status(403).json({ error: 'admin only' }); return }

  const { data: resources, error } = await supabaseAdmin
    .from('resources').select('*')
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: false })
  if (error) { res.status(500).json({ error: error.message }); return }

  const { data: events } = await supabaseAdmin
    .from('resource_events').select('resource_id, event_type, utm_source, utm_campaign, utm_content')

  const counts = new Map<number, Record<string, number>>()
  // Origem do lead (qual vídeo) — só olha 'unlock', que é o evento que vale
  // como "gerou lead", não 'view' (curioso que só passou de raspão). Agrupa
  // por utm_campaign/utm_content (o identificador do vídeo específico), não
  // por utm_source (que tende a ser sempre 'youtube' pra todo mundo e não
  // diferencia nada sozinho).
  const bySource = new Map<number, Record<string, number>>()
  for (const e of events ?? []) {
    const c = counts.get(e.resource_id) ?? {}
    c[e.event_type] = (c[e.event_type] ?? 0) + 1
    counts.set(e.resource_id, c)

    if (e.event_type === 'unlock') {
      const video = e.utm_campaign || e.utm_content
      const source = video ? (e.utm_source ? `${e.utm_source}/${video}` : video) : (e.utm_source || 'sem_origem')
      const s = bySource.get(e.resource_id) ?? {}
      s[source] = (s[source] ?? 0) + 1
      bySource.set(e.resource_id, s)
    }
  }

  const { data: links } = await supabaseAdmin
    .from('resource_links').select('id, resource_id, label, utm_campaign, created_at')
    .order('created_at', { ascending: false })
  const linksByResource = new Map<number, { id: number; label: string; utm_campaign: string; created_at: string }[]>()
  for (const lk of links ?? []) {
    const arr = linksByResource.get(lk.resource_id) ?? []
    arr.push(lk)
    linksByResource.set(lk.resource_id, arr)
  }

  const result = []
  for (const r of (resources ?? []) as ResourceRow[]) {
    const { count: signups } = await supabaseAdmin
      .from('profiles').select('id', { count: 'exact', head: true })
      .eq('signup_source', `resource:${r.slug}`)
    const c = counts.get(r.id) ?? {}
    result.push({
      ...r,
      stats: {
        views:     c.view ?? 0,
        unlocks:   c.unlock ?? 0,
        downloads: c.download ?? 0,
        signups:   signups ?? 0,
        by_source: bySource.get(r.id) ?? {},
      },
      links: linksByResource.get(r.id) ?? [],
    })
  }
  res.json(result)
})

// POST /api/resources/admin/:slug/links — gera um link de divulgação (UTM
// pronto pra colar na descrição de um vídeo) com um rótulo de referência.
router.post('/admin/:slug/links', requireAuth, async (req, res: Response) => {
  if (!(await isAdmin(uid(req)))) { res.status(403).json({ error: 'admin only' }); return }
  const { slug } = req.params
  const label = typeof req.body?.label === 'string' ? req.body.label.trim() : ''
  if (!label) { res.status(400).json({ error: 'Rótulo obrigatório' }); return }

  const { data: resource } = await supabaseAdmin.from('resources').select('id').eq('slug', slug).maybeSingle()
  if (!resource) { res.status(404).json({ error: 'Recurso não encontrado' }); return }

  let campaign = slugifyLabel(label) || 'video'
  // Garante utm_campaign único dentro do recurso — duas campanhas iguais se
  // misturariam nas estatísticas de origem.
  const { count } = await supabaseAdmin
    .from('resource_links').select('id', { count: 'exact', head: true })
    .eq('resource_id', resource.id).eq('utm_campaign', campaign)
  if (count && count > 0) campaign = `${campaign}-${count + 1}`

  const { data: link, error } = await supabaseAdmin
    .from('resource_links')
    .insert({ resource_id: resource.id, label, utm_campaign: campaign })
    .select('id, label, utm_campaign, created_at')
    .single()
  if (error) { res.status(500).json({ error: error.message }); return }
  res.json(link)
})

// DELETE /api/resources/admin/:slug/links/:id
router.delete('/admin/:slug/links/:id', requireAuth, async (req, res: Response) => {
  if (!(await isAdmin(uid(req)))) { res.status(403).json({ error: 'admin only' }); return }
  const { slug, id } = req.params
  const { data: resource } = await supabaseAdmin.from('resources').select('id').eq('slug', slug).maybeSingle()
  if (!resource) { res.status(404).json({ error: 'Recurso não encontrado' }); return }
  await supabaseAdmin.from('resource_links').delete().eq('id', id).eq('resource_id', resource.id)
  res.json({ ok: true })
})

// POST /api/resources/admin — criar recurso
router.post('/admin', requireAuth, async (req, res: Response) => {
  if (!(await isAdmin(uid(req)))) { res.status(403).json({ error: 'admin only' }); return }

  const { slug, title, description, resource_type, file_path, external_url, content_md,
          preview_image_url, cover_image_position, visibility, kit_tag, is_published, sort_order } = req.body ?? {}

  if (!slug || !SLUG_RE.test(slug)) { res.status(400).json({ error: 'Slug inválido (a-z, 0-9 e hífen, 3 a 80 caracteres)' }); return }
  if (!title) { res.status(400).json({ error: 'Título obrigatório' }); return }
  if (!['file', 'link', 'content'].includes(resource_type)) { res.status(400).json({ error: 'Tipo inválido' }); return }

  const { data, error } = await supabaseAdmin.from('resources').insert({
    slug, title,
    description:          description ?? null,
    resource_type,
    file_path:            file_path ?? null,
    external_url:         external_url ?? null,
    content_md:           content_md ?? null,
    preview_image_url:    preview_image_url ?? null,
    cover_image_position: cover_image_position ?? '50% 50%',
    visibility:           ['plus', 'beta'].includes(visibility) ? visibility : 'free',
    kit_tag:              kit_tag ?? null,
    is_published:         !!is_published,
    sort_order:           Number(sort_order) || 0,
  }).select().single()

  if (error) { res.status(500).json({ error: error.message }); return }
  res.status(201).json(data)
})

// PATCH /api/resources/admin/:id — atualizar recurso
router.patch('/admin/:id', requireAuth, async (req, res: Response) => {
  if (!(await isAdmin(uid(req)))) { res.status(403).json({ error: 'admin only' }); return }

  const id = Number(req.params.id)
  if (!Number.isInteger(id)) { res.status(400).json({ error: 'id inválido' }); return }

  const allowed = ['slug', 'title', 'description', 'resource_type', 'file_path', 'external_url',
                   'content_md', 'preview_image_url', 'cover_image_position', 'visibility', 'kit_tag', 'is_published', 'sort_order'] as const
  const patch: Record<string, unknown> = {}
  for (const key of allowed) if (key in (req.body ?? {})) patch[key] = req.body[key]
  if (typeof patch.slug === 'string' && !SLUG_RE.test(patch.slug)) { res.status(400).json({ error: 'Slug inválido' }); return }
  if ('visibility' in patch && !['free', 'plus', 'beta'].includes(patch.visibility as string)) { res.status(400).json({ error: 'Visibilidade inválida' }); return }
  if (!Object.keys(patch).length) { res.status(400).json({ error: 'Nada para atualizar' }); return }
  patch.updated_at = new Date().toISOString()

  const { data, error } = await supabaseAdmin.from('resources').update(patch).eq('id', id).select().single()
  if (error) { res.status(500).json({ error: error.message }); return }
  res.json(data)
})

// DELETE /api/resources/admin/:id
router.delete('/admin/:id', requireAuth, async (req, res: Response) => {
  if (!(await isAdmin(uid(req)))) { res.status(403).json({ error: 'admin only' }); return }

  const id = Number(req.params.id)
  if (!Number.isInteger(id)) { res.status(400).json({ error: 'id inválido' }); return }

  const { error } = await supabaseAdmin.from('resources').delete().eq('id', id)
  if (error) { res.status(500).json({ error: error.message }); return }
  res.json({ ok: true })
})

// POST /api/resources/admin/upload-url — signed upload URL pro bucket privado
// 'resources'; o admin faz PUT do arquivo direto no storage (sem passar pelo
// limite de body da API) e depois grava o path retornado em file_path.
router.post('/admin/upload-url', requireAuth, async (req, res: Response) => {
  if (!(await isAdmin(uid(req)))) { res.status(403).json({ error: 'admin only' }); return }

  const { file_name, slug } = (req.body ?? {}) as { file_name?: string; slug?: string }
  if (!file_name) { res.status(400).json({ error: 'file_name obrigatório' }); return }

  const safeName = file_name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 120)
  const folder = slug && SLUG_RE.test(slug) ? slug : 'misc'
  const path = `${folder}/${Date.now()}-${safeName}`

  const { data, error } = await supabaseAdmin.storage
    .from('resources')
    .createSignedUploadUrl(path)
  if (error || !data) { res.status(500).json({ error: error?.message ?? 'Falha ao criar upload URL' }); return }

  res.json({ path, token: data.token, signed_url: data.signedUrl })
})

export default router
