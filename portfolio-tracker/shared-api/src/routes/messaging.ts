import { Router } from 'express'
import { requireAuth, AuthRequest } from '../middleware/auth.js'
import { supabaseAdmin } from '../lib/supabase.js'
import { userDisplay, areActiveFriends } from './people.js'
import { ensureMemberTier } from './community.js'

const router = Router()
router.use(requireAuth)

function uid(req: Parameters<typeof requireAuth>[0]): string {
  return (req as AuthRequest).userId
}

// Ferramenta premium: por enquanto MESSAGING_TIER_REQUIRED=free libera todo mundo
// pra testes. Quando virar 'paid', qualquer usuário com tier 'free' recebe 403 em
// TODOS os endpoints deste router — o switch é só trocar a env var.
const TIER_REQUIRED = (process.env.MESSAGING_TIER_REQUIRED ?? 'free') as 'free' | 'paid'
router.use(async (req: any, res: any, next: any) => {
  if (TIER_REQUIRED === 'free') { next(); return }
  try {
    const tier = await ensureMemberTier(uid(req))
    if (tier !== 'paid') { res.status(403).json({ error: 'premium_required' }); return }
    next()
  } catch (e: any) {
    res.status(500).json({ error: e.message ?? 'Erro ao validar acesso' })
  }
})

function normalizePair(a: string, b: string): [string, string] {
  return a < b ? [a, b] : [b, a]
}

async function getConversationOrThrow(conversationId: number, userId: string) {
  const { data } = await supabaseAdmin
    .from('dm_conversations')
    .select('id, user_a, user_b, last_message_at')
    .eq('id', conversationId)
    .maybeSingle()
  if (!data) return null
  if (data.user_a !== userId && data.user_b !== userId) return null
  return data
}

// ── GET /api/messages/conversations ─────────────────────────────────────────────
router.get('/conversations', async (req: any, res: any) => {
  try {
    const userId = uid(req)
    const { data: convs, error } = await supabaseAdmin
      .from('dm_conversations')
      .select('id, user_a, user_b, last_message_at')
      .or(`user_a.eq.${userId},user_b.eq.${userId}`)
      .order('last_message_at', { ascending: false })
    if (error) { res.status(500).json({ error: error.message }); return }
    if (!convs?.length) { res.json({ conversations: [] }); return }

    const { data: states } = await supabaseAdmin
      .from('dm_participants_state')
      .select('conversation_id, last_read_at')
      .eq('user_id', userId)
      .in('conversation_id', convs.map(c => c.id))
    const lastReadMap: Record<number, string> = Object.fromEntries(
      (states ?? []).map((s: any) => [s.conversation_id, s.last_read_at])
    )

    const conversations = await Promise.all(convs.map(async (c: any) => {
      const otherId = c.user_a === userId ? c.user_b : c.user_a
      const [other, { data: lastMsg }, { count: unreadCount }] = await Promise.all([
        userDisplay(otherId),
        supabaseAdmin
          .from('dm_messages')
          .select('body, created_at, sender_id')
          .eq('conversation_id', c.id)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle(),
        supabaseAdmin
          .from('dm_messages')
          .select('id', { count: 'exact', head: true })
          .eq('conversation_id', c.id)
          .neq('sender_id', userId)
          .gt('created_at', lastReadMap[c.id] ?? '1970-01-01'),
      ])

      return {
        id: c.id,
        peer: { user_id: otherId, name: other.name, username: other.username, avatar_url: other.avatar_url },
        last_message: lastMsg ? { body: lastMsg.body, created_at: lastMsg.created_at, from_me: lastMsg.sender_id === userId } : null,
        last_message_at: c.last_message_at,
        unread_count: unreadCount ?? 0,
      }
    }))

    res.json({ conversations })
  } catch (e: any) {
    res.status(500).json({ error: e.message ?? 'Erro ao listar conversas' })
  }
})

// ── POST /api/messages/conversations  (get-or-create) ───────────────────────────
router.post('/conversations', async (req: any, res: any) => {
  try {
    const userId = uid(req)
    const { peer_user_id } = req.body as { peer_user_id?: string }
    if (!peer_user_id) { res.status(400).json({ error: 'peer_user_id obrigatório' }); return }
    if (peer_user_id === userId) { res.status(400).json({ error: 'Não é possível conversar consigo mesmo' }); return }

    const active = await areActiveFriends(userId, peer_user_id)
    if (!active) { res.status(403).json({ error: 'Só é possível conversar com amigos ativos' }); return }

    const [user_a, user_b] = normalizePair(userId, peer_user_id)
    const { data: existing } = await supabaseAdmin
      .from('dm_conversations').select('id, user_a, user_b, last_message_at')
      .eq('user_a', user_a).eq('user_b', user_b).maybeSingle()
    if (existing) { res.json({ conversation: existing }); return }

    const { data: created, error } = await supabaseAdmin
      .from('dm_conversations')
      .insert({ user_a, user_b })
      .select('id, user_a, user_b, last_message_at')
      .single()
    if (error) { res.status(500).json({ error: error.message }); return }

    res.json({ conversation: created })
  } catch (e: any) {
    res.status(500).json({ error: e.message ?? 'Erro ao criar conversa' })
  }
})

// ── GET /api/messages/conversations/:id/messages?before=<iso> ──────────────────
router.get('/conversations/:id/messages', async (req: any, res: any) => {
  try {
    const userId = uid(req)
    const conversationId = Number(req.params.id)
    const conv = await getConversationOrThrow(conversationId, userId)
    if (!conv) { res.status(404).json({ error: 'Conversa não encontrada' }); return }

    const before = req.query.before ? String(req.query.before) : null
    let query = supabaseAdmin
      .from('dm_messages')
      .select('id, sender_id, body, created_at')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: false })
      .limit(50)
    if (before) query = query.lt('created_at', before)

    const { data, error } = await query
    if (error) { res.status(500).json({ error: error.message }); return }
    res.json({ messages: (data ?? []).slice().reverse() })
  } catch (e: any) {
    res.status(500).json({ error: e.message ?? 'Erro ao carregar mensagens' })
  }
})

// ── POST /api/messages/conversations/:id/messages ───────────────────────────────
router.post('/conversations/:id/messages', async (req: any, res: any) => {
  try {
    const userId = uid(req)
    const conversationId = Number(req.params.id)
    const conv = await getConversationOrThrow(conversationId, userId)
    if (!conv) { res.status(404).json({ error: 'Conversa não encontrada' }); return }

    const otherId = conv.user_a === userId ? conv.user_b : conv.user_a
    // Revalida a cada envio: se a amizade foi desfeita depois que a conversa foi
    // criada, o histórico permanece mas ninguém consegue mandar mensagem nova.
    const active = await areActiveFriends(userId, otherId)
    if (!active) { res.status(403).json({ error: 'Vocês não são mais amigos' }); return }

    const body = String((req.body?.body ?? '')).trim()
    if (!body) { res.status(400).json({ error: 'Mensagem vazia' }); return }
    if (body.length > 4000) { res.status(400).json({ error: 'Mensagem muito longa (máx. 4000 caracteres)' }); return }

    const { data: message, error } = await supabaseAdmin
      .from('dm_messages')
      .insert({ conversation_id: conversationId, sender_id: userId, body })
      .select('id, sender_id, body, created_at')
      .single()
    if (error) { res.status(500).json({ error: error.message }); return }

    await supabaseAdmin
      .from('dm_conversations')
      .update({ last_message_at: message.created_at })
      .eq('id', conversationId)

    res.json({ message })
  } catch (e: any) {
    res.status(500).json({ error: e.message ?? 'Erro ao enviar mensagem' })
  }
})

// ── POST /api/messages/conversations/:id/read ───────────────────────────────────
router.post('/conversations/:id/read', async (req: any, res: any) => {
  try {
    const userId = uid(req)
    const conversationId = Number(req.params.id)
    const conv = await getConversationOrThrow(conversationId, userId)
    if (!conv) { res.status(404).json({ error: 'Conversa não encontrada' }); return }

    const { error } = await supabaseAdmin
      .from('dm_participants_state')
      .upsert({ conversation_id: conversationId, user_id: userId, last_read_at: new Date().toISOString() }, { onConflict: 'conversation_id,user_id' })
    if (error) { res.status(500).json({ error: error.message }); return }

    res.json({ ok: true })
  } catch (e: any) {
    res.status(500).json({ error: e.message ?? 'Erro ao marcar como lida' })
  }
})

// ── GET /api/messages/unread-count ──────────────────────────────────────────────
router.get('/unread-count', async (req: any, res: any) => {
  try {
    const userId = uid(req)
    const { data: convs } = await supabaseAdmin
      .from('dm_conversations')
      .select('id')
      .or(`user_a.eq.${userId},user_b.eq.${userId}`)
    if (!convs?.length) { res.json({ unread_count: 0 }); return }

    const { data: states } = await supabaseAdmin
      .from('dm_participants_state')
      .select('conversation_id, last_read_at')
      .eq('user_id', userId)
      .in('conversation_id', convs.map((c: any) => c.id))
    const lastReadMap: Record<number, string> = Object.fromEntries(
      (states ?? []).map((s: any) => [s.conversation_id, s.last_read_at])
    )

    const counts = await Promise.all(convs.map((c: any) =>
      supabaseAdmin
        .from('dm_messages')
        .select('id', { count: 'exact', head: true })
        .eq('conversation_id', c.id)
        .neq('sender_id', userId)
        .gt('created_at', lastReadMap[c.id] ?? '1970-01-01')
        .then(r => r.count ?? 0)
    ))

    res.json({ unread_count: counts.reduce((a, b) => a + b, 0) })
  } catch (e: any) {
    res.status(500).json({ error: e.message ?? 'Erro ao contar não lidas' })
  }
})

// ── GET /api/messages/friendship-status?user_ids=a,b,c ──────────────────────────
// Batch de status de amizade pra colorir os botões +Amizade/Mensagem no
// PostCard da comunidade sem um request por post.
router.get('/friendship-status', async (req: any, res: any) => {
  try {
    const userId = uid(req)
    const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    const ids = String(req.query.user_ids ?? '').split(',').map(s => s.trim()).filter(s => UUID_RE.test(s))
    if (!ids.length) { res.json({ statuses: {} }); return }

    const uniqueIds = [...new Set(ids)]
    const statuses: Record<string, 'self' | 'active' | 'pending' | 'none'> = {}

    const others = uniqueIds.filter(id => id !== userId)
    for (const id of uniqueIds) if (id === userId) statuses[id] = 'self'
    if (others.length === 0) { res.json({ statuses }); return }

    const { data: rows } = await supabaseAdmin
      .from('user_friends')
      .select('owner_user_id, friend_user_id, status')
      .or(`and(owner_user_id.eq.${userId},friend_user_id.in.(${others.join(',')})),and(friend_user_id.eq.${userId},owner_user_id.in.(${others.join(',')}))`)

    for (const id of others) statuses[id] = 'none'
    for (const row of rows ?? []) {
      const otherId = row.owner_user_id === userId ? row.friend_user_id : row.owner_user_id
      if (!otherId || !others.includes(otherId)) continue
      if (row.status === 'active') statuses[otherId] = 'active'
      else if (row.status === 'pending' && statuses[otherId] !== 'active') statuses[otherId] = 'pending'
    }

    res.json({ statuses })
  } catch (e: any) {
    res.status(500).json({ error: e.message ?? 'Erro ao buscar status de amizade' })
  }
})

export default router
