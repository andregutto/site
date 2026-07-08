import { Router, Response } from 'express'
import { requireAuth, AuthRequest } from '../middleware/auth.js'
import { supabaseAdmin } from '../lib/supabase.js'
import { cache } from '../lib/cache.js'
import { userDisplay, getFriendshipStatuses, type FriendshipStatus } from './people.js'

const router = Router()
router.use(requireAuth)

function uid(req: Parameters<typeof requireAuth>[0]): string {
  return (req as AuthRequest).userId
}

// Admins vivem na tabela community_admins (migration 067). Cache curto para
// não bater no banco a cada request; invalidado ao promover/rebaixar.
const ADMINS_CACHE_KEY = 'community:admins'
async function getAdminIds(): Promise<Set<string>> {
  return cache.getOrFetch(ADMINS_CACHE_KEY, 60_000, async () => {
    const { data } = await supabaseAdmin.from('community_admins').select('user_id')
    return new Set<string>((data ?? []).map((r: any) => r.user_id))
  })
}
async function isAdmin(userId: string): Promise<boolean> {
  return (await getAdminIds()).has(userId)
}

// Hierarquia de tiers do Arvo: beta ⊃ plus ⊃ free (campo único por usuário,
// não dois eixos separados). beta vê tudo, inclusive não lançado; plus vê
// tudo já lançado; free vê o padrão. Fonte única — reaproveitado por
// messaging.ts (gate premium) e resources.ts (gate por recurso).
export const TIER_RANK: Record<string, number> = { free: 0, plus: 1, beta: 2 }

// Garante que o usuário tem uma linha em community_members (tier 'free' por
// padrão) — chamado no primeiro acesso a qualquer endpoint da comunidade.
async function ensureMember(userId: string): Promise<void> {
  await ensureMemberTier(userId)
}

// Mesma garantia acima, mas retornando o tier — usado pelo gate premium de
// messaging.ts (MESSAGING_TIER_REQUIRED) sem duplicar a lógica de upsert.
export async function ensureMemberTier(userId: string): Promise<'free' | 'plus' | 'beta'> {
  const { data } = await supabaseAdmin.from('community_members').select('tier').eq('user_id', userId).maybeSingle()
  if (data) return data.tier as 'free' | 'plus' | 'beta'
  await supabaseAdmin.from('community_members').insert({ user_id: userId, tier: 'free' })
  return 'free'
}

export interface CommunityCategory {
  id: number
  slug: string
  name_key: string
  name: string | null
  icon: string | null
  icon_key: string | null
  sort_order: number
  topic_count: number
  archived: boolean
}

export interface CommunityAuthor {
  id: string
  name: string
  username?: string
  avatar_url?: string
  is_admin?: boolean
}

export interface CommunityTopicSummary {
  id: number
  category_id: number
  title: string
  pinned: boolean
  locked: boolean
  reply_count: number
  last_post_at: string
  created_at: string
  author: CommunityAuthor
}

export interface CommunityLinkedTrip {
  id: number
  title: string
  destination: string | null
  cover_image_url: string | null
  share_token: string
}

export interface CommunityPost {
  id: number
  topic_id: number
  body: string
  edited_at: string | null
  created_at: string
  author: CommunityAuthor
  like_count: number
  liked_by_me: boolean
  is_first_post: boolean
}

export interface CommunityTopicDetail {
  id: number
  category_id: number
  title: string
  pinned: boolean
  locked: boolean
  created_at: string
  author: CommunityAuthor
  is_own: boolean
  is_admin_viewer: boolean
  linked_trip: CommunityLinkedTrip | null
  posts: CommunityPost[]
}

function toAuthor(userId: string, display: { name?: string; email: string; avatar_url?: string; username?: string }, adminIds?: Set<string>): CommunityAuthor {
  return { id: userId, name: display.name ?? display.email, username: display.username, avatar_url: display.avatar_url, is_admin: adminIds?.has(userId) || undefined }
}

// ── GET /api/community/categories ───────────────────────────────────────────
// Usado pelo header/AppLayout pra decidir se mostra o item "Administração" no
// menu do avatar — mesma tabela community_admins que já governa o admin de
// Comunidade e de Recursos, então um flag só cobre os dois.
router.get('/is-admin', async (req: any, res: any) => {
  res.json({ is_admin: await isAdmin(uid(req)) })
})

router.get('/categories', async (req: any, res: any) => {
  const userId = uid(req)
  try {
    await ensureMember(userId)

    const admin = await isAdmin(userId)
    const includeArchived = admin && req.query.all === '1'
    let query = supabaseAdmin
      .from('community_categories')
      .select('*')
      .order('sort_order', { ascending: true })
    if (!includeArchived) query = query.is('archived_at', null)
    const { data: categories, error } = await query
    if (error) { res.status(500).json({ error: error.message }); return }

    const { data: topics } = await supabaseAdmin
      .from('community_topics')
      .select('category_id')
      .is('deleted_at', null)

    const counts: Record<number, number> = {}
    for (const t of topics ?? []) counts[t.category_id] = (counts[t.category_id] ?? 0) + 1

    const result: CommunityCategory[] = (categories ?? []).map((c: any) => ({
      id: c.id,
      slug: c.slug,
      name_key: c.name_key,
      name: c.name ?? null,
      icon: c.icon,
      icon_key: c.icon_key ?? null,
      sort_order: c.sort_order,
      topic_count: counts[c.id] ?? 0,
      archived: !!c.archived_at,
    }))

    res.json({ categories: result, is_admin: admin })
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

// ── GET /api/community/mine ───────────────────────────────────────────────────
// Tópicos criados pelo próprio usuário, em todas as categorias.
router.get('/mine', async (req: any, res: any) => {
  const userId = uid(req)
  try {
    await ensureMember(userId)

    const { data: topics, error } = await supabaseAdmin
      .from('community_topics')
      .select('*')
      .eq('user_id', userId)
      .is('deleted_at', null)
      .order('last_post_at', { ascending: false })
    if (error) { res.status(500).json({ error: error.message }); return }

    const categoryIds = [...new Set((topics ?? []).map((t: any) => t.category_id))]
    const { data: categories } = categoryIds.length
      ? await supabaseAdmin.from('community_categories').select('id, slug').in('id', categoryIds)
      : { data: [] as any[] }
    const categorySlugById = new Map((categories ?? []).map((c: any) => [c.id, c.slug]))

    const display = await userDisplay(userId)

    const result = (topics ?? []).map((t: any) => ({
      id: t.id,
      category_id: t.category_id,
      category_slug: categorySlugById.get(t.category_id) ?? '',
      title: t.title,
      pinned: t.pinned,
      locked: t.locked,
      reply_count: t.reply_count,
      last_post_at: t.last_post_at,
      created_at: t.created_at,
      author: toAuthor(userId, display),
    }))

    res.json({ topics: result })
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

// ── GET /api/community/search?q= ─────────────────────────────────────────────
// Busca por título E pelo corpo dos posts, em todas as categorias (não
// paginada — volume baixo na V1). Relevância: tópicos com match no título
// vêm primeiro (mais recente → mais antigo), depois os que só têm match no
// corpo de algum post (mesmo critério de ordenação), sem repetir tópicos.
router.get('/search', async (req: any, res: any) => {
  const userId = uid(req)
  const q = String(req.query.q ?? '').trim()
  if (!q) { res.json({ topics: [] }); return }

  try {
    await ensureMember(userId)

    const { data: titleMatches, error: titleErr } = await supabaseAdmin
      .from('community_topics')
      .select('*')
      .is('deleted_at', null)
      .ilike('title', `%${q}%`)
      .order('last_post_at', { ascending: false })
      .limit(30)
    if (titleErr) { res.status(500).json({ error: titleErr.message }); return }

    const titleMatchIds = new Set((titleMatches ?? []).map((t: any) => t.id))

    const { data: bodyPosts, error: bodyErr } = await supabaseAdmin
      .from('community_posts')
      .select('topic_id')
      .is('deleted_at', null)
      .ilike('body', `%${q}%`)
      .limit(100)
    if (bodyErr) { res.status(500).json({ error: bodyErr.message }); return }

    const bodyTopicIds = [...new Set((bodyPosts ?? []).map((p: any) => p.topic_id))]
      .filter((id) => !titleMatchIds.has(id))

    const { data: bodyMatchTopics } = bodyTopicIds.length
      ? await supabaseAdmin.from('community_topics').select('*').is('deleted_at', null).in('id', bodyTopicIds)
      : { data: [] as any[] }
    const bodyMatches = (bodyMatchTopics ?? []).sort(
      (a: any, b: any) => new Date(b.last_post_at).getTime() - new Date(a.last_post_at).getTime()
    )

    const topics = [...(titleMatches ?? []), ...bodyMatches].slice(0, 30)

    const categoryIds = [...new Set(topics.map((t: any) => t.category_id))]
    const { data: categories } = categoryIds.length
      ? await supabaseAdmin.from('community_categories').select('id, slug').in('id', categoryIds)
      : { data: [] as any[] }
    const categorySlugById = new Map((categories ?? []).map((c: any) => [c.id, c.slug]))

    const authorIds = [...new Set(topics.map((t: any) => t.user_id))]
    const displays = await Promise.all(authorIds.map(async (id) => [id, await userDisplay(id)] as const))
    const displayMap = new Map(displays)

    const result = topics.map((t: any) => ({
      id: t.id,
      category_id: t.category_id,
      category_slug: categorySlugById.get(t.category_id) ?? '',
      title: t.title,
      pinned: t.pinned,
      locked: t.locked,
      reply_count: t.reply_count,
      last_post_at: t.last_post_at,
      created_at: t.created_at,
      author: toAuthor(t.user_id, displayMap.get(t.user_id)!),
      matched_in_body: !titleMatchIds.has(t.id),
    }))

    res.json({ topics: result })
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

// ── GET /api/community/categories/:slug/topics ──────────────────────────────
router.get('/categories/:slug/topics', async (req: any, res: any) => {
  const userId = uid(req)
  const { slug } = req.params
  const before = req.query.before as string | undefined
  const PAGE_SIZE = 30

  try {
    await ensureMember(userId)

    const { data: category } = await supabaseAdmin.from('community_categories').select('*').eq('slug', slug).maybeSingle()
    if (!category) { res.status(404).json({ error: 'category not found' }); return }

    let query = supabaseAdmin
      .from('community_topics')
      .select('*')
      .eq('category_id', category.id)
      .is('deleted_at', null)
      .order('pinned', { ascending: false })
      .order('last_post_at', { ascending: false })
      .limit(PAGE_SIZE)

    if (before) query = query.lt('last_post_at', before)

    const { data: topics, error } = await query
    if (error) { res.status(500).json({ error: error.message }); return }

    const authorIds = [...new Set((topics ?? []).map((t: any) => t.user_id))]
    const displays = await Promise.all(authorIds.map(async (id) => [id, await userDisplay(id)] as const))
    const displayMap = new Map(displays)

    const result: CommunityTopicSummary[] = (topics ?? []).map((t: any) => ({
      id: t.id,
      category_id: t.category_id,
      title: t.title,
      pinned: t.pinned,
      locked: t.locked,
      reply_count: t.reply_count,
      last_post_at: t.last_post_at,
      created_at: t.created_at,
      author: toAuthor(t.user_id, displayMap.get(t.user_id)!),
    }))

    res.json({ category, topics: result })
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

// ── POST /api/community/topics ───────────────────────────────────────────────
router.post('/topics', async (req: any, res: any) => {
  const userId = uid(req)
  const { category_slug, title, body, linked_trip_id } = req.body as {
    category_slug: string; title: string; body: string; linked_trip_id?: number
  }

  if (!category_slug?.trim() || !title?.trim() || !body?.trim()) {
    res.status(400).json({ error: 'category_slug, title and body are required' }); return
  }

  try {
    await ensureMember(userId)

    const { data: category } = await supabaseAdmin.from('community_categories').select('*').eq('slug', category_slug).maybeSingle()
    if (!category) { res.status(404).json({ error: 'category not found' }); return }

    let validLinkedTripId: number | null = null
    if (linked_trip_id) {
      const { data: trip } = await supabaseAdmin
        .from('voyage_trips')
        .select('id, user_id, share_token')
        .eq('id', linked_trip_id)
        .maybeSingle()
      if (!trip || trip.user_id !== userId || !trip.share_token) {
        res.status(400).json({ error: 'linked_trip_id must reference a public trip you own' }); return
      }
      validLinkedTripId = trip.id
    }

    const now = new Date().toISOString()
    const { data: topic, error: topicError } = await supabaseAdmin
      .from('community_topics')
      .insert({
        category_id: category.id,
        user_id: userId,
        title: title.trim(),
        linked_trip_id: validLinkedTripId,
        last_post_at: now,
      })
      .select('*')
      .single()
    if (topicError || !topic) { res.status(500).json({ error: topicError?.message }); return }

    const { error: postError } = await supabaseAdmin
      .from('community_posts')
      .insert({ topic_id: topic.id, user_id: userId, body: body.trim() })
    if (postError) { res.status(500).json({ error: postError.message }); return }

    res.status(201).json({ topic })
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

// ── GET /api/community/topics/:id ────────────────────────────────────────────
router.get('/topics/:id', async (req: any, res: any) => {
  const userId = uid(req)
  const topicId = Number(req.params.id)
  if (!Number.isFinite(topicId)) { res.status(400).json({ error: 'invalid topic id' }); return }

  try {
    await ensureMember(userId)

    const { data: topic } = await supabaseAdmin.from('community_topics').select('*').eq('id', topicId).is('deleted_at', null).maybeSingle()
    if (!topic) { res.status(404).json({ error: 'topic not found' }); return }

    let linkedTrip: CommunityLinkedTrip | null = null
    if (topic.linked_trip_id) {
      const { data: trip } = await supabaseAdmin
        .from('voyage_trips')
        .select('id, title, destination, cover_image_url, share_token')
        .eq('id', topic.linked_trip_id)
        .maybeSingle()
      if (trip?.share_token) {
        linkedTrip = {
          id: trip.id, title: trip.title, destination: trip.destination,
          cover_image_url: trip.cover_image_url, share_token: trip.share_token,
        }
      }
    }

    const { data: posts, error: postsError } = await supabaseAdmin
      .from('community_posts')
      .select('*')
      .eq('topic_id', topicId)
      .is('deleted_at', null)
      .order('created_at', { ascending: true })
    if (postsError) { res.status(500).json({ error: postsError.message }); return }

    const postIds = (posts ?? []).map((p: any) => p.id)
    const { data: likeRows } = postIds.length
      ? await supabaseAdmin.from('community_post_likes').select('post_id, user_id').in('post_id', postIds)
      : { data: [] as any[] }

    const likeCounts: Record<number, number> = {}
    const likedByMe = new Set<number>()
    for (const l of likeRows ?? []) {
      likeCounts[l.post_id] = (likeCounts[l.post_id] ?? 0) + 1
      if (l.user_id === userId) likedByMe.add(l.post_id)
    }

    const authorIds = [...new Set([topic.user_id, ...(posts ?? []).map((p: any) => p.user_id)])]
    const displays = await Promise.all(authorIds.map(async (id) => [id, await userDisplay(id)] as const))
    const displayMap = new Map(displays)
    const adminIds = await getAdminIds()

    const firstPostId = posts && posts.length > 0 ? posts[0].id : null

    const resultPosts: CommunityPost[] = (posts ?? []).map((p: any) => ({
      id: p.id,
      topic_id: p.topic_id,
      body: p.body,
      edited_at: p.edited_at,
      created_at: p.created_at,
      author: toAuthor(p.user_id, displayMap.get(p.user_id)!, adminIds),
      like_count: likeCounts[p.id] ?? 0,
      liked_by_me: likedByMe.has(p.id),
      is_first_post: p.id === firstPostId,
    }))

    const result: CommunityTopicDetail = {
      id: topic.id,
      category_id: topic.category_id,
      title: topic.title,
      pinned: topic.pinned,
      locked: topic.locked,
      created_at: topic.created_at,
      author: toAuthor(topic.user_id, displayMap.get(topic.user_id)!, adminIds),
      is_own: topic.user_id === userId,
      is_admin_viewer: await isAdmin(userId),
      linked_trip: linkedTrip,
      posts: resultPosts,
    }

    res.json({ topic: result })
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

// ── POST /api/community/topics/:id/posts ─────────────────────────────────────
router.post('/topics/:id/posts', async (req: any, res: any) => {
  const userId = uid(req)
  const topicId = Number(req.params.id)
  const { body } = req.body as { body: string }
  if (!Number.isFinite(topicId)) { res.status(400).json({ error: 'invalid topic id' }); return }
  if (!body?.trim()) { res.status(400).json({ error: 'body required' }); return }

  try {
    const { data: topic } = await supabaseAdmin.from('community_topics').select('*').eq('id', topicId).is('deleted_at', null).maybeSingle()
    if (!topic) { res.status(404).json({ error: 'topic not found' }); return }
    if (topic.locked && !(await isAdmin(userId))) { res.status(403).json({ error: 'topic is locked' }); return }

    const now = new Date().toISOString()
    const { data: post, error } = await supabaseAdmin
      .from('community_posts')
      .insert({ topic_id: topicId, user_id: userId, body: body.trim() })
      .select('*')
      .single()
    if (error || !post) { res.status(500).json({ error: error?.message }); return }

    await supabaseAdmin
      .from('community_topics')
      .update({ reply_count: topic.reply_count + 1, last_post_at: now })
      .eq('id', topicId)

    res.status(201).json({ post })
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

// ── PATCH /api/community/posts/:id ───────────────────────────────────────────
router.patch('/posts/:id', async (req: any, res: any) => {
  const userId = uid(req)
  const postId = Number(req.params.id)
  const { body } = req.body as { body: string }
  if (!Number.isFinite(postId)) { res.status(400).json({ error: 'invalid post id' }); return }
  if (!body?.trim()) { res.status(400).json({ error: 'body required' }); return }

  try {
    const { data: post } = await supabaseAdmin.from('community_posts').select('*').eq('id', postId).is('deleted_at', null).maybeSingle()
    if (!post) { res.status(404).json({ error: 'post not found' }); return }
    // Editing is owner-only: admins moderate by deleting, never by rewriting
    // someone else's words.
    if (post.user_id !== userId) { res.status(403).json({ error: 'forbidden' }); return }

    const { data: updated, error } = await supabaseAdmin
      .from('community_posts')
      .update({ body: body.trim(), edited_at: new Date().toISOString() })
      .eq('id', postId)
      .select('*')
      .single()
    if (error || !updated) { res.status(500).json({ error: error?.message }); return }

    res.json({ post: updated })
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

// ── DELETE /api/community/posts/:id ───────────────────────────────────────────
router.delete('/posts/:id', async (req: any, res: any) => {
  const userId = uid(req)
  const postId = Number(req.params.id)
  if (!Number.isFinite(postId)) { res.status(400).json({ error: 'invalid post id' }); return }

  try {
    const { data: post } = await supabaseAdmin.from('community_posts').select('*').eq('id', postId).is('deleted_at', null).maybeSingle()
    if (!post) { res.status(404).json({ error: 'post not found' }); return }
    if (post.user_id !== userId && !(await isAdmin(userId))) { res.status(403).json({ error: 'forbidden' }); return }

    const now = new Date().toISOString()
    await supabaseAdmin.from('community_posts').update({ deleted_at: now }).eq('id', postId)

    // Se for o primeiro post do tópico, apaga o tópico inteiro (soft-delete em
    // cascata de todos os posts) para manter a thread coerente.
    const { data: firstPost } = await supabaseAdmin
      .from('community_posts')
      .select('id')
      .eq('topic_id', post.topic_id)
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle()

    if (firstPost?.id === postId) {
      await supabaseAdmin.from('community_topics').update({ deleted_at: now }).eq('id', post.topic_id)
      await supabaseAdmin.from('community_posts').update({ deleted_at: now }).eq('topic_id', post.topic_id).is('deleted_at', null)
    } else {
      const { data: topic } = await supabaseAdmin.from('community_topics').select('reply_count').eq('id', post.topic_id).maybeSingle()
      if (topic) {
        await supabaseAdmin.from('community_topics').update({ reply_count: Math.max(0, topic.reply_count - 1) }).eq('id', post.topic_id)
      }
    }

    res.json({ success: true })
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

// ── POST /api/community/posts/:id/like ───────────────────────────────────────
router.post('/posts/:id/like', async (req: any, res: any) => {
  const userId = uid(req)
  const postId = Number(req.params.id)
  if (!Number.isFinite(postId)) { res.status(400).json({ error: 'invalid post id' }); return }

  try {
    const { data: post } = await supabaseAdmin.from('community_posts').select('id').eq('id', postId).is('deleted_at', null).maybeSingle()
    if (!post) { res.status(404).json({ error: 'post not found' }); return }

    const { data: existing } = await supabaseAdmin
      .from('community_post_likes').select('*').eq('post_id', postId).eq('user_id', userId).maybeSingle()

    if (existing) {
      await supabaseAdmin.from('community_post_likes').delete().eq('post_id', postId).eq('user_id', userId)
    } else {
      await supabaseAdmin.from('community_post_likes').insert({ post_id: postId, user_id: userId })
    }

    const { count } = await supabaseAdmin
      .from('community_post_likes').select('*', { count: 'exact', head: true }).eq('post_id', postId)

    res.json({ like_count: count ?? 0, liked_by_me: !existing })
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

// ── PATCH /api/community/topics/:id (admin only) ─────────────────────────────
router.patch('/topics/:id', async (req: any, res: any) => {
  const userId = uid(req)
  const topicId = Number(req.params.id)
  if (!Number.isFinite(topicId)) { res.status(400).json({ error: 'invalid topic id' }); return }
  if (!(await isAdmin(userId))) { res.status(403).json({ error: 'admin only' }); return }

  const { pinned, locked } = req.body as { pinned?: boolean; locked?: boolean }
  const update: Record<string, boolean> = {}
  if (typeof pinned === 'boolean') update.pinned = pinned
  if (typeof locked === 'boolean') update.locked = locked
  if (Object.keys(update).length === 0) { res.status(400).json({ error: 'nothing to update' }); return }

  try {
    const { data: topic, error } = await supabaseAdmin
      .from('community_topics').update(update).eq('id', topicId).select('*').single()
    if (error || !topic) { res.status(500).json({ error: error?.message }); return }
    res.json({ topic })
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

// ── DELETE /api/community/topics/:id ──────────────────────────────────────────
router.delete('/topics/:id', async (req: any, res: any) => {
  const userId = uid(req)
  const topicId = Number(req.params.id)
  if (!Number.isFinite(topicId)) { res.status(400).json({ error: 'invalid topic id' }); return }

  try {
    const { data: topic } = await supabaseAdmin.from('community_topics').select('*').eq('id', topicId).is('deleted_at', null).maybeSingle()
    if (!topic) { res.status(404).json({ error: 'topic not found' }); return }
    if (topic.user_id !== userId && !(await isAdmin(userId))) { res.status(403).json({ error: 'forbidden' }); return }

    const now = new Date().toISOString()
    await supabaseAdmin.from('community_topics').update({ deleted_at: now }).eq('id', topicId)
    await supabaseAdmin.from('community_posts').update({ deleted_at: now }).eq('topic_id', topicId).is('deleted_at', null)

    res.json({ success: true })
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

// ── Notificações: respostas recentes em tópicos que o usuário criou ─────────
// Padrão "pull" (mesmo de settlement_received/expense_share_added em
// notifications.ts): consultado ao vivo no GET /api/notifications, sem
// tabela de eventos própria. Só notifica o autor do tópico, e só quando
// outra pessoa responde — não dispara para likes nem para quem só comentou.
export interface RecentCommunityReply {
  key: string
  topic_id: number
  topic_slug: string
  topic_title: string
  replier_name: string
  occurred_at: string
}

const RECENT_REPLY_WINDOW_MS = 14 * 24 * 60 * 60 * 1000 // 14 dias

export async function getRecentCommunityReplies(userId: string): Promise<RecentCommunityReply[]> {
  const since = new Date(Date.now() - RECENT_REPLY_WINDOW_MS).toISOString()

  const { data: myTopics } = await supabaseAdmin
    .from('community_topics')
    .select('id, title, category_id')
    .eq('user_id', userId)
    .is('deleted_at', null)
  if (!myTopics || myTopics.length === 0) return []

  const topicIds = myTopics.map((t: any) => t.id)
  const { data: replies } = await supabaseAdmin
    .from('community_posts')
    .select('id, topic_id, user_id, created_at')
    .in('topic_id', topicIds)
    .neq('user_id', userId)
    .is('deleted_at', null)
    .gte('created_at', since)
    .order('created_at', { ascending: false })
  if (!replies || replies.length === 0) return []

  const categoryIds = [...new Set(myTopics.map((t: any) => t.category_id))]
  const { data: categories } = await supabaseAdmin
    .from('community_categories')
    .select('id, slug')
    .in('id', categoryIds)
  const categorySlugById = new Map((categories ?? []).map((c: any) => [c.id, c.slug]))
  const topicById = new Map(myTopics.map((t: any) => [t.id, t]))

  const replierIds = [...new Set(replies.map((r: any) => r.user_id))]
  const displays = await Promise.all(replierIds.map(async (id) => [id, await userDisplay(id)] as const))
  const displayMap = new Map(displays)

  return replies.map((r: any) => {
    const topic = topicById.get(r.topic_id)
    const display = displayMap.get(r.user_id)
    return {
      key: `community_reply:${r.id}`,
      topic_id: r.topic_id,
      topic_slug: categorySlugById.get(topic?.category_id) ?? '',
      topic_title: topic?.title ?? '',
      replier_name: display?.name ?? display?.email ?? '',
      occurred_at: r.created_at,
    }
  })
}


// ═══════════════════════════════════════════════════════════════════════════
// Galeria de viagens da Comunidade + perfil público (frente C)
// ═══════════════════════════════════════════════════════════════════════════
// Viagens que o dono disponibilizou pra galeria (voyage_trips.community_visible,
// migration 075) — consentimento separado do link público por token. O card
// linka pra /voyage/shared/:tripId, cujo gate em voyage.ts também aceita
// community_visible como autorização.

export interface CommunityTripCard {
  id: number
  title: string
  destination: string | null
  country: string | null
  cover_image_url: string | null
  cover_image_position: string
  start_date: string | null
  end_date: string | null
  status: string
  created_at: string
  destinations: { city: string | null; country: string | null }[]
  owner: CommunityAuthor
}

const COMMUNITY_TRIP_FIELDS = 'id, user_id, title, destination, country, cover_image_url, cover_image_position, start_date, end_date, status, created_at'

// Monta os cards da galeria (destinos + dono em queries em lote) — compartilhado
// entre GET /trips (galeria) e GET /users/:username (viagens do perfil).
async function buildCommunityTripCards(trips: any[]): Promise<CommunityTripCard[]> {
  if (!trips.length) return []

  const { data: dests } = await supabaseAdmin
    .from('voyage_trip_destinations')
    .select('trip_id, city, country, sort_order')
    .in('trip_id', trips.map((t: any) => t.id))
    .order('sort_order')
  const destsByTrip: Record<number, { city: string | null; country: string | null }[]> = {}
  for (const d of dests ?? []) (destsByTrip[d.trip_id] ??= []).push({ city: d.city, country: d.country })

  const ownerIds = [...new Set(trips.map((t: any) => t.user_id as string))]
  const displays = await Promise.all(ownerIds.map(async (id) => [id, await userDisplay(id)] as const))
  const displayMap = new Map(displays)

  return trips.map((t: any) => ({
    id: t.id,
    title: t.title,
    destination: t.destination,
    country: t.country,
    cover_image_url: t.cover_image_url,
    cover_image_position: t.cover_image_position,
    start_date: t.start_date,
    end_date: t.end_date,
    status: t.status,
    created_at: t.created_at,
    destinations: destsByTrip[t.id] ?? [],
    owner: toAuthor(t.user_id, displayMap.get(t.user_id)!),
  }))
}

// ── GET /api/community/trips  (galeria, ordenada por recência) ───────────────
router.get('/trips', async (req: any, res: any) => {
  const userId = uid(req)
  try {
    await ensureMember(userId)

    const { data: trips, error } = await supabaseAdmin
      .from('voyage_trips')
      .select(COMMUNITY_TRIP_FIELDS)
      .eq('community_visible', true)
      .order('created_at', { ascending: false })
      .limit(60)
    if (error) { res.status(500).json({ error: error.message }); return }

    res.json({ trips: await buildCommunityTripCards(trips ?? []) })
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

// ── GET /api/community/users/:username  (perfil público, /u/:username) ────────
// Aceita @username OU UUID do usuário — nem todo mundo tem handle, então o
// ProfileLink cai pro id quando o autor não tem @ (perfil continua acessível).
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
router.get('/users/:username', async (req: any, res: any) => {
  const userId = uid(req)
  const param = String(req.params.username ?? '').trim().toLowerCase().replace(/^@/, '')
  if (!param) { res.status(400).json({ error: 'username required' }); return }

  try {
    await ensureMember(userId)

    let targetId: string
    if (UUID_RE.test(param)) {
      targetId = param
    } else {
      const { data: handle } = await supabaseAdmin
        .from('user_handles').select('user_id').eq('username', param).maybeSingle()
      if (!handle) { res.status(404).json({ error: 'user not found' }); return }
      targetId = handle.user_id as string
    }

    const [display, authRes, adminIds, statuses, profileRow, topicsRes, tripsRes] = await Promise.all([
      userDisplay(targetId),
      supabaseAdmin.auth.admin.getUserById(targetId),
      getAdminIds(),
      getFriendshipStatuses(userId, [targetId]),
      supabaseAdmin.from('profiles').select('bio, public_profile').eq('id', targetId).maybeSingle(),
      supabaseAdmin
        .from('community_topics')
        .select('id, title, category_id, created_at, reply_count, last_post_at')
        .eq('user_id', targetId)
        .is('deleted_at', null)
        .order('created_at', { ascending: false })
        .limit(10),
      supabaseAdmin
        .from('voyage_trips')
        .select(COMMUNITY_TRIP_FIELDS)
        .eq('user_id', targetId)
        .eq('community_visible', true)
        .order('created_at', { ascending: false }),
    ])

    // No caminho por UUID o usuário pode não existir — o getUserById é a checagem
    if (!authRes.data?.user) { res.status(404).json({ error: 'user not found' }); return }

    // Perfil desativado (public_profile = false, migration 077): não encontrável
    // pra ninguém — mesmo 404 de usuário inexistente, pra não vazar que a conta
    // existe. Exceções: o próprio dono (vê a página com aviso) e admins.
    const isPublic = profileRow.data?.public_profile !== false
    if (!isPublic && targetId !== userId && !adminIds.has(userId)) {
      res.status(404).json({ error: 'user not found' }); return
    }

    const topics = topicsRes.data ?? []
    const categoryIds = [...new Set(topics.map((t: any) => t.category_id))]
    const { data: categories } = categoryIds.length
      ? await supabaseAdmin.from('community_categories').select('id, slug').in('id', categoryIds)
      : { data: [] as any[] }
    const slugById = new Map((categories ?? []).map((c: any) => [c.id, c.slug]))

    const friendship: FriendshipStatus = statuses[targetId] ?? 'none'

    res.json({
      profile: {
        id: targetId,
        // Pode ser null quando o perfil foi aberto por UUID e o usuário não tem handle
        username: display.username ?? null,
        name: display.name ?? display.email,
        avatar_url: display.avatar_url ?? null,
        member_since: authRes.data?.user?.created_at ?? null,
        is_admin: adminIds.has(targetId),
        bio: profileRow.data?.bio ?? null,
        // false só chega ao cliente pro dono/admin (visitante recebe 404 acima) —
        // é o que dispara o aviso "perfil desativado" na própria página
        public_profile: isPublic,
      },
      friendship_status: friendship,
      topics: topics.map((t: any) => ({
        id: t.id,
        title: t.title,
        category_slug: slugById.get(t.category_id) ?? '',
        created_at: t.created_at,
        reply_count: t.reply_count,
        last_post_at: t.last_post_at,
      })),
      trips: await buildCommunityTripCards(tripsRes.data ?? []),
    })
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

// ── PATCH /api/community/users/me  ({ bio?, public_profile? }) ───────────────
// Escrita única dos dois campos da migration 077: a bio editada inline no
// próprio perfil (/u/:handle) e o switch "Perfil público" das configurações.
// Upsert porque contas antigas podem não ter linha em profiles (o trigger
// handle_new_user só cobre cadastros novos).
const BIO_MAX = 280
router.patch('/users/me', async (req: any, res: any) => {
  const userId = uid(req)
  const { bio, public_profile } = req.body as { bio?: unknown; public_profile?: unknown }

  const patch: Record<string, any> = {}
  if (bio !== undefined) {
    if (typeof bio !== 'string') { res.status(400).json({ error: 'bio must be a string' }); return }
    const trimmed = bio.trim()
    // Limite em code points (não UTF-16 units) pra não penalizar emoji/acentos
    if ([...trimmed].length > BIO_MAX) { res.status(400).json({ error: `bio must be at most ${BIO_MAX} characters` }); return }
    patch.bio = trimmed || null
  }
  if (public_profile !== undefined) {
    if (typeof public_profile !== 'boolean') { res.status(400).json({ error: 'public_profile must be a boolean' }); return }
    patch.public_profile = public_profile
  }
  if (!Object.keys(patch).length) { res.status(400).json({ error: 'nothing to update' }); return }

  try {
    const { error } = await supabaseAdmin
      .from('profiles')
      .upsert({ id: userId, ...patch, updated_at: new Date().toISOString() }, { onConflict: 'id' })
    if (error) { res.status(500).json({ error: error.message }); return }
    res.json({ ok: true, ...patch })
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})


// ═══════════════════════════════════════════════════════════════════════════
// Painel de administração (/api/community/admin/*) — todas as rotas exigem
// que o chamador seja admin (tabela community_admins).
// ═══════════════════════════════════════════════════════════════════════════

async function requireAdmin(req: any, res: any): Promise<string | null> {
  const userId = uid(req)
  if (!(await isAdmin(userId))) { res.status(403).json({ error: 'admin only' }); return null }
  return userId
}

function slugify(name: string): string {
  return name
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
}

// ── GET /api/community/admin/members?q= ──────────────────────────────────────
router.get('/admin/members', async (req: any, res: any) => {
  const adminId = await requireAdmin(req, res)
  if (!adminId) return
  const q = String(req.query.q ?? '').trim().toLowerCase()

  try {
    const { data: members, error } = await supabaseAdmin
      .from('community_members')
      .select('user_id, tier, joined_at')
      .order('joined_at', { ascending: true })
    if (error) { res.status(500).json({ error: error.message }); return }
    const adminIds = await getAdminIds()

    const rows = await Promise.all((members ?? []).map(async (m: any) => {
      const d = await userDisplay(m.user_id)
      return {
        id: m.user_id,
        name: d.name ?? d.email,
        username: d.username ?? null,
        avatar_url: d.avatar_url ?? null,
        tier: m.tier,
        joined_at: m.joined_at,
        is_admin: adminIds.has(m.user_id),
      }
    }))

    const filtered = q
      ? rows.filter(r => r.name.toLowerCase().includes(q) || (r.username ?? '').toLowerCase().includes(q))
      : rows
    res.json({ members: filtered })
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

// ── POST /api/community/admin/members/:id/promote | /demote ─────────────────
router.post('/admin/members/:id/promote', async (req: any, res: any) => {
  const adminId = await requireAdmin(req, res)
  if (!adminId) return
  const targetId = String(req.params.id)
  try {
    await supabaseAdmin.from('community_admins').upsert({ user_id: targetId, promoted_by: adminId }, { onConflict: 'user_id' })
    cache.deletePattern(ADMINS_CACHE_KEY)
    res.json({ ok: true })
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

router.post('/admin/members/:id/demote', async (req: any, res: any) => {
  const adminId = await requireAdmin(req, res)
  if (!adminId) return
  const targetId = String(req.params.id)
  try {
    const adminIds = await getAdminIds()
    if (adminIds.has(targetId) && adminIds.size <= 1) {
      res.status(400).json({ error: 'cannot demote the last admin' }); return
    }
    await supabaseAdmin.from('community_admins').delete().eq('user_id', targetId)
    cache.deletePattern(ADMINS_CACHE_KEY)
    res.json({ ok: true })
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

// ── POST /api/community/admin/members/:id/tier ───────────────────────────────
// Tier comercial do Arvo (free < plus < beta), diferente de community_admins
// (papel de admin do workspace, mexido por promote/demote acima). Upsert
// porque a linha em community_members pode não existir pra todo usuário.
router.post('/admin/members/:id/tier', async (req: any, res: any) => {
  const adminId = await requireAdmin(req, res)
  if (!adminId) return
  const targetId = String(req.params.id)
  const tier = String(req.body?.tier ?? '')
  if (!['free', 'plus', 'beta'].includes(tier)) { res.status(400).json({ error: 'tier inválido' }); return }
  try {
    await supabaseAdmin.from('community_members').upsert({ user_id: targetId, tier }, { onConflict: 'user_id' })
    res.json({ ok: true })
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

// ── GET /api/community/admin/posts/recent ────────────────────────────────────
router.get('/admin/posts/recent', async (req: any, res: any) => {
  const adminId = await requireAdmin(req, res)
  if (!adminId) return
  try {
    const { data: posts } = await supabaseAdmin
      .from('community_posts')
      .select('id, topic_id, user_id, body, created_at')
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .limit(20)

    const topicIds = [...new Set((posts ?? []).map((p: any) => p.topic_id))]
    const { data: topics } = topicIds.length
      ? await supabaseAdmin.from('community_topics').select('id, title, category_id').in('id', topicIds)
      : { data: [] as any[] }
    const topicById = new Map((topics ?? []).map((t: any) => [t.id, t]))

    const catIds = [...new Set((topics ?? []).map((t: any) => t.category_id))]
    const { data: cats } = catIds.length
      ? await supabaseAdmin.from('community_categories').select('id, slug').in('id', catIds)
      : { data: [] as any[] }
    const slugById = new Map((cats ?? []).map((c: any) => [c.id, c.slug]))

    const authorIds = [...new Set((posts ?? []).map((p: any) => p.user_id))]
    const displays = await Promise.all(authorIds.map(async (id) => [id, await userDisplay(id)] as const))
    const displayMap = new Map(displays)

    const result = (posts ?? []).map((p: any) => {
      const topic = topicById.get(p.topic_id)
      const d = displayMap.get(p.user_id)
      return {
        id: p.id,
        topic_id: p.topic_id,
        topic_title: topic?.title ?? '',
        category_slug: topic ? (slugById.get(topic.category_id) ?? '') : '',
        author_name: d?.name ?? d?.email ?? '',
        excerpt: String(p.body).slice(0, 140),
        created_at: p.created_at,
      }
    })
    res.json({ posts: result })
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

// ── POST /api/community/admin/categories ─────────────────────────────────────
router.post('/admin/categories', async (req: any, res: any) => {
  const adminId = await requireAdmin(req, res)
  if (!adminId) return
  const { name, icon_key } = req.body as { name?: string; icon_key?: string }
  if (!name?.trim()) { res.status(400).json({ error: 'name required' }); return }

  try {
    const slug = slugify(name)
    if (!slug) { res.status(400).json({ error: 'invalid name' }); return }
    const { data: existing } = await supabaseAdmin.from('community_categories').select('id').eq('slug', slug).maybeSingle()
    if (existing) { res.status(409).json({ error: 'category already exists' }); return }

    const { data: maxRow } = await supabaseAdmin
      .from('community_categories').select('sort_order').order('sort_order', { ascending: false }).limit(1).maybeSingle()
    const { data: created, error } = await supabaseAdmin
      .from('community_categories')
      .insert({ slug, name_key: slug, name: name.trim(), icon_key: icon_key ?? null, sort_order: (maxRow?.sort_order ?? 0) + 1 })
      .select('*').single()
    if (error || !created) { res.status(500).json({ error: error?.message }); return }
    res.json({ category: created })
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

// ── PATCH /api/community/admin/categories/:id ────────────────────────────────
router.patch('/admin/categories/:id', async (req: any, res: any) => {
  const adminId = await requireAdmin(req, res)
  if (!adminId) return
  const catId = Number(req.params.id)
  if (!Number.isFinite(catId)) { res.status(400).json({ error: 'invalid category id' }); return }
  const { name, icon_key, sort_order, archived } = req.body as { name?: string; icon_key?: string; sort_order?: number; archived?: boolean }

  try {
    const update: Record<string, any> = {}
    if (typeof name === 'string' && name.trim()) update.name = name.trim()
    if (typeof icon_key === 'string') update.icon_key = icon_key || null
    if (typeof sort_order === 'number') update.sort_order = sort_order
    if (typeof archived === 'boolean') update.archived_at = archived ? new Date().toISOString() : null
    if (!Object.keys(update).length) { res.status(400).json({ error: 'nothing to update' }); return }

    const { data: updated, error } = await supabaseAdmin
      .from('community_categories').update(update).eq('id', catId).select('*').single()
    if (error || !updated) { res.status(500).json({ error: error?.message }); return }
    res.json({ category: updated })
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

export default router
