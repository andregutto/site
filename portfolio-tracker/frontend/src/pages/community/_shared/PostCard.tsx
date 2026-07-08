import { useState } from 'react'
import Avatar from '../../voyage/_shared/Avatar'
import ProfileLink from '../../../components/ProfileLink'
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
  // Edit is owner-only; admins moderate by deleting, never by rewriting.
  const canEdit = isOwn
  const canDelete = isOwn || isAdmin

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
        {/* Avatar e nome levam pro perfil público quando o autor tem @username */}
        <ProfileLink username={post.author.username}>
          <Avatar name={post.author.name} avatarUrl={post.author.avatar_url} size={32} />
        </ProfileLink>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <ProfileLink username={post.author.username}>
              <span style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 14, fontWeight: 600, color: 'var(--arvo-fg)' }}>
                {post.author.name}
              </span>
            </ProfileLink>
            {post.author.is_admin && (
              <span title="Admin" style={{ display: 'inline-flex', alignItems: 'center', flexShrink: 0, cursor: 'default' }}>
                <img src="/brand/logo/arvo-symbol-gold.svg" width="10" height="10" alt="Admin" />
              </span>
            )}
            {post.author.username && (
              <ProfileLink username={post.author.username}>
                <span style={{ fontSize: 13, color: 'var(--arvo-fg-soft)' }}>@{post.author.username}</span>
              </ProfileLink>
            )}
            <span style={{ fontSize: 12, color: 'var(--arvo-fg-faint)' }}>
              {formatTimestamp(post.created_at, locale)}
              {post.edited_at ? ` · ${tc.edited ?? '(editado)'}` : ''}
            </span>
            {friendshipStatus === 'active' && onMessage && (
              <button
                onClick={() => onMessage(post.author.id)}
                title={tc.message ?? 'Mensagem'}
                style={{ display: 'inline-flex', alignItems: 'center', color: 'var(--arvo-fg-soft)', background: 'none', border: 'none', padding: 2, cursor: 'pointer', lineHeight: 0 }}
                onMouseEnter={e => (e.currentTarget.style.color = 'var(--arvo-fg)')}
                onMouseLeave={e => (e.currentTarget.style.color = 'var(--arvo-fg-soft)')}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5" />
                </svg>
              </button>
            )}
            {friendshipStatus === 'none' && onInvite && post.author.username && (
              <button
                onClick={() => onInvite(post.author.id)}
                style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 12, letterSpacing: '0.04em', color: 'var(--arvo-fg-soft)', background: 'none', border: '1px solid var(--arvo-border)', borderRadius: 999, padding: '2px 10px', cursor: 'pointer' }}
              >{tc.addFriend ?? '+ Amizade'}</button>
            )}
            {friendshipStatus === 'pending' && (
              <span style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 12, color: 'var(--arvo-fg-faint)', border: '1px solid var(--arvo-border)', borderRadius: 999, padding: '2px 10px' }}>
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
                  width: '100%', fontFamily: 'var(--arvo-font-body)', fontSize: 14.5, color: 'var(--arvo-fg)',
                  background: 'var(--arvo-bg)', border: '1px solid var(--arvo-border)', borderRadius: 10, padding: '10px 12px',
                  resize: 'vertical', lineHeight: 1.6,
                }}
              />
              <div className="flex items-center gap-2 mt-2">
                <button
                  onClick={save}
                  disabled={saving || !draft.trim()}
                  style={{
                    fontFamily: 'var(--arvo-font-body)', fontSize: 12, letterSpacing: '0.08em', textTransform: 'uppercase',
                    padding: '7px 14px', borderRadius: 8, border: 'none', cursor: 'pointer',
                    background: GOLD, color: '#1a1200', opacity: saving || !draft.trim() ? 0.5 : 1,
                  }}
                >{saving ? (tc.saving ?? 'Salvando...') : (tc.save ?? 'Salvar')}</button>
                <button
                  onClick={() => { setEditing(false); setDraft(post.body) }}
                  style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 12, letterSpacing: '0.08em', textTransform: 'uppercase', padding: '7px 14px', borderRadius: 8, border: '1px solid var(--arvo-border)', background: 'transparent', color: 'var(--arvo-fg-soft)', cursor: 'pointer' }}
                >{tc.cancel ?? 'Cancelar'}</button>
              </div>
            </div>
          ) : (
            <p style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 14.5, color: 'var(--arvo-fg)', lineHeight: 1.7, marginTop: 8, whiteSpace: 'pre-wrap' }}>
              {linkifyText(post.body)}
            </p>
          )}

          {!editing && (
            <div className="flex items-center gap-3 mt-3">
              <button
                onClick={() => onLike(post.id)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 5, fontFamily: 'var(--arvo-font-body)', fontSize: 13,
                  color: post.liked_by_me ? '#D63B2F' : 'var(--arvo-fg-soft)', background: 'none', border: 'none', cursor: 'pointer', padding: '2px 4px',
                }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill={post.liked_by_me ? '#D63B2F' : 'none'} stroke="currentColor" strokeWidth={1.8}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
                </svg>
                {post.like_count > 0 ? post.like_count : ''}
              </button>
              {!post.is_first_post && (
                <>
                  {canEdit && <button onClick={() => setEditing(true)} title={tc.edit ?? 'Editar'} style={{ display: 'inline-flex', alignItems: 'center', color: 'var(--arvo-fg-soft)', background: 'none', border: 'none', cursor: 'pointer', padding: '2px 4px', lineHeight: 0 }}>
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L6.832 19.82a4.5 4.5 0 01-1.897 1.13l-2.685.8.8-2.685a4.5 4.5 0 011.13-1.897L16.863 4.487zm0 0L19.5 7.125" />
                    </svg>
                  </button>}
                  {canDelete && <button onClick={() => onDelete(post.id)} title={tc.delete ?? 'Apagar'} style={{ display: 'inline-flex', alignItems: 'center', color: 'var(--arvo-fg-soft)', background: 'none', border: 'none', cursor: 'pointer', padding: '2px 4px', lineHeight: 0 }}
                    onMouseEnter={e => (e.currentTarget.style.color = '#D63B2F')}
                    onMouseLeave={e => (e.currentTarget.style.color = 'var(--arvo-fg-soft)')}
                  >
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                    </svg>
                  </button>}
                </>
              )}
              {canEdit && post.is_first_post && (
                <button onClick={() => setEditing(true)} title={tc.edit ?? 'Editar'} style={{ display: 'inline-flex', alignItems: 'center', color: 'var(--arvo-fg-soft)', background: 'none', border: 'none', cursor: 'pointer', padding: '2px 4px', lineHeight: 0 }}>
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L6.832 19.82a4.5 4.5 0 01-1.897 1.13l-2.685.8.8-2.685a4.5 4.5 0 011.13-1.897L16.863 4.487zm0 0L19.5 7.125" />
                    </svg>
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
