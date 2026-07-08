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
  }
  friendship_status: FriendshipStatus
  topics: ProfileTopic[]
  trips: CommunityTripCard[]
}

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

  useEffect(() => {
    if (!username) return
    setLoading(true)
    setData(null)
    apiFetch<UserProfileData>(`/community/users/${encodeURIComponent(username)}`)
      .then(setData)
      .catch(() => setData(null))
      .finally(() => setLoading(false))
  }, [username])

  if (loading) return <PageLoader />

  if (!data) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, padding: '64px 16px' }}>
        <p style={{ fontFamily: 'var(--arvo-font-display)', fontSize: 16, letterSpacing: '0.06em', color: 'var(--arvo-fg-muted)' }}>
          {tp.notFound ?? 'Perfil não encontrado'}
        </p>
        <Link to="/community" style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 14, color: OCRE, textDecoration: 'none' }}>
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
        <div className="flex items-center gap-4 flex-wrap">
          <Avatar name={profile.name} avatarUrl={profile.avatar_url ?? undefined} size={72} />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 style={{ fontFamily: 'var(--arvo-font-display)', fontSize: 24, color: 'var(--arvo-fg)' }}>{profile.name}</h1>
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
            {profile.username && (
              <p style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 14, color: 'var(--arvo-fg-soft)', marginTop: 2 }}>@{profile.username}</p>
            )}
            {since && (
              <p style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 13, color: 'var(--arvo-fg-faint)', marginTop: 4 }}>
                {(tp.memberSince ?? 'Membro desde {date}').replace('{date}', since)}
              </p>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap" style={{ marginTop: 18 }}>
          {isSelf ? (
            <Link
              to="/profile"
              style={{ ...actionBtnStyle, border: '1px solid var(--arvo-border)', color: 'var(--arvo-fg-soft)', background: 'transparent', textDecoration: 'none' }}
            >
              {tp.editProfile ?? 'Configurações do perfil'}
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
