import { useState, useEffect } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { apiFetch } from '../../lib/api'
import { useI18n } from '../../contexts/I18nContext'
import { PageLoader } from '../../components/ArvoLoader'
import Avatar from '../voyage/_shared/Avatar'
import NewTopicModal from './NewTopicModal'
import type { CommunityCategory, CommunityTopicSummary } from './types'

const OCRE = '#E8A020'

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

export default function CommunityCategoryPage() {
  const { slug } = useParams<{ slug: string }>()
  const { t } = useI18n()
  const tc = (t as any).community
  const navigate = useNavigate()
  const [category, setCategory] = useState<CommunityCategory | null>(null)
  const [allCategories, setAllCategories] = useState<CommunityCategory[]>([])
  const [topics, setTopics] = useState<CommunityTopicSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [showNewTopic, setShowNewTopic] = useState(false)

  async function load() {
    if (!slug) return
    setLoading(true)
    try {
      const [catsRes, topicsRes] = await Promise.all([
        apiFetch<{ categories: CommunityCategory[] }>('/community/categories'),
        apiFetch<{ category: CommunityCategory; topics: CommunityTopicSummary[] }>(`/community/categories/${slug}/topics`),
      ])
      setAllCategories(catsRes.categories)
      setCategory(topicsRes.category)
      setTopics(topicsRes.topics)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [slug])

  if (loading) return <PageLoader />
  if (!category) return null

  return (
    <div className="space-y-5">
      <Link to="/community" style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 12, color: 'var(--arvo-fg-soft)', textDecoration: 'none' }}>
        ← {tc?.backToCommunity ?? 'Voltar para a comunidade'}
      </Link>

      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <div className="flex items-center gap-2">
            <span style={{ fontSize: 22 }}>{category.icon}</span>
            <h1 style={{ fontFamily: 'var(--arvo-font-display)', fontSize: 24, color: 'var(--arvo-fg)' }}>
              {tc?.cat?.[category.slug] ?? category.slug}
            </h1>
          </div>
        </div>
        <button
          onClick={() => setShowNewTopic(true)}
          style={{
            fontFamily: 'var(--arvo-font-body)', fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase',
            padding: '10px 18px', borderRadius: 10, border: 'none', cursor: 'pointer', background: OCRE, color: '#1a1200',
          }}
        >+ {tc?.newTopic ?? 'Novo tópico'}</button>
      </div>

      {topics.length === 0 ? (
        <div style={{ padding: '40px 0', textAlign: 'center' }}>
          <p style={{ fontFamily: 'var(--arvo-font-display)', fontStyle: 'italic', color: 'var(--arvo-gold)', fontSize: 15, marginBottom: 4 }}>
            {tc?.emptyTopics ?? 'Nenhum tópico nesta categoria ainda.'}
          </p>
          <p style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 13, color: 'var(--arvo-fg-soft)' }}>
            {tc?.emptyTopicsBody}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {topics.map(topic => (
            <button
              key={topic.id}
              onClick={() => navigate(`/community/${category.slug}/${topic.id}`)}
              className="w-full text-left flex items-center gap-3 rounded-[12px] p-3.5"
              style={{ background: 'var(--arvo-surface)', border: '1px solid var(--arvo-border)', cursor: 'pointer' }}
            >
              <Avatar name={topic.author.name} avatarUrl={topic.author.avatar_url} size={32} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  {topic.pinned && <span style={{ fontSize: 12 }}>📌</span>}
                  {topic.locked && <span style={{ fontSize: 12 }}>🔒</span>}
                  <span style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 14, fontWeight: 600, color: 'var(--arvo-fg)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {topic.title}
                  </span>
                </div>
                <div style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 12, color: 'var(--arvo-fg-soft)', marginTop: 2 }}>
                  {topic.author.username ? `@${topic.author.username}` : topic.author.name} · {timeAgo(topic.last_post_at)}
                </div>
              </div>
              <div style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 12.5, color: 'var(--arvo-fg-soft)', flexShrink: 0 }}>
                {topic.reply_count === 1 ? (tc?.repliesOne ?? '1 resposta') : (tc?.repliesMany ?? '{count} respostas').replace('{count}', String(topic.reply_count))}
              </div>
            </button>
          ))}
        </div>
      )}

      {showNewTopic && (
        <NewTopicModal
          categories={allCategories}
          defaultCategorySlug={category.slug}
          onClose={() => setShowNewTopic(false)}
          onCreated={(catSlug, topicId) => { setShowNewTopic(false); navigate(`/community/${catSlug}/${topicId}`) }}
        />
      )}
    </div>
  )
}
