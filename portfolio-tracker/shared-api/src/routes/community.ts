import { Router, Response } from 'express'
import { requireAuth, AuthRequest } from '../middleware/auth.js'
import { supabaseAdmin } from '../lib/supabase.js'
import { userDisplay } from './people.js'

const router = Router()
router.use(requireAuth)

function uid(req: Parameters<typeof requireAuth>[0]): string {
  return (req as AuthRequest).userId
}

// Admin da comunidade V1 — sem painel de moderação dedicado ainda; um único
// usuário (André) pode fixar/trancar tópicos e apagar qualquer conteúdo.
const ADMIN_USER_IDS = new Set([process.env.COMMUNITY_ADMIN_ID ?? '453bc770-0cea-4c88-b72f-babf9e50437e'])
function isAdmin(userId: string): boolean {
  return ADMIN_USER_IDS.has(userId)
}

// Garante que o usuário tem uma linha em community_members (tier 'free' por
// padrão) — chamado no primeiro acesso a qualquer endpoint da comunidade.
async function ensureMember(userId: string): Promise<void> {
  const { data } = await supabaseAdmin.from('community_members').select('user_id').eq('user_id', userId).maybeSingle()
  if (!data) {
    await supabaseAdmin.from('community_members').insert({ user_id: userId, tier: 'free' })
  }
}

export interface CommunityCategory {
  id: number
  slug: string
  name_key: string
  icon: string | null
  sort_order: number
  topic_count: number
}

export interface CommunityAuthor {
  id: string
  name: string
  username?: string
  avatar_url?: string
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

function toAuthor(userId: string, display: { name?: string; email: string; avatar_url?: string; username?: string }): CommunityAuthor {
  return { id: userId, name: display.name ?? display.email, username: display.username, avatar_url: display.avatar_url }
}

// ── GET /api/community/categories ───────────────────────────────────────────
router.get('/categories', async (req: any, res: any) => {
  const userId = uid(req)
  try {
    await ensureMember(userId)

    const { data: categories, error } = await supabaseAdmin
      .from('community_categories')
      .select('*')
      .order('sort_order', { ascending: true })
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
      icon: c.icon,
      sort_order: c.sort_order,
      topic_count: counts[c.id] ?? 0,
    }))

    res.json({ categories: result })
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

    const firstPostId = posts && posts.length > 0 ? posts[0].id : null

    const resultPosts: CommunityPost[] = (posts ?? []).map((p: any) => ({
      id: p.id,
      topic_id: p.topic_id,
      body: p.body,
      edited_at: p.edited_at,
      created_at: p.created_at,
      author: toAuthor(p.user_id, displayMap.get(p.user_id)!),
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
      author: toAuthor(topic.user_id, displayMap.get(topic.user_id)!),
      is_own: topic.user_id === userId,
      is_admin_viewer: isAdmin(userId),
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
    if (topic.locked && !isAdmin(userId)) { res.status(403).json({ error: 'topic is locked' }); return }

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
    if (post.user_id !== userId && !isAdmin(userId)) { res.status(403).json({ error: 'forbidden' }); return }

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
    if (post.user_id !== userId && !isAdmin(userId)) { res.status(403).json({ error: 'forbidden' }); return }

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
  if (!isAdmin(userId)) { res.status(403).json({ error: 'admin only' }); return }

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
    if (topic.user_id !== userId && !isAdmin(userId)) { res.status(403).json({ error: 'forbidden' }); return }

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

export default router
