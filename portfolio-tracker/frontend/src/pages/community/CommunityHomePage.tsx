import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { apiFetch } from '../../lib/api'
import { useI18n } from '../../contexts/I18nContext'
import { PageLoader } from '../../components/ArvoLoader'
import { SearchBox } from '../../components/ui'
import Avatar from '../voyage/_shared/Avatar'
import PullToRefresh from '../../components/PullToRefresh'
import CategoryIcon, { PinIcon, LockIcon } from './_shared/CategoryIcon'
import NewTopicModal from './NewTopicModal'
import type { CommunityCategory, CommunityTopicSummary } from './types'

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
          <Avatar name={topic.author.name} avatarUrl={topic.author.avatar_url} size={30} />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5" style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 14, color: 'var(--arvo-fg)' }}>
              {topic.pinned && <span style={{ flexShrink: 0, color: 'var(--arvo-fg-soft)', display: 'inline-flex' }}><PinIcon /></span>}
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{topic.title}</span>
            </div>
            <div style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 12, color: 'var(--arvo-fg-muted)' }}>
              @{topic.author.username ?? topic.author.name} · {timeAgo(topic.last_post_at)}
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

  async function loadCategoriesAndRecent() {
    setLoading(true)
    try {
      const data = await apiFetch<{ categories: CommunityCategory[] }>('/community/categories')
      setCategories(data.categories)
      const lists = await Promise.all(
        data.categories.map((c) =>
          apiFetch<{ topics: CommunityTopicSummary[] }>(`/community/categories/${c.slug}/topics`).then((r) => r.topics)
        )
      )
      const merged = lists.flat().sort((a, b) => new Date(b.last_post_at).getTime() - new Date(a.last_post_at).getTime())
      setRecent(merged.slice(0, 8))
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

  return (
    <PullToRefresh onRefresh={loadCategoriesAndRecent}>
    <div className="space-y-7">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <div style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 11, letterSpacing: '0.16em', textTransform: 'uppercase', color: OCRE, marginBottom: 6 }}>
            {tc?.eyebrow ?? 'ARVO COMUNIDADE'}
          </div>
          <h1 style={{ fontFamily: 'var(--arvo-font-display)', fontSize: 28, color: 'var(--arvo-fg)' }}>{tc?.title ?? 'Comunidade'}</h1>
          <p style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 14, color: 'var(--arvo-fg-muted)', marginTop: 4 }}>
            {tc?.subtitle}
          </p>
        </div>

        {showSearch ? (
          <SearchBox
            value={search}
            onChange={setSearch}
            onBlurEmpty={() => setShowSearch(false)}
            className="relative flex-1 min-w-[200px] max-w-xs"
          />
        ) : (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setShowNewTopic(true)}
              style={{
                fontFamily: 'var(--arvo-font-body)', fontSize: 12, padding: '7px 16px', borderRadius: 999,
                border: 'none', background: OCRE, color: '#1a1200', cursor: 'pointer', whiteSpace: 'nowrap',
              }}
            >
              + {tc?.newTopic ?? 'Novo tópico'}
            </button>
            <button
              type="button"
              onClick={toggleMine}
              style={{
                fontFamily: 'var(--arvo-font-body)', fontSize: 12, padding: '6px 14px', borderRadius: 999,
                border: `1px solid ${showMine ? OCRE : 'var(--arvo-border)'}`,
                color: showMine ? OCRE : 'var(--arvo-fg-muted)',
                background: showMine ? 'rgba(232,160,32,0.08)' : 'transparent',
                cursor: 'pointer', whiteSpace: 'nowrap',
              }}
            >
              {tc?.myTopics ?? 'Meus tópicos'}
            </button>
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
        )}
      </div>

      {debouncedSearch && (
        <div>
          <h2 style={{ fontFamily: 'var(--arvo-font-display)', fontSize: 17, color: 'var(--arvo-fg)', marginBottom: 10 }}>
            {(tc?.searchResults ?? 'Resultados da busca')}
          </h2>
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
          <h2 style={{ fontFamily: 'var(--arvo-font-display)', fontSize: 17, color: 'var(--arvo-fg)', marginBottom: 10 }}>
            {tc?.myTopics ?? 'Meus tópicos'}
          </h2>
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
      {/* Compact category chips — replaced the big 2×4 card grid */}
      <div className="flex gap-2 flex-wrap">
        {(categories ?? []).map((c) => (
          <button
            key={c.id}
            onClick={() => navigate(`/community/${c.slug}`)}
            className="flex items-center gap-2"
            style={{
              fontFamily: 'var(--arvo-font-body)', fontSize: 13, padding: '8px 16px', borderRadius: 999,
              background: 'var(--arvo-surface)', border: '1px solid var(--arvo-border)',
              color: 'var(--arvo-fg)', cursor: 'pointer',
              transition: 'border-color 200ms ease, background 200ms ease',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.borderColor = OCRE; e.currentTarget.style.background = 'rgba(232,160,32,0.06)' }}
            onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--arvo-border)'; e.currentTarget.style.background = 'var(--arvo-surface)' }}
          >
            <span style={{ lineHeight: 0, color: 'var(--arvo-fg-muted)' }}><CategoryIcon slug={c.slug} /></span>
            {tc?.cat?.[c.slug] ?? c.slug}
          </button>
        ))}
      </div>

      <div>
        <h2 style={{ fontFamily: 'var(--arvo-font-display)', fontSize: 17, color: 'var(--arvo-fg)', marginBottom: 10 }}>
          {tc?.recentTitle ?? 'Conversas recentes'}
        </h2>
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
                <Avatar name={topic.author.name} avatarUrl={topic.author.avatar_url} size={30} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5" style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 14, color: 'var(--arvo-fg)' }}>
                    {topic.pinned && <span style={{ flexShrink: 0, color: 'var(--arvo-fg-soft)', display: 'inline-flex' }}><PinIcon /></span>}
                    {topic.locked && <span style={{ flexShrink: 0, color: 'var(--arvo-fg-soft)', display: 'inline-flex' }}><LockIcon /></span>}
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{topic.title}</span>
                  </div>
                  <div style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 12, color: 'var(--arvo-fg-muted)' }}>
                    {topic.author.name ?? topic.author.username} · {timeAgo(topic.last_post_at)}
                  </div>
                </div>
                {cat && (
                  <span className="hidden sm:inline-block" style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 10, letterSpacing: '0.08em', textTransform: 'uppercase', color: OCRE, background: 'rgba(232,160,32,0.10)', borderRadius: 999, padding: '3px 10px', flexShrink: 0 }}>
                    {tc?.cat?.[cat.slug] ?? cat.slug}
                  </span>
                )}
              </button>
              )
            })}
          </div>
        )}
      </div>
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
