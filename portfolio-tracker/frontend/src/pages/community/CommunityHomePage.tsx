import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { apiFetch } from '../../lib/api'
import { useI18n } from '../../contexts/I18nContext'
import { PageLoader } from '../../components/ArvoLoader'
import { SearchBox } from '../../components/ui'
import Avatar from '../voyage/_shared/Avatar'
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
            <div style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 14, color: 'var(--arvo-fg)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {topic.pinned ? '📌 ' : ''}{topic.title}
            </div>
            <div style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 12, color: 'var(--arvo-fg-muted)' }}>
              {tc?.cat?.[topic.category_slug ?? ''] ?? topic.category_slug} · @{topic.author.username ?? topic.author.name} · {timeAgo(topic.last_post_at)}
              {topic.matched_in_body && ` · ${tc?.matchedInBody ?? 'encontrado numa resposta'}`}
            </div>
          </div>
          <div style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 12.5, color: 'var(--arvo-fg-muted)', flexShrink: 0 }}>
            {topic.reply_count}
          </div>
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

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    apiFetch<{ categories: CommunityCategory[] }>('/community/categories')
      .then(async (data) => {
        if (cancelled) return
        setCategories(data.categories)
        const lists = await Promise.all(
          data.categories.map((c) =>
            apiFetch<{ topics: CommunityTopicSummary[] }>(`/community/categories/${c.slug}/topics`).then((r) => r.topics)
          )
        )
        if (cancelled) return
        const merged = lists.flat().sort((a, b) => new Date(b.last_post_at).getTime() - new Date(a.last_post_at).getTime())
        setRecent(merged.slice(0, 8))
      })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [])

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
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {(categories ?? []).map((c) => (
          <button
            key={c.id}
            onClick={() => navigate(`/community/${c.slug}`)}
            className="text-left rounded-[14px] p-4"
            style={{ background: 'var(--arvo-surface)', border: '1px solid var(--arvo-border)', cursor: 'pointer', transition: 'transform 200ms ease' }}
            onMouseEnter={(e) => { e.currentTarget.style.transform = 'translateY(-2px)' }}
            onMouseLeave={(e) => { e.currentTarget.style.transform = 'translateY(0)' }}
          >
            <div style={{ fontSize: 22, marginBottom: 8 }}>{c.icon}</div>
            <div style={{ fontFamily: 'var(--arvo-font-display)', fontSize: 15, color: 'var(--arvo-fg)' }}>
              {tc?.cat?.[c.slug] ?? c.slug}
            </div>
            <div style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 12.5, color: 'var(--arvo-fg-muted)', marginTop: 2 }}>
              {c.topic_count === 1 ? tc?.categoryTopicsOne : (tc?.categoryTopicsMany ?? '{count} tópicos').replace('{count}', String(c.topic_count))}
            </div>
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
            {recent.map((topic) => (
              <button
                key={topic.id}
                onClick={() => {
                  const cat = categories?.find((c) => c.id === topic.category_id)
                  if (cat) navigate(`/community/${cat.slug}/${topic.id}`)
                }}
                className="w-full text-left flex items-center gap-3 rounded-[12px] p-3"
                style={{ background: 'var(--arvo-surface)', border: '1px solid var(--arvo-border)', cursor: 'pointer' }}
              >
                <Avatar name={topic.author.name} avatarUrl={topic.author.avatar_url} size={30} />
                <div className="flex-1 min-w-0">
                  <div style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 14, color: 'var(--arvo-fg)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {topic.pinned ? '📌 ' : ''}{topic.title}
                  </div>
                  <div style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 12, color: 'var(--arvo-fg-muted)' }}>
                    @{topic.author.username ?? topic.author.name} · {timeAgo(topic.last_post_at)}
                  </div>
                </div>
                <div style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 12.5, color: 'var(--arvo-fg-muted)', flexShrink: 0 }}>
                  {topic.reply_count}
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
      </>}
    </div>
  )
}
