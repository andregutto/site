import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { apiFetch } from '../../lib/api'
import { useI18n } from '../../contexts/I18nContext'
import { PageLoader } from '../../components/ArvoLoader'
import { Eyebrow, SearchBox } from '../../components/ui'
import Avatar from '../voyage/_shared/Avatar'
import TripCard from '../voyage/_shared/TripCard'
import ProfileLink from '../../components/ProfileLink'
import PullToRefresh from '../../components/PullToRefresh'
import CategoryIcon, { PinIcon, LockIcon } from './_shared/CategoryIcon'
import { catName } from './_shared/catName'
import { tripDurationLabel } from './_shared/tripHelpers'
import NewTopicModal from './NewTopicModal'
import type { CommunityCategory, CommunityTopicSummary, CommunityTripCard } from './types'

function useDebounced<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delayMs)
    return () => clearTimeout(id)
  }, [value, delayMs])
  return debounced
}

const OCRE = '#E8A020'

function TopicResultsList({ topics, tc, navigate }: {
  topics: CommunityTopicSummary[]
  tc: any
  navigate: (path: string) => void
}) {
  return (
    <div className="space-y-2">
      {topics.map((topic) => (
        <button
          key={topic.id}
          onClick={() => navigate(`/community/${topic.category_slug}/${topic.id}`)}
          className="w-full text-left flex items-center gap-3 rounded-[12px] p-3"
          style={{ background: 'var(--arvo-surface)', border: '1px solid var(--arvo-border)', cursor: 'pointer' }}
        >
          {/* Avatar/@ do autor levam pro perfil; o resto do card continua abrindo o tópico */}
          <ProfileLink username={topic.author.username} userId={topic.author.id}>
            <Avatar name={topic.author.name} avatarUrl={topic.author.avatar_url} size={30} />
          </ProfileLink>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5" style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 14, color: 'var(--arvo-fg)' }}>
              {topic.pinned && <span style={{ flexShrink: 0, color: '#E8A020', display: 'inline-flex' }}><PinIcon /></span>}
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{topic.title}</span>
            </div>
            <div style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 13, color: 'var(--arvo-fg-muted)' }}>
              <ProfileLink username={topic.author.username} userId={topic.author.id}>@{topic.author.username ?? topic.author.name}</ProfileLink>
              {' · '}{timeAgo(topic.last_post_at)}
              {topic.matched_in_body && ` · ${tc?.matchedInBody ?? 'encontrado numa resposta'}`}
            </div>
          </div>
          <span className="hidden sm:inline-block" style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 10, letterSpacing: '0.08em', textTransform: 'uppercase', color: OCRE, background: 'rgba(232,160,32,0.10)', borderRadius: 999, padding: '3px 10px', flexShrink: 0 }}>
            {tc?.cat?.[topic.category_slug ?? ''] ?? topic.category_slug}
          </span>
        </button>
      ))}
    </div>
  )
}

function timeAgo(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diffMs / 60000)
  if (mins < 1) return 'agora'
  if (mins < 60) return `${mins}min`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h`
  const days = Math.floor(hours / 24)
  return `${days}d`
}

export default function CommunityHomePage() {
  const { t } = useI18n()
  const tc = (t as any).community
  const navigate = useNavigate()
  const [categories, setCategories] = useState<CommunityCategory[] | null>(null)
  const [recent, setRecent] = useState<CommunityTopicSummary[]>([])
  // Últimas viagens compartilhadas — slider horizontal na home (null = carregando)
  const [trips, setTrips] = useState<CommunityTripCard[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [showSearch, setShowSearch] = useState(false)
  const [search, setSearch] = useState('')
  const debouncedSearch = useDebounced(search.trim(), 300)
  const [searchResults, setSearchResults] = useState<CommunityTopicSummary[] | null>(null)
  const [searching, setSearching] = useState(false)
  const [showMine, setShowMine] = useState(false)
  const [mineResults, setMineResults] = useState<CommunityTopicSummary[] | null>(null)
  const [loadingMine, setLoadingMine] = useState(false)
  const [showNewTopic, setShowNewTopic] = useState(false)
  const [isAdmin, setIsAdmin] = useState(false)

  async function loadCategoriesAndRecent() {
    setLoading(true)
    // Slider de viagens carrega em paralelo sem segurar a página; falha vira lista vazia
    apiFetch<{ trips: CommunityTripCard[] }>('/community/trips')
      .then(res => setTrips(res.trips.slice(0, 10)))
      .catch(() => setTrips([]))
    try {
      const data = await apiFetch<{ categories: CommunityCategory[]; is_admin?: boolean }>('/community/categories')
      setCategories(data.categories)
      setIsAdmin(!!data.is_admin)
      const lists = await Promise.all(
        data.categories.map((c) =>
          apiFetch<{ topics: CommunityTopicSummary[] }>(`/community/categories/${c.slug}/topics`).then((r) => r.topics)
        )
      )
      const merged = lists.flat().sort((a, b) => new Date(b.last_post_at).getTime() - new Date(a.last_post_at).getTime())
      setRecent(merged.slice(0, 5))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadCategoriesAndRecent() }, [])

  useEffect(() => {
    if (!debouncedSearch) { setSearchResults(null); return }
    let cancelled = false
    setSearching(true)
    apiFetch<{ topics: CommunityTopicSummary[] }>(`/community/search?q=${encodeURIComponent(debouncedSearch)}`)
      .then(res => { if (!cancelled) setSearchResults(res.topics) })
      .finally(() => { if (!cancelled) setSearching(false) })
    return () => { cancelled = true }
  }, [debouncedSearch])

  function toggleMine() {
    if (showMine) { setShowMine(false); return }
    setShowMine(true)
    setShowSearch(false)
    setSearch('')
    setLoadingMine(true)
    apiFetch<{ topics: CommunityTopicSummary[] }>('/community/mine')
      .then(res => setMineResults(res.topics))
      .finally(() => setLoadingMine(false))
  }

  if (loading) return <PageLoader />

  // Ações (meus tópicos / admin / busca) — ficam alinhadas com o título da
  // seção (ex: "Conversas recentes"), não numa linha própria acima dos pills.
  const sectionActions = (
    <div className="flex items-center gap-2 shrink-0">
      <button
        type="button"
        onClick={toggleMine}
        style={{
          fontFamily: 'var(--arvo-font-body)', fontSize: 13, padding: '6px 14px', borderRadius: 999,
          border: `1px solid ${showMine ? OCRE : 'var(--arvo-border)'}`,
          color: showMine ? OCRE : 'var(--arvo-fg-muted)',
          background: showMine ? 'rgba(232,160,32,0.08)' : 'transparent',
          cursor: 'pointer', whiteSpace: 'nowrap',
        }}
      >
        {tc?.myTopics ?? 'Meus tópicos'}
      </button>
      {isAdmin && (
        <button
          type="button"
          onClick={() => navigate('/admin')}
          title="Admin"
          className="w-8 h-8 flex items-center justify-center rounded-full border border-[var(--arvo-border)] text-[var(--arvo-fg-muted)] hover:text-[var(--arvo-fg)] transition-colors shrink-0"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.7}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.24-.438.613-.43.992a6.759 6.759 0 010 .255c-.008.378.137.75.43.99l1.005.828c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.992a6.932 6.932 0 010-.255c.007-.378-.138-.75-.43-.99l-1.004-.828a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.28Z" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
        </button>
      )}
      <button
        type="button"
        onClick={() => { setShowSearch(true); setShowMine(false) }}
        className="w-8 h-8 flex items-center justify-center rounded-full border border-[var(--arvo-border)] text-[var(--arvo-fg-muted)] hover:text-[var(--arvo-fg)] transition-colors shrink-0"
      >
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M17 10.5A6.5 6.5 0 114 10.5a6.5 6.5 0 0113 0z" />
        </svg>
      </button>
    </div>
  )

  // Chips de temas (categorias) — ficam na mesma faixa do título no desktop;
  // no mobile não cabem lá e descem pra uma linha rolável abaixo do título.
  const categoryChips = (categories ?? []).map((c) => (
    <button
      key={c.id}
      onClick={() => navigate(`/community/${c.slug}`)}
      className="flex items-center gap-1.5"
      style={{
        fontFamily: 'var(--arvo-font-body)', fontSize: 13, padding: '6px 12px', borderRadius: 999,
        background: 'var(--arvo-surface)', border: '1px solid var(--arvo-border)',
        color: 'var(--arvo-fg)', cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0,
        transition: 'border-color 200ms ease, background 200ms ease',
      }}
      onMouseEnter={(e) => { e.currentTarget.style.borderColor = OCRE; e.currentTarget.style.background = 'rgba(232,160,32,0.06)' }}
      onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--arvo-border)'; e.currentTarget.style.background = 'var(--arvo-surface)' }}
    >
      <span style={{ lineHeight: 0, color: 'var(--arvo-fg-muted)' }}><CategoryIcon slug={c.slug} iconKey={c.icon_key} /></span>
      {catName(tc, c)}
    </button>
  ))

  return (
    <PullToRefresh onRefresh={loadCategoriesAndRecent}>
    <div className="space-y-7">
      {/* Topo compacto: título + chips de temas + novo tópico numa faixa só */}
      <div>
        <div style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 12, letterSpacing: '0.16em', textTransform: 'uppercase', color: OCRE, marginBottom: 6 }}>
          {tc?.eyebrow ?? 'ARVO COMUNIDADE'}
        </div>
        <div className="flex items-center gap-3">
          <h1 style={{ fontFamily: 'var(--arvo-font-display)', fontSize: 24, color: 'var(--arvo-fg)', flexShrink: 0 }}>{tc?.title ?? 'Comunidade'}</h1>
          <div className="hidden md:flex items-center gap-2 flex-wrap flex-1 min-w-0">
            {categoryChips}
          </div>
          <div className="flex-1 md:hidden" />
          {!showSearch && (
            <button
              type="button"
              onClick={() => setShowNewTopic(true)}
              title={tc?.newTopic ?? 'Novo tópico'}
              style={{
            width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 18, lineHeight: 1, borderRadius: 999,
            background: OCRE, color: '#1a1200', border: 'none', cursor: 'pointer',
            transition: 'all 160ms ease', flexShrink: 0,
          }}
              onMouseEnter={e => (e.currentTarget.style.opacity = '0.85')}
              onMouseLeave={e => (e.currentTarget.style.opacity = '1')}
            >+</button>
          )}
        </div>
        {/* Fallback mobile: chips numa linha rolável horizontal abaixo do título */}
        <div className="flex md:hidden items-center gap-2 overflow-x-auto" style={{ marginTop: 10, scrollbarWidth: 'none' }}>
          {categoryChips}
        </div>
      </div>

      {showSearch && (
        <SearchBox
          value={search}
          onChange={setSearch}
          onBlurEmpty={() => setShowSearch(false)}
          className="relative w-full"
        />
      )}

      {debouncedSearch && (
        <div>
          <div className="flex items-center justify-between gap-3 flex-wrap" style={{ marginBottom: 10 }}>
            <h2 style={{ fontFamily: 'var(--arvo-font-display)', fontSize: 17, color: 'var(--arvo-fg)' }}>
              {(tc?.searchResults ?? 'Resultados da busca')}
            </h2>
            {sectionActions}
          </div>
          {searching ? (
            <PageLoader />
          ) : (searchResults ?? []).length === 0 ? (
            <p style={{ fontFamily: 'var(--arvo-font-display)', fontStyle: 'italic', color: 'var(--arvo-gold)', fontSize: 14 }}>
              {tc?.searchEmpty ?? 'Nenhum tópico encontrado.'}
            </p>
          ) : (
            <TopicResultsList topics={searchResults ?? []} tc={tc} navigate={navigate} />
          )}
        </div>
      )}

      {!debouncedSearch && showMine && (
        <div>
          <div className="flex items-center justify-between gap-3 flex-wrap" style={{ marginBottom: 10 }}>
            <h2 style={{ fontFamily: 'var(--arvo-font-display)', fontSize: 17, color: 'var(--arvo-fg)' }}>
              {tc?.myTopics ?? 'Meus tópicos'}
            </h2>
            {sectionActions}
          </div>
          {loadingMine ? (
            <PageLoader />
          ) : (mineResults ?? []).length === 0 ? (
            <p style={{ fontFamily: 'var(--arvo-font-display)', fontStyle: 'italic', color: 'var(--arvo-gold)', fontSize: 14 }}>
              {tc?.myTopicsEmpty ?? 'Você ainda não criou nenhum tópico.'}
            </p>
          ) : (
            <TopicResultsList topics={mineResults ?? []} tc={tc} navigate={navigate} />
          )}
        </div>
      )}

      {!debouncedSearch && !showMine && <>
      <div>
        <div className="flex items-center justify-between gap-3 flex-wrap" style={{ marginBottom: 10 }}>
          <h2 style={{ fontFamily: 'var(--arvo-font-display)', fontSize: 17, color: 'var(--arvo-fg)' }}>
            {tc?.recentTitle ?? 'Conversas recentes'}
          </h2>
          {sectionActions}
        </div>
        {recent.length === 0 ? (
          <p style={{ fontFamily: 'var(--arvo-font-display)', fontStyle: 'italic', color: 'var(--arvo-gold)', fontSize: 14 }}>
            {tc?.recentEmpty}
          </p>
        ) : (
          <div className="space-y-2">
            {recent.map((topic) => {
              const cat = categories?.find((c) => c.id === topic.category_id)
              return (
              <button
                key={topic.id}
                onClick={() => { if (cat) navigate(`/community/${cat.slug}/${topic.id}`) }}
                className="w-full text-left flex items-center gap-3 rounded-[12px] p-3"
                style={{ background: 'var(--arvo-surface)', border: '1px solid var(--arvo-border)', cursor: 'pointer' }}
              >
                {/* Avatar/nome do autor levam pro perfil; o card continua abrindo o tópico */}
                <ProfileLink username={topic.author.username} userId={topic.author.id}>
                  <Avatar name={topic.author.name} avatarUrl={topic.author.avatar_url} size={30} />
                </ProfileLink>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5" style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 14, color: 'var(--arvo-fg)' }}>
                    {topic.pinned && <span style={{ flexShrink: 0, color: '#E8A020', display: 'inline-flex' }}><PinIcon /></span>}
                    {topic.locked && <span style={{ flexShrink: 0, color: '#E8A020', display: 'inline-flex' }}><LockIcon /></span>}
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{topic.title}</span>
                  </div>
                  <div style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 13, color: 'var(--arvo-fg-muted)' }}>
                    <ProfileLink username={topic.author.username} userId={topic.author.id}>{topic.author.name ?? topic.author.username}</ProfileLink>
                    {' · '}{timeAgo(topic.last_post_at)}
                  </div>
                </div>
                {cat && (
                  <span className="hidden sm:inline-block" style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 10, letterSpacing: '0.08em', textTransform: 'uppercase', color: OCRE, background: 'rgba(232,160,32,0.10)', borderRadius: 999, padding: '3px 10px', flexShrink: 0 }}>
                    {catName(tc, cat)}
                  </span>
                )}
              </button>
              )
            })}
          </div>
        )}
      </div>

      {/* Viagens compartilhadas — slider horizontal com os mesmos cards da
          galeria (/community/trips); o card abre a viagem, o link no header
          da seção leva pra galeria completa. */}
      {trips !== null && (
        <div>
          <div className="flex items-baseline justify-between gap-3" style={{ marginBottom: 12 }}>
            <Eyebrow>{tc?.trips?.sectionEyebrow ?? 'Viagens compartilhadas'}</Eyebrow>
            <Link
              to="/community/trips"
              style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 13, color: OCRE, textDecoration: 'none', whiteSpace: 'nowrap', flexShrink: 0 }}
            >
              {tc?.trips?.seeAll ?? 'Ver todas'} →
            </Link>
          </div>
          {trips.length === 0 ? (
            <p style={{ fontFamily: 'var(--arvo-font-serif)', fontStyle: 'italic', color: 'var(--arvo-gold)', fontSize: 14 }}>
              {tc?.trips?.emptyTitle ?? 'Nenhuma viagem compartilhada ainda'}
            </p>
          ) : (
            <div
              className="flex gap-4 overflow-x-auto pb-2"
              style={{ scrollSnapType: 'x mandatory', scrollbarWidth: 'none', WebkitOverflowScrolling: 'touch' }}
            >
              {trips.map((trip) => (
                <div key={trip.id} style={{ flex: '0 0 auto', width: 270, scrollSnapAlign: 'start' }}>
                  <TripCard
                    trip={trip}
                    t={t}
                    showCost={false}
                    durationLabel={tripDurationLabel(trip, tc)}
                    owner={trip.owner}
                    onOwnerClick={() => navigate(`/u/${trip.owner.username ?? trip.owner.id}`)}
                    onClick={() => navigate(`/voyage/shared/${trip.id}`)}
                  />
                </div>
              ))}
            </div>
          )}
        </div>
      )}
      </>}

      {showNewTopic && (
        <NewTopicModal
          categories={categories ?? []}
          onClose={() => setShowNewTopic(false)}
          onCreated={(catSlug, topicId) => { setShowNewTopic(false); navigate(`/community/${catSlug}/${topicId}`) }}
        />
      )}
    </div>
    </PullToRefresh>
  )
}
