import { useState } from 'react'
import Avatar from '../../voyage/_shared/Avatar'
import { useI18n } from '../../../contexts/I18nContext'
import { formatTimestamp } from '../../../lib/notifications'
import { linkifyText } from './linkify'
import type { CommunityPost } from '../types'

const GOLD = '#E8A020'

interface PostCardProps {
  post: CommunityPost
  currentUserId?: string
  isAdmin: boolean
  onLike: (postId: number) => void
  onEdit: (postId: number, body: string) => Promise<void>
  onDelete: (postId: number) => void
  friendshipStatus?: 'self' | 'active' | 'pending' | 'none'
  onInvite?: (authorId: string) => void
  onMessage?: (authorId: string) => void
}

export default function PostCard({ post, currentUserId, isAdmin, onLike, onEdit, onDelete, friendshipStatus, onInvite, onMessage }: PostCardProps) {
  const { t, locale } = useI18n()
  const tc = (t as any).community ?? {}
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(post.body)
  const [saving, setSaving] = useState(false)

  const isOwn = post.author.id === currentUserId
  const canModify = isOwn || isAdmin

  async function save() {
    if (!draft.trim()) return
    setSaving(true)
    try {
      await onEdit(post.id, draft.trim())
      setEditing(false)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div style={{ background: 'var(--arvo-surface)', border: '1px solid var(--arvo-border)', borderRadius: 14, padding: '16px 18px' }}>
      <div className="flex items-start gap-3">
        <Avatar name={post.author.name} avatarUrl={post.author.avatar_url} size={32} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 13, fontWeight: 600, color: 'var(--arvo-fg)' }}>
              {post.author.name}
            </span>
            {post.author.username && (
              <span style={{ fontSize: 12, color: 'var(--arvo-fg-soft)' }}>@{post.author.username}</span>
            )}
            <span style={{ fontSize: 11, color: 'var(--arvo-fg-faint)' }}>
              {formatTimestamp(post.created_at, locale)}
              {post.edited_at ? ` · ${tc.edited ?? '(editado)'}` : ''}
            </span>
            {friendshipStatus === 'active' && onMessage && (
              <button
                onClick={() => onMessage(post.author.id)}
                style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 11, letterSpacing: '0.04em', color: GOLD, background: 'none', border: `1px solid ${GOLD}`, borderRadius: 999, padding: '2px 10px', cursor: 'pointer' }}
              >{tc.message ?? 'Mensagem'}</button>
            )}
            {friendshipStatus === 'none' && onInvite && post.author.username && (
              <button
                onClick={() => onInvite(post.author.id)}
                style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 11, letterSpacing: '0.04em', color: 'var(--arvo-fg-soft)', background: 'none', border: '1px solid var(--arvo-border)', borderRadius: 999, padding: '2px 10px', cursor: 'pointer' }}
              >{tc.addFriend ?? '+ Amizade'}</button>
            )}
            {friendshipStatus === 'pending' && (
              <span style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 11, color: 'var(--arvo-fg-faint)', border: '1px solid var(--arvo-border)', borderRadius: 999, padding: '2px 10px' }}>
                {tc.inviteSent ?? 'Convite enviado'}
              </span>
            )}
          </div>

          {editing ? (
            <div className="mt-2">
              <textarea
                value={draft}
                onChange={e => setDraft(e.target.value)}
                rows={4}
                style={{
                  width: '100%', fontFamily: 'var(--arvo-font-body)', fontSize: 13.5, color: 'var(--arvo-fg)',
                  background: 'var(--arvo-bg)', border: '1px solid var(--arvo-border)', borderRadius: 10, padding: '10px 12px',
                  resize: 'vertical', lineHeight: 1.6,
                }}
              />
              <div className="flex items-center gap-2 mt-2">
                <button
                  onClick={save}
                  disabled={saving || !draft.trim()}
                  style={{
                    fontFamily: 'var(--arvo-font-body)', fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase',
                    padding: '7px 14px', borderRadius: 8, border: 'none', cursor: 'pointer',
                    background: GOLD, color: '#1a1200', opacity: saving || !draft.trim() ? 0.5 : 1,
                  }}
                >{saving ? (tc.saving ?? 'Salvando...') : (tc.save ?? 'Salvar')}</button>
                <button
                  onClick={() => { setEditing(false); setDraft(post.body) }}
                  style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase', padding: '7px 14px', borderRadius: 8, border: '1px solid var(--arvo-border)', background: 'transparent', color: 'var(--arvo-fg-soft)', cursor: 'pointer' }}
                >{tc.cancel ?? 'Cancelar'}</button>
              </div>
            </div>
          ) : (
            <p style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 13.5, color: 'var(--arvo-fg)', lineHeight: 1.7, marginTop: 8, whiteSpace: 'pre-wrap' }}>
              {linkifyText(post.body)}
            </p>
          )}

          {!editing && (
            <div className="flex items-center gap-3 mt-3">
              <button
                onClick={() => onLike(post.id)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 5, fontFamily: 'var(--arvo-font-body)', fontSize: 12,
                  color: post.liked_by_me ? GOLD : 'var(--arvo-fg-soft)', background: 'none', border: 'none', cursor: 'pointer', padding: '2px 4px',
                }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill={post.liked_by_me ? GOLD : 'none'} stroke="currentColor" strokeWidth={1.8}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
                </svg>
                {post.like_count > 0 ? post.like_count : ''}
              </button>
              {canModify && !post.is_first_post && (
                <>
                  <button onClick={() => setEditing(true)} style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 12, color: 'var(--arvo-fg-soft)', background: 'none', border: 'none', cursor: 'pointer', padding: '2px 4px' }}>
                    {tc.edit ?? 'Editar'}
                  </button>
                  <button onClick={() => onDelete(post.id)} style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 12, color: 'var(--arvo-red, #D63B2F)', background: 'none', border: 'none', cursor: 'pointer', padding: '2px 4px' }}>
                    {tc.delete ?? 'Apagar'}
                  </button>
                </>
              )}
              {canModify && post.is_first_post && (
                <button onClick={() => setEditing(true)} style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 12, color: 'var(--arvo-fg-soft)', background: 'none', border: 'none', cursor: 'pointer', padding: '2px 4px' }}>
                  {tc.edit ?? 'Editar'}
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
