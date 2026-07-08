import { useEffect, useState } from 'react'
import type React from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { apiFetch } from '../lib/api'
import { useI18n } from '../contexts/I18nContext'
import { useAuth } from '../contexts/AuthContext'
import { PageLoader } from '../components/ArvoLoader'
import Avatar from './voyage/_shared/Avatar'
import TripCard from './voyage/_shared/TripCard'
import { tripDurationLabel } from './community/_shared/tripHelpers'
import { useFriendshipActions, type FriendshipStatus } from '../hooks/useFriendshipActions'
import type { CommunityTripCard } from './community/types'

const OCRE = '#E8A020'

// Página de perfil público (/u/:username) — diferente da ProfilePage
// (configurações do próprio usuário em /profile). Mostra o cabeçalho do
// membro, as viagens que ele disponibilizou pra comunidade (mesmos cards da
// galeria) e os tópicos recentes dele. Amizade/mensagem reusam os mesmos
// mecanismos do PostCard da comunidade (useFriendshipActions).

interface ProfileTopic {
  id: number
  title: string
  category_slug: string
  created_at: string
  reply_count: number
  last_post_at: string
}

interface UserProfileData {
  profile: {
    id: string
    // null quando o perfil foi aberto por UUID e o usuário não tem @handle
    username: string | null
    name: string
    avatar_url: string | null
    member_since: string | null
    is_admin: boolean
    bio: string | null
    // false só chega pro dono/admin — visitante de perfil desativado recebe 404
    public_profile: boolean
  }
  friendship_status: FriendshipStatus
  topics: ProfileTopic[]
  trips: CommunityTripCard[]
}

const BIO_MAX = 280

function memberSinceLabel(iso: string | null, locale: string): string | null {
  if (!iso) return null
  return new Date(iso).toLocaleDateString(
    locale === 'pt' ? 'pt-BR' : locale === 'fr' ? 'fr-FR' : 'en-US',
    { month: 'long', year: 'numeric' }
  )
}

function shortDate(iso: string, locale: string): string {
  return new Date(iso).toLocaleDateString(
    locale === 'pt' ? 'pt-BR' : locale === 'fr' ? 'fr-FR' : 'en-US',
    { day: '2-digit', month: 'short', year: 'numeric' }
  )
}

export default function UserProfilePage() {
  const { username } = useParams<{ username: string }>()
  const { t, locale } = useI18n()
  const tc = (t as any).community
  const tp = (t as any).userProfile ?? {}
  const { user } = useAuth()
  const navigate = useNavigate()
  const [data, setData] = useState<UserProfileData | null>(null)
  const [loading, setLoading] = useState(true)
  const { statuses, invite, message } = useFriendshipActions()

  // Edição inline da bio (só quando o perfil é o do próprio usuário)
  const [editingBio, setEditingBio] = useState(false)
  const [bioDraft, setBioDraft] = useState('')
  const [bioSaving, setBioSaving] = useState(false)

  useEffect(() => {
    if (!username) return
    setLoading(true)
    setData(null)
    setEditingBio(false)
    apiFetch<UserProfileData>(`/community/users/${encodeURIComponent(username)}`)
      .then(setData)
      .catch(() => setData(null))
      .finally(() => setLoading(false))
  }, [username])

  async function handleSaveBio() {
    if (bioSaving || !data) return
    setBioSaving(true)
    try {
      const trimmed = bioDraft.trim()
      await apiFetch('/community/users/me', { method: 'PATCH', body: JSON.stringify({ bio: trimmed }) })
      setData({ ...data, profile: { ...data.profile, bio: trimmed || null } })
      setEditingBio(false)
    } catch {
      // Mantém o textarea aberto pro usuário tentar de novo
    } finally {
      setBioSaving(false)
    }
  }

  if (loading) return <PageLoader />

  // Estado "perfil indisponível" — cobre 404 (inexistente ou desativado pelo
  // dono, mesma resposta de propósito) e erros de rede, sem tela quebrada
  if (!data) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, padding: '72px 16px', textAlign: 'center' }}>
        <div
          aria-hidden="true"
          style={{
            width: 56, height: 56, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'var(--arvo-surface)', border: '1px solid var(--arvo-border)', marginBottom: 8,
          }}
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--arvo-fg-faint)" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.5 20.1a7.5 7.5 0 0115 0M3 3l18 18" />
          </svg>
        </div>
        <p style={{ fontFamily: 'var(--arvo-font-display)', fontSize: 18, letterSpacing: '0.04em', color: 'var(--arvo-fg)' }}>
          {tp.unavailableTitle ?? 'Perfil indisponível'}
        </p>
        <p style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 14, color: 'var(--arvo-fg-muted)', maxWidth: 340 }}>
          {tp.unavailableBody ?? 'Este perfil não existe ou não está mais disponível.'}
        </p>
        <Link to="/community" style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 14, color: OCRE, textDecoration: 'none', marginTop: 10 }}>
          {tc?.title ?? 'Comunidade'} →
        </Link>
      </div>
    )
  }

  const { profile, topics, trips } = data
  const isSelf = profile.id === user?.id || data.friendship_status === 'self'
  // Otimista do hook (convite recém-enviado) tem prioridade sobre o status do load
  const status: FriendshipStatus = statuses[profile.id] ?? data.friendship_status
  const since = memberSinceLabel(profile.member_since, locale)

  const actionBtnStyle: React.CSSProperties = {
    fontFamily: 'var(--arvo-font-body)', fontSize: 13, letterSpacing: '0.04em',
    padding: '8px 18px', borderRadius: 999, cursor: 'pointer', whiteSpace: 'nowrap',
  }

  return (
    <div className="space-y-7 max-w-4xl mx-auto">
      {/* Cabeçalho */}
      <div style={{ background: 'var(--arvo-surface)', border: '1px solid var(--arvo-border)', borderRadius: 16, padding: '22px 24px' }}>
        {/* Aviso de perfil desativado — só o dono (e admin) chega até aqui com
            public_profile = false; visitante recebe o 404 lá em cima */}
        {!profile.public_profile && (
          <div
            style={{
              display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16,
              fontFamily: 'var(--arvo-font-body)', fontSize: 13, color: 'var(--arvo-fg-muted)',
              border: '1px dashed var(--arvo-border)', borderRadius: 10, padding: '8px 12px',
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} style={{ flexShrink: 0 }}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88" />
            </svg>
            {isSelf ? (tp.disabledNotice ?? 'Seu perfil está desativado') : (tp.disabledAdminNotice ?? 'Perfil desativado (visível só para admins)')}
          </div>
        )}

        <div className="flex items-center gap-4">
          <Avatar name={profile.name} avatarUrl={profile.avatar_url ?? undefined} size={72} />
          <div className="flex-1 min-w-0">
            {/* Linha do nome: nome trunca com ellipsis, ações à direita nunca quebram */}
            <div className="flex items-center gap-2 min-w-0">
              <div className="flex items-center gap-2 min-w-0 flex-1">
                <h1
                  className="truncate"
                  style={{ fontFamily: 'var(--arvo-font-display)', fontSize: 24, color: 'var(--arvo-fg)', minWidth: 0 }}
                >
                  {profile.name}
                </h1>
                {profile.is_admin && (
                  <span
                    title={tp.adminBadge ?? 'Admin da comunidade'}
                    style={{
                      display: 'inline-flex', alignItems: 'center', gap: 5, flexShrink: 0,
                      fontFamily: 'var(--arvo-font-body)', fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase',
                      color: OCRE, background: 'rgba(232,160,32,0.10)', border: '1px solid rgba(232,160,32,0.25)',
                      borderRadius: 999, padding: '3px 10px',
                    }}
                  >
                    <img src="/brand/logo/arvo-symbol-gold.svg" width="10" height="10" alt="" />
                    {tp.adminBadge ?? 'Admin'}
                  </span>
                )}
              </div>

              <div className="flex items-center gap-2" style={{ flexShrink: 0 }}>
                {isSelf ? (
                  // Só-ícone pra caber na linha do nome no mobile — o rótulo vive no title/aria
                  <Link
                    to="/profile"
                    title={tp.editProfile ?? 'Configurações do perfil'}
                    aria-label={tp.editProfile ?? 'Configurações do perfil'}
                    style={{
                      width: 36, height: 36, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                      borderRadius: 999, border: '1px solid var(--arvo-border)', color: 'var(--arvo-fg-soft)',
                      background: 'transparent', textDecoration: 'none', flexShrink: 0,
                    }}
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.24-.438.613-.431.992a6.759 6.759 0 010 .255c-.007.378.138.75.43.99l1.005.828c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.992a6.932 6.932 0 010-.255c.007-.378-.138-.75-.43-.99l-1.004-.828a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.28z" />
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                  </Link>
                ) : (
                  <>
                    {/* Convite por @ exige handle — sem username o botão não aparece */}
                    {status === 'none' && profile.username && (
                      <button
                        type="button"
                        onClick={() => invite(profile.id, profile.username!)}
                        style={{ ...actionBtnStyle, border: 'none', background: OCRE, color: '#1a1200' }}
                      >
                        {tp.addFriend ?? 'Adicionar amigo'}
                      </button>
                    )}
                    {status === 'pending' && (
                      <span style={{ ...actionBtnStyle, cursor: 'default', border: '1px solid var(--arvo-border)', color: 'var(--arvo-fg-faint)' }}>
                        {tc?.inviteSent ?? 'Convite enviado'}
                      </span>
                    )}
                    {status === 'active' && (
                      // Só o ícone (mesmo do PostCard da comunidade) — mensagens exigem
                      // amizade ativa, então o botão só existe quando dá pra conversar
                      <button
                        type="button"
                        onClick={() => message(profile.id)}
                        title={tc?.message ?? 'Mensagem'}
                        aria-label={tc?.message ?? 'Mensagem'}
                        style={{
                          width: 36, height: 36, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                          borderRadius: 999, border: 'none', background: OCRE, color: '#1a1200', cursor: 'pointer', flexShrink: 0,
                        }}
                      >
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5" />
                        </svg>
                      </button>
                    )}
                  </>
                )}
              </div>
            </div>

            {profile.username && (
              <p style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 14, color: 'var(--arvo-fg-soft)', marginTop: 2 }}>@{profile.username}</p>
            )}

            {/* Bio — visitante só vê se existir; o dono edita inline (lápis / placeholder) */}
            {!editingBio && profile.bio && (
              <p style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 14, color: 'var(--arvo-fg-soft)', marginTop: 6, lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>
                {profile.bio}
                {isSelf && (
                  <button
                    type="button"
                    onClick={() => { setBioDraft(profile.bio ?? ''); setEditingBio(true) }}
                    title={tp.editBio ?? 'Editar bio'}
                    aria-label={tp.editBio ?? 'Editar bio'}
                    style={{ background: 'none', border: 'none', padding: 0, marginLeft: 8, cursor: 'pointer', color: 'var(--arvo-fg-faint)', verticalAlign: 'baseline' }}
                  >
                    <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.4}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M11.3 2.3a1 1 0 011.4 0l1 1a1 1 0 010 1.4L5 13.4l-3 .6.6-3z" />
                    </svg>
                  </button>
                )}
              </p>
            )}
            {!editingBio && !profile.bio && isSelf && (
              <button
                type="button"
                onClick={() => { setBioDraft(''); setEditingBio(true) }}
                style={{
                  marginTop: 6, display: 'inline-flex', alignItems: 'center', gap: 6,
                  fontFamily: 'var(--arvo-font-body)', fontSize: 13, color: 'var(--arvo-fg-faint)',
                  background: 'none', border: '1px dashed var(--arvo-border)', borderRadius: 999,
                  padding: '4px 12px', cursor: 'pointer',
                }}
              >
                <svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.4}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M11.3 2.3a1 1 0 011.4 0l1 1a1 1 0 010 1.4L5 13.4l-3 .6.6-3z" />
                </svg>
                {tp.addBio ?? 'Adicionar bio'}
              </button>
            )}
            {editingBio && (
              <div style={{ marginTop: 6 }}>
                {/* fontSize 15 aqui, mas o index.css força 16px no mobile (regra anti-zoom do iOS) */}
                <textarea
                  autoFocus
                  value={bioDraft}
                  onChange={e => setBioDraft(e.target.value)}
                  maxLength={BIO_MAX}
                  rows={3}
                  placeholder={tp.bioPlaceholder ?? 'Conte um pouco sobre você'}
                  style={{
                    width: '100%', fontFamily: 'var(--arvo-font-body)', fontSize: 15, lineHeight: 1.5,
                    color: 'var(--arvo-fg)', background: 'var(--arvo-surface)',
                    border: '1px solid var(--arvo-border)', borderRadius: 10, padding: '8px 12px',
                    resize: 'vertical', outline: 'none',
                  }}
                />
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 4 }}>
                  <span style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 12, color: 'var(--arvo-fg-faint)' }}>
                    {[...bioDraft].length}/{BIO_MAX}
                  </span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <button
                      type="button"
                      onClick={() => { setEditingBio(false); setBioDraft('') }}
                      style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontFamily: 'var(--arvo-font-body)', fontSize: 13, color: 'var(--arvo-fg-soft)' }}
                    >
                      {t.common.cancel}
                    </button>
                    <button
                      type="button"
                      onClick={handleSaveBio}
                      disabled={bioSaving}
                      style={{
                        fontFamily: 'var(--arvo-font-body)', fontSize: 13, letterSpacing: '0.04em',
                        padding: '5px 16px', borderRadius: 999, border: 'none', cursor: 'pointer',
                        background: OCRE, color: '#1a1200', opacity: bioSaving ? 0.6 : 1,
                      }}
                    >
                      {bioSaving ? '…' : t.common.save}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {since && (
              <p style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 13, color: 'var(--arvo-fg-faint)', marginTop: 4 }}>
                {(tp.memberSince ?? 'Membro desde {date}').replace('{date}', since)}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Viagens públicas — mesmos cards da galeria da Comunidade */}
      <div>
        <h2 style={{ fontFamily: 'var(--arvo-font-display)', fontSize: 17, color: 'var(--arvo-fg)', marginBottom: 10 }}>
          {tp.publicTrips ?? 'Viagens compartilhadas'}
        </h2>
        {trips.length === 0 ? (
          <p style={{ fontFamily: 'var(--arvo-font-serif)', fontStyle: 'italic', color: 'var(--arvo-gold)', fontSize: 14 }}>
            {tp.noTrips ?? 'Nenhuma viagem compartilhada com a comunidade.'}
          </p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {trips.map((trip, i) => (
              <div key={trip.id} style={{ animation: 'fadeUp 320ms cubic-bezier(0.22,0.61,0.36,1) both', animationDelay: `${i * 40}ms` }}>
                <TripCard
                  trip={trip}
                  t={t}
                  showCost={false}
                  durationLabel={tripDurationLabel(trip, tc)}
                  onClick={() => navigate(`/voyage/shared/${trip.id}`)}
                />
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Tópicos recentes na comunidade */}
      <div>
        <h2 style={{ fontFamily: 'var(--arvo-font-display)', fontSize: 17, color: 'var(--arvo-fg)', marginBottom: 10 }}>
          {tp.recentTopics ?? 'Tópicos recentes'}
        </h2>
        {topics.length === 0 ? (
          <p style={{ fontFamily: 'var(--arvo-font-serif)', fontStyle: 'italic', color: 'var(--arvo-gold)', fontSize: 14 }}>
            {tp.noTopics ?? 'Nenhum tópico criado ainda.'}
          </p>
        ) : (
          <div className="space-y-2">
            {topics.map(topic => (
              <button
                key={topic.id}
                onClick={() => navigate(`/community/${topic.category_slug}/${topic.id}`)}
                className="w-full text-left flex items-center gap-3 rounded-[12px] p-3"
                style={{ background: 'var(--arvo-surface)', border: '1px solid var(--arvo-border)', cursor: 'pointer' }}
              >
                <div className="flex-1 min-w-0">
                  <p style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 14, color: 'var(--arvo-fg)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {topic.title}
                  </p>
                  <p style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 13, color: 'var(--arvo-fg-muted)', marginTop: 2 }}>
                    {shortDate(topic.created_at, locale)}
                  </p>
                </div>
                <span className="hidden sm:inline-block" style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 10, letterSpacing: '0.08em', textTransform: 'uppercase', color: OCRE, background: 'rgba(232,160,32,0.10)', borderRadius: 999, padding: '3px 10px', flexShrink: 0 }}>
                  {tc?.cat?.[topic.category_slug] ?? topic.category_slug}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
