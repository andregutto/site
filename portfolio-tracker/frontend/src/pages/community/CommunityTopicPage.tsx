import { useState, useEffect } from 'react'
import type React from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { apiFetch } from '../../lib/api'
import { useI18n } from '../../contexts/I18nContext'
import { useAuth } from '../../contexts/AuthContext'
import { PageLoader } from '../../components/ArvoLoader'
import PostCard from './_shared/PostCard'
import { useFriendshipActions } from '../../hooks/useFriendshipActions'
import type { CommunityTopicDetail } from './types'

const OCRE = '#E8A020'

export default function CommunityTopicPage() {
  const { slug, topicId } = useParams<{ slug: string; topicId: string }>()
  const { t } = useI18n()
  const tc = (t as any).community
  const { user } = useAuth()
  const navigate = useNavigate()
  const [topic, setTopic] = useState<CommunityTopicDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [reply, setReply] = useState('')
  const [sending, setSending] = useState(false)
  // Amizade/mensagem — mecanismos compartilhados com a página de perfil (/u/:username)
  const { statuses: friendshipStatuses, loadStatuses, invite, message: messageAuthor } = useFriendshipActions()

  async function load() {
    if (!topicId) return
    setLoading(true)
    try {
      const res = await apiFetch<{ topic: CommunityTopicDetail }>(`/community/topics/${topicId}`)
      setTopic(res.topic)
      await loadStatuses(res.topic.posts.map(p => p.author.id), user?.id)
    } catch {
      setTopic(null)
    } finally {
      setLoading(false)
    }
  }

  async function inviteFriend(authorId: string) {
    const author = topic?.posts.find(p => p.author.id === authorId)?.author
    if (!author?.username) return
    await invite(authorId, author.username)
  }

  // Recarrega os dados do tópico sem acionar o PageLoader de tela cheia —
  // usado depois de like/edit/delete/reply pra não "piscar" a página inteira.
  async function reloadSilently() {
    if (!topicId) return
    try {
      const res = await apiFetch<{ topic: CommunityTopicDetail }>(`/community/topics/${topicId}`)
      setTopic(res.topic)
    } catch {
      // mantém o estado atual se a atualização silenciosa falhar
    }
  }

  useEffect(() => { load() }, [topicId])

  async function sendReply() {
    if (!reply.trim() || !topicId) return
    setSending(true)
    try {
      await apiFetch(`/community/topics/${topicId}/posts`, { method: 'POST', body: JSON.stringify({ body: reply.trim() }) })
      setReply('')
      await reloadSilently()
    } finally {
      setSending(false)
    }
  }

  async function likePost(postId: number) {
    const res = await apiFetch<{ like_count: number; liked_by_me: boolean }>(`/community/posts/${postId}/like`, { method: 'POST' })
    setTopic(prev => prev ? {
      ...prev,
      posts: prev.posts.map(p => p.id === postId ? { ...p, like_count: res.like_count, liked_by_me: res.liked_by_me } : p),
    } : prev)
  }

  async function editPost(postId: number, body: string) {
    const res = await apiFetch<{ post: { body: string; edited_at: string } }>(`/community/posts/${postId}`, { method: 'PATCH', body: JSON.stringify({ body }) })
    setTopic(prev => prev ? {
      ...prev,
      posts: prev.posts.map(p => p.id === postId ? { ...p, body: res.post.body, edited_at: res.post.edited_at } : p),
    } : prev)
  }

  async function deletePost(postId: number) {
    if (!confirm(tc?.confirmDeletePost ?? 'Apagar esta mensagem?')) return
    await apiFetch(`/community/posts/${postId}`, { method: 'DELETE' })
    const wasFirstPost = topic?.posts.find(p => p.id === postId)?.is_first_post
    if (wasFirstPost) {
      navigate(`/community/${slug}`)
    } else {
      setTopic(prev => prev ? { ...prev, posts: prev.posts.filter(p => p.id !== postId) } : prev)
    }
  }

  async function togglePin() {
    if (!topic) return
    await apiFetch(`/community/topics/${topic.id}`, { method: 'PATCH', body: JSON.stringify({ pinned: !topic.pinned }) })
    setTopic(prev => prev ? { ...prev, pinned: !prev.pinned } : prev)
  }

  async function toggleLock() {
    if (!topic) return
    await apiFetch(`/community/topics/${topic.id}`, { method: 'PATCH', body: JSON.stringify({ locked: !topic.locked }) })
    setTopic(prev => prev ? { ...prev, locked: !prev.locked } : prev)
  }

  async function deleteTopic() {
    if (!topic) return
    if (!confirm(tc?.confirmDeleteTopic ?? 'Apagar este tópico e todas as respostas?')) return
    await apiFetch(`/community/topics/${topic.id}`, { method: 'DELETE' })
    navigate(`/community/${slug}`)
  }

  if (loading) return <PageLoader />
  if (!topic) return <p style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 14, color: 'var(--arvo-fg-soft)', padding: '40px 0', textAlign: 'center' }}>{tc?.notFound ?? 'Tópico não encontrado.'}</p>

  const canModifyTopic = topic.is_own || topic.is_admin_viewer

  return (
    <div className="space-y-5">
      <Link to={`/community/${slug}`} style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 13, color: 'var(--arvo-fg-soft)', textDecoration: 'none' }}>
        ← {tc?.backToCategory ?? 'Voltar para a categoria'}
      </Link>

      <div>
        <div className="flex items-center gap-2 flex-wrap">
          {topic.pinned && <span style={{ fontSize: 12, background: 'rgba(232,160,32,0.12)', color: OCRE, padding: '2px 8px', borderRadius: 999, fontFamily: 'var(--arvo-font-body)' }}>{tc?.pinned ?? 'Fixado'}</span>}
          {topic.locked && <span style={{ fontSize: 12, background: 'var(--arvo-hover-bg)', color: 'var(--arvo-fg-soft)', padding: '2px 8px', borderRadius: 999, fontFamily: 'var(--arvo-font-body)' }}>{tc?.locked ?? 'Trancado'}</span>}
        </div>
        <h1 style={{ fontFamily: 'var(--arvo-font-display)', fontSize: 22, color: 'var(--arvo-fg)', marginTop: 6 }}>{topic.title}</h1>
      </div>

      {topic.linked_trip && (
        // Link (SPA, mesma janela) em vez de <a target="_blank"> — no PWA em modo
        // standalone, target="_blank" abre em tela cheia sem histórico de volta
        // (o "app" só tem uma janela), então o usuário ficava preso lá.
        <Link
          to={`/trip/${topic.linked_trip.share_token}`}
          className="flex items-center gap-3 rounded-[12px] p-3"
          style={{ background: 'var(--arvo-surface)', border: '1px solid var(--arvo-border)', textDecoration: 'none' }}
        >
          {topic.linked_trip.cover_image_url && (
            <img src={topic.linked_trip.cover_image_url} alt="" style={{ width: 48, height: 48, borderRadius: 8, objectFit: 'cover' }} />
          )}
          <div className="flex-1 min-w-0">
            <p style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 12, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--arvo-fg-soft)' }}>
              {tc?.linkedTripCard ?? 'Viagem vinculada'}
            </p>
            <p style={{ fontFamily: 'var(--arvo-font-display)', fontSize: 14, color: 'var(--arvo-fg)' }}>
              {topic.linked_trip.title}{topic.linked_trip.destination ? ` · ${topic.linked_trip.destination}` : ''}
            </p>
          </div>
          <span style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 13, color: OCRE, flexShrink: 0 }}>{tc?.viewTrip ?? 'Ver viagem'} →</span>
        </Link>
      )}

      {topic.is_admin_viewer && (
        <div className="flex items-center gap-2 flex-wrap">
          <button onClick={togglePin} style={adminBtnStyle}>{topic.pinned ? (tc?.adminUnpin ?? 'Desafixar') : (tc?.adminPin ?? 'Fixar')}</button>
          <button onClick={toggleLock} style={adminBtnStyle}>{topic.locked ? (tc?.adminUnlock ?? 'Destrancar') : (tc?.adminLock ?? 'Trancar')}</button>
          <button onClick={deleteTopic} style={{ ...adminBtnStyle, color: '#D63B2F' }}>{tc?.adminDeleteTopic ?? 'Apagar tópico (admin)'}</button>
        </div>
      )}
      {!topic.is_admin_viewer && canModifyTopic && (
        <div className="flex items-center gap-2 flex-wrap">
          <button onClick={deleteTopic} style={{ ...adminBtnStyle, color: '#D63B2F' }}>{tc?.delete ?? 'Apagar'}</button>
        </div>
      )}

      <div className="space-y-3">
        {topic.posts.map(post => (
          <PostCard
            key={post.id}
            post={post}
            currentUserId={user?.id}
            isAdmin={topic.is_admin_viewer}
            onLike={likePost}
            onEdit={editPost}
            onDelete={deletePost}
            friendshipStatus={friendshipStatuses[post.author.id]}
            onInvite={inviteFriend}
            onMessage={messageAuthor}
          />
        ))}
      </div>

      {topic.locked && !topic.is_admin_viewer ? (
        <p style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 14, color: 'var(--arvo-fg-soft)', textAlign: 'center', padding: '16px 0' }}>
          {tc?.lockedNotice ?? 'Este tópico está trancado. Só o admin pode responder.'}
        </p>
      ) : (
        <div style={{ background: 'var(--arvo-surface)', border: '1px solid var(--arvo-border)', borderRadius: 14, padding: '14px 16px' }}>
          <textarea
            value={reply}
            onChange={e => setReply(e.target.value)}
            placeholder={tc?.replyPlaceholder ?? 'Escreva uma resposta...'}
            rows={3}
            style={{ width: '100%', fontFamily: 'var(--arvo-font-body)', fontSize: 14.5, color: 'var(--arvo-fg)', background: 'var(--arvo-bg)', border: '1px solid var(--arvo-border)', borderRadius: 10, padding: '10px 12px', resize: 'vertical', lineHeight: 1.6 }}
          />
          <div className="flex justify-end mt-2">
            <button
              onClick={sendReply}
              disabled={sending || !reply.trim()}
              style={{
                fontFamily: 'var(--arvo-font-body)', fontSize: 12, letterSpacing: '0.08em', textTransform: 'uppercase',
                padding: '9px 16px', borderRadius: 10, border: 'none', cursor: 'pointer',
                background: OCRE, color: '#1a1200', opacity: sending || !reply.trim() ? 0.5 : 1,
              }}
            >{sending ? (tc?.replying ?? 'Enviando...') : (tc?.reply ?? 'Responder')}</button>
          </div>
        </div>
      )}
    </div>
  )
}

const adminBtnStyle: React.CSSProperties = {
  fontFamily: 'var(--arvo-font-body)', fontSize: 12, letterSpacing: '0.06em', textTransform: 'uppercase',
  padding: '6px 12px', borderRadius: 8, border: '1px solid var(--arvo-border)', background: 'transparent',
  color: 'var(--arvo-fg-soft)', cursor: 'pointer',
}
