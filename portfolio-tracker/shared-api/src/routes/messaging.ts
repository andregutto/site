import { Router } from 'express'
import { requireAuth, AuthRequest } from '../middleware/auth.js'
import { supabaseAdmin } from '../lib/supabase.js'
import { userDisplay, areActiveFriends, getFriendshipStatuses } from './people.js'
import { ensureMemberTier, TIER_RANK } from './community.js'

const router = Router()
router.use(requireAuth)

function uid(req: Parameters<typeof requireAuth>[0]): string {
  return (req as AuthRequest).userId
}

// Ferramenta premium: por enquanto MESSAGING_TIER_REQUIRED=free libera todo mundo
// pra testes. Quando virar 'plus' ou 'beta', qualquer usuário abaixo desse tier
// recebe 403 em TODOS os endpoints deste router — o switch é só trocar a env var.
const TIER_REQUIRED = (process.env.MESSAGING_TIER_REQUIRED ?? 'free') as 'free' | 'plus' | 'beta'
router.use(async (req: any, res: any, next: any) => {
  if (TIER_REQUIRED === 'free') { next(); return }
  try {
    const tier = await ensureMemberTier(uid(req))
    if (TIER_RANK[tier] < TIER_RANK[TIER_REQUIRED]) { res.status(403).json({ error: 'premium_required' }); return }
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

// Ids de mensagens que o próprio usuário apagou "só pra mim" — excluídas de tudo
// que ele lê, sem afetar a visão do outro participante. Uma query só (tabela
// pequena, por usuário), reaproveitada em qualquer lugar que precise filtrar.
async function getHiddenMessageIds(userId: string): Promise<number[]> {
  const { data } = await supabaseAdmin.from('dm_message_hidden_for').select('message_id').eq('user_id', userId)
  return (data ?? []).map((r: any) => r.message_id)
}

function serializeMessage(m: any) {
  return m.deleted_at
    ? { id: m.id, sender_id: m.sender_id, body: '', created_at: m.created_at, deleted_at: m.deleted_at }
    : { id: m.id, sender_id: m.sender_id, body: m.body, created_at: m.created_at, deleted_at: null }
}

// ── GET /api/messages/conversations?archived=true ──────────────────────────────
// Reescrito pra evitar N+1: em vez de 2-3 queries POR conversa (o que deixava a
// lista visivelmente lenta com várias conversas), busca hidden-ids, last-message
// e unread-count cada um numa query só cobrindo todas as conversas de uma vez.
router.get('/conversations', async (req: any, res: any) => {
  try {
    const userId = uid(req)
    const wantArchived = req.query.archived === 'true'

    const [{ data: convs, error }, { data: states }] = await Promise.all([
      supabaseAdmin
        .from('dm_conversations')
        .select('id, user_a, user_b, last_message_at')
        .or(`user_a.eq.${userId},user_b.eq.${userId}`)
        .order('last_message_at', { ascending: false }),
      supabaseAdmin
        .from('dm_participants_state')
        .select('conversation_id, last_read_at, archived_at, hidden_at')
        .eq('user_id', userId),
    ])
    if (error) { res.status(500).json({ error: error.message }); return }

    const stateMap: Record<number, { last_read_at: string; archived_at: string | null; hidden_at: string | null }> = Object.fromEntries(
      (states ?? []).map((s: any) => [s.conversation_id, s])
    )

    const visibleConvs = (convs ?? []).filter((c: any) => {
      const st = stateMap[c.id]
      if (st?.hidden_at) return false
      return wantArchived ? !!st?.archived_at : !st?.archived_at
    })
    if (!visibleConvs.length) { res.json({ conversations: [] }); return }

    const ids = visibleConvs.map((c: any) => c.id)
    const hiddenMsgIds = await getHiddenMessageIds(userId)

    let lastMsgQuery = supabaseAdmin
      .from('dm_messages')
      .select('conversation_id, sender_id, body, created_at, deleted_at')
      .in('conversation_id', ids)
      .order('created_at', { ascending: false })
    if (hiddenMsgIds.length) lastMsgQuery = lastMsgQuery.not('id', 'in', `(${hiddenMsgIds.join(',')})`)

    let unreadQuery = supabaseAdmin
      .from('dm_messages')
      .select('conversation_id, created_at')
      .in('conversation_id', ids)
      .neq('sender_id', userId)
    if (hiddenMsgIds.length) unreadQuery = unreadQuery.not('id', 'in', `(${hiddenMsgIds.join(',')})`)

    const otherIds = [...new Set(visibleConvs.map((c: any) => (c.user_a === userId ? c.user_b : c.user_a)))]
    const [{ data: recentMessages }, { data: unreadRows }, displays] = await Promise.all([
      lastMsgQuery,
      unreadQuery,
      Promise.all(otherIds.map(id => userDisplay(id).then(d => ({ id, ...d })))),
    ])

    const displayMap: Record<string, { name?: string; username?: string; avatar_url?: string }> = Object.fromEntries(
      displays.map(d => [d.id, d])
    )
    const lastMsgByConv: Record<number, any> = {}
    for (const m of recentMessages ?? []) {
      if (!(m.conversation_id in lastMsgByConv)) lastMsgByConv[m.conversation_id] = m
    }
    const unreadCountByConv: Record<number, number> = {}
    for (const m of unreadRows ?? []) {
      const threshold = stateMap[m.conversation_id]?.last_read_at ?? '1970-01-01'
      if (m.created_at > threshold) unreadCountByConv[m.conversation_id] = (unreadCountByConv[m.conversation_id] ?? 0) + 1
    }

    const conversations = visibleConvs.map((c: any) => {
      const otherId = c.user_a === userId ? c.user_b : c.user_a
      const other = displayMap[otherId] ?? {}
      const lastMsg = lastMsgByConv[c.id]
      return {
        id: c.id,
        peer: { user_id: otherId, name: other.name, username: other.username, avatar_url: other.avatar_url },
        last_message: lastMsg ? { body: lastMsg.deleted_at ? '' : lastMsg.body, deleted_at: lastMsg.deleted_at, created_at: lastMsg.created_at, from_me: lastMsg.sender_id === userId } : null,
        last_message_at: c.last_message_at,
        unread_count: unreadCountByConv[c.id] ?? 0,
      }
    })

    res.json({ conversations })
  } catch (e: any) {
    res.status(500).json({ error: e.message ?? 'Erro ao listar conversas' })
  }
})

// ── GET /api/messages/conversations/:id  (detalhe + read-receipt do outro) ─────
router.get('/conversations/:id', async (req: any, res: any) => {
  try {
    const userId = uid(req)
    const conversationId = Number(req.params.id)
    const conv = await getConversationOrThrow(conversationId, userId)
    if (!conv) { res.status(404).json({ error: 'Conversa não encontrada' }); return }

    const otherId = conv.user_a === userId ? conv.user_b : conv.user_a
    const [other, { data: peerState }] = await Promise.all([
      userDisplay(otherId),
      supabaseAdmin
        .from('dm_participants_state')
        .select('last_read_at')
        .eq('conversation_id', conversationId)
        .eq('user_id', otherId)
        .maybeSingle(),
    ])

    res.json({
      conversation: {
        id: conv.id,
        peer: { user_id: otherId, name: other.name, username: other.username, avatar_url: other.avatar_url },
        peer_last_read_at: peerState?.last_read_at ?? null,
      },
    })
  } catch (e: any) {
    res.status(500).json({ error: e.message ?? 'Erro ao carregar conversa' })
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
    const hiddenIds = await getHiddenMessageIds(userId)
    let query = supabaseAdmin
      .from('dm_messages')
      .select('id, sender_id, body, created_at, deleted_at')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: false })
      .limit(50)
    if (before) query = query.lt('created_at', before)
    if (hiddenIds.length) query = query.not('id', 'in', `(${hiddenIds.join(',')})`)

    const { data, error } = await query
    if (error) { res.status(500).json({ error: error.message }); return }
    res.json({ messages: (data ?? []).slice().reverse().map(serializeMessage) })
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
      .select('id, sender_id, body, created_at, deleted_at')
      .single()
    if (error) { res.status(500).json({ error: error.message }); return }

    await supabaseAdmin
      .from('dm_conversations')
      .update({ last_message_at: message.created_at })
      .eq('id', conversationId)

    res.json({ message: serializeMessage(message) })
  } catch (e: any) {
    res.status(500).json({ error: e.message ?? 'Erro ao enviar mensagem' })
  }
})

// ── DELETE /api/messages/conversations/:id/messages/:messageId ─────────────────
// mode='everyone': só o autor pode; esvazia o corpo e marca deleted_at (mantém a
// linha pra não quebrar a ordenação/threading). mode='me': oculta só pra quem pediu,
// sem tocar na mensagem em si — o outro participante nem sabe que isso aconteceu.
router.delete('/conversations/:id/messages/:messageId', async (req: any, res: any) => {
  try {
    const userId = uid(req)
    const conversationId = Number(req.params.id)
    const messageId = Number(req.params.messageId)
    const mode = String(req.query.mode ?? req.body?.mode ?? 'me')

    const conv = await getConversationOrThrow(conversationId, userId)
    if (!conv) { res.status(404).json({ error: 'Conversa não encontrada' }); return }

    const { data: message } = await supabaseAdmin
      .from('dm_messages').select('id, sender_id, conversation_id').eq('id', messageId).maybeSingle()
    if (!message || message.conversation_id !== conversationId) { res.status(404).json({ error: 'Mensagem não encontrada' }); return }

    if (mode === 'everyone') {
      if (message.sender_id !== userId) { res.status(403).json({ error: 'Só quem enviou pode apagar pra todos' }); return }
      const { error } = await supabaseAdmin
        .from('dm_messages')
        .update({ body: '', deleted_at: new Date().toISOString() })
        .eq('id', messageId)
      if (error) { res.status(500).json({ error: error.message }); return }
    } else {
      const { error } = await supabaseAdmin
        .from('dm_message_hidden_for')
        .upsert({ message_id: messageId, user_id: userId }, { onConflict: 'message_id,user_id' })
      if (error) { res.status(500).json({ error: error.message }); return }
    }

    res.json({ ok: true })
  } catch (e: any) {
    res.status(500).json({ error: e.message ?? 'Erro ao apagar mensagem' })
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

// ── POST /api/messages/conversations/:id/archive  { archived: boolean } ────────
router.post('/conversations/:id/archive', async (req: any, res: any) => {
  try {
    const userId = uid(req)
    const conversationId = Number(req.params.id)
    const conv = await getConversationOrThrow(conversationId, userId)
    if (!conv) { res.status(404).json({ error: 'Conversa não encontrada' }); return }
    const archived = !!req.body?.archived

    const { error } = await supabaseAdmin
      .from('dm_participants_state')
      .upsert(
        { conversation_id: conversationId, user_id: userId, archived_at: archived ? new Date().toISOString() : null },
        { onConflict: 'conversation_id,user_id' }
      )
    if (error) { res.status(500).json({ error: error.message }); return }
    res.json({ ok: true })
  } catch (e: any) {
    res.status(500).json({ error: e.message ?? 'Erro ao arquivar conversa' })
  }
})

// ── DELETE /api/messages/conversations/:id  (apagar/esconder pra mim) ──────────
// Só afeta a própria visão — a conversa e o histórico continuam intactos pro
// outro participante, mesmo padrão do "apagar pra mim" de mensagem individual.
router.delete('/conversations/:id', async (req: any, res: any) => {
  try {
    const userId = uid(req)
    const conversationId = Number(req.params.id)
    const conv = await getConversationOrThrow(conversationId, userId)
    if (!conv) { res.status(404).json({ error: 'Conversa não encontrada' }); return }

    const { error } = await supabaseAdmin
      .from('dm_participants_state')
      .upsert(
        { conversation_id: conversationId, user_id: userId, hidden_at: new Date().toISOString() },
        { onConflict: 'conversation_id,user_id' }
      )
    if (error) { res.status(500).json({ error: error.message }); return }
    res.json({ ok: true })
  } catch (e: any) {
    res.status(500).json({ error: e.message ?? 'Erro ao apagar conversa' })
  }
})

// ── POST /api/messages/conversations/:id/unread  (marcar como não lida) ────────
router.post('/conversations/:id/unread', async (req: any, res: any) => {
  try {
    const userId = uid(req)
    const conversationId = Number(req.params.id)
    const conv = await getConversationOrThrow(conversationId, userId)
    if (!conv) { res.status(404).json({ error: 'Conversa não encontrada' }); return }

    const { error } = await supabaseAdmin
      .from('dm_participants_state')
      .upsert(
        { conversation_id: conversationId, user_id: userId, last_read_at: '1970-01-01T00:00:00.000Z' },
        { onConflict: 'conversation_id,user_id' }
      )
    if (error) { res.status(500).json({ error: error.message }); return }
    res.json({ ok: true })
  } catch (e: any) {
    res.status(500).json({ error: e.message ?? 'Erro ao marcar como não lida' })
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

    // Lógica compartilhada com o perfil público — ver getFriendshipStatuses em people.ts.
    res.json({ statuses: await getFriendshipStatuses(userId, ids) })
  } catch (e: any) {
    res.status(500).json({ error: e.message ?? 'Erro ao buscar status de amizade' })
  }
})

export default router
