import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { apiFetch } from '../../lib/api'
import { useI18n } from '../../contexts/I18nContext'
import { PageLoader } from '../../components/ArvoLoader'
import Avatar from '../voyage/_shared/Avatar'
import CategoryIcon, { ICON_KEYS } from './_shared/CategoryIcon'
import { catName } from './_shared/catName'
import type { CommunityCategory, CommunityMemberRow, CommunityRecentPost } from './types'

const OCRE = '#E8A020'

function timeAgo(iso: string): string {
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000)
  if (mins < 1) return 'agora'
  if (mins < 60) return `${mins}min`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h`
  return `${Math.floor(hours / 24)}d`
}

const sectionTitle: React.CSSProperties = { fontFamily: 'var(--arvo-font-display)', fontSize: 17, color: 'var(--arvo-fg)' }
const card: React.CSSProperties = { background: 'var(--arvo-surface)', border: '1px solid var(--arvo-border)', borderRadius: 12 }

export default function CommunityAdminPage() {
  const { t } = useI18n()
  const tc = (t as any).community
  const ta = tc?.admin ?? {}
  const navigate = useNavigate()

  const [loading, setLoading] = useState(true)
  const [forbidden, setForbidden] = useState(false)
  const [members, setMembers] = useState<CommunityMemberRow[]>([])
  const [memberQ, setMemberQ] = useState('')
  const [categories, setCategories] = useState<CommunityCategory[]>([])
  const [recent, setRecent] = useState<CommunityRecentPost[]>([])
  const [busy, setBusy] = useState<string | null>(null)

  const [newCatName, setNewCatName] = useState('')
  const [newCatIcon, setNewCatIcon] = useState<string>('chat')
  const [creating, setCreating] = useState(false)
  const [catErr, setCatErr] = useState<string | null>(null)

  async function loadAll() {
    setLoading(true)
    try {
      const [m, c, r] = await Promise.all([
        apiFetch<{ members: CommunityMemberRow[] }>('/community/admin/members'),
        apiFetch<{ categories: CommunityCategory[] }>('/community/categories?all=1'),
        apiFetch<{ posts: CommunityRecentPost[] }>('/community/admin/posts/recent'),
      ])
      setMembers(m.members)
      setCategories(c.categories)
      setRecent(r.posts)
    } catch (err: any) {
      if (/403|forbidden|admin/i.test(String(err?.message))) setForbidden(true)
    } finally {
      setLoading(false)
    }
  }
  useEffect(() => { loadAll() }, [])

  async function changeTier(m: CommunityMemberRow, tier: CommunityMemberRow['tier']) {
    if (busy || tier === m.tier) return
    setBusy(m.id)
    try {
      await apiFetch(`/community/admin/members/${m.id}/tier`, { method: 'POST', body: JSON.stringify({ tier }) })
      setMembers(ms => ms.map(x => x.id === m.id ? { ...x, tier } : x))
    } catch (err: any) {
      alert(err?.message ?? 'Erro')
    } finally {
      setBusy(null)
    }
  }

  async function toggleAdmin(m: CommunityMemberRow) {
    if (busy) return
    if (m.is_admin && !confirm((ta.demoteConfirm ?? 'Remover {name} como admin?').replace('{name}', m.name))) return
    if (!m.is_admin && !confirm((ta.promoteConfirm ?? 'Promover {name} a admin?').replace('{name}', m.name))) return
    setBusy(m.id)
    try {
      await apiFetch(`/community/admin/members/${m.id}/${m.is_admin ? 'demote' : 'promote'}`, { method: 'POST' })
      setMembers(ms => ms.map(x => x.id === m.id ? { ...x, is_admin: !m.is_admin } : x))
    } catch (err: any) {
      alert(err?.message ?? 'Erro')
    } finally {
      setBusy(null)
    }
  }

  async function createCategory() {
    if (!newCatName.trim() || creating) return
    setCreating(true)
    setCatErr(null)
    try {
      await apiFetch('/community/admin/categories', {
        method: 'POST',
        body: JSON.stringify({ name: newCatName.trim(), icon_key: newCatIcon }),
      })
      setNewCatName('')
      const c = await apiFetch<{ categories: CommunityCategory[] }>('/community/categories?all=1')
      setCategories(c.categories)
    } catch (err: any) {
      setCatErr(err?.message ?? 'Erro')
    } finally {
      setCreating(false)
    }
  }

  async function toggleArchive(c: CommunityCategory) {
    if (busy) return
    setBusy(`cat-${c.id}`)
    try {
      await apiFetch(`/community/admin/categories/${c.id}`, { method: 'PATCH', body: JSON.stringify({ archived: !c.archived }) })
      setCategories(cs => cs.map(x => x.id === c.id ? { ...x, archived: !c.archived } : x))
    } finally {
      setBusy(null)
    }
  }

  if (loading) return <PageLoader />
  if (forbidden) {
    navigate('/community')
    return null
  }

  const filteredMembers = memberQ.trim()
    ? members.filter(m => m.name.toLowerCase().includes(memberQ.toLowerCase()) || (m.username ?? '').toLowerCase().includes(memberQ.toLowerCase()))
    : members

  return (
    <div className="space-y-8">
      <div>
        <Link to="/community" style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 12, color: 'var(--arvo-fg-soft)', textDecoration: 'none' }}>
          ← {tc?.backToCommunity ?? 'Voltar para a comunidade'}
        </Link>
        <div style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 11, letterSpacing: '0.16em', textTransform: 'uppercase', color: OCRE, margin: '14px 0 6px' }}>
          {ta.eyebrow ?? 'ADMINISTRAÇÃO'}
        </div>
        <h1 style={{ fontFamily: 'var(--arvo-font-display)', fontSize: 26, color: 'var(--arvo-fg)' }}>{ta.title ?? 'Painel da comunidade'}</h1>
      </div>

      {/* ── Categorias ── */}
      <section className="space-y-3">
        <h2 style={sectionTitle}>{ta.categories ?? 'Categorias'}</h2>
        <div style={card}>
          {categories.map(c => (
            <div key={c.id} className="flex items-center gap-3" style={{ padding: '11px 14px', borderBottom: '1px solid var(--arvo-border-soft, var(--arvo-border))', opacity: c.archived ? 0.45 : 1 }}>
              <span style={{ color: OCRE, display: 'inline-flex' }}><CategoryIcon slug={c.slug} iconKey={c.icon_key} size={16} /></span>
              <span style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 13.5, color: 'var(--arvo-fg)', flex: 1 }}>
                {catName(tc, c)}
                {c.archived && <span style={{ fontSize: 10, marginLeft: 8, color: 'var(--arvo-fg-faint)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>{ta.archived ?? 'arquivada'}</span>}
              </span>
              <span style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 11.5, color: 'var(--arvo-fg-soft)' }}>
                {(tc?.categoryTopicsMany ?? '{count} tópicos').replace('{count}', String(c.topic_count))}
              </span>
              <button
                onClick={() => toggleArchive(c)}
                disabled={busy === `cat-${c.id}`}
                style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 11, padding: '4px 12px', borderRadius: 999, border: '1px solid var(--arvo-border)', background: 'none', color: 'var(--arvo-fg-soft)', cursor: 'pointer' }}
              >
                {c.archived ? (ta.unarchive ?? 'Restaurar') : (ta.archive ?? 'Arquivar')}
              </button>
            </div>
          ))}
          {/* Nova categoria */}
          <div style={{ padding: '13px 14px' }}>
            <div className="flex items-center gap-2 flex-wrap">
              <input
                value={newCatName}
                onChange={e => setNewCatName(e.target.value)}
                placeholder={ta.newCatPlaceholder ?? 'Nome da nova categoria'}
                style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 13, padding: '8px 12px', border: '1px solid var(--arvo-border)', borderRadius: 8, background: 'var(--arvo-bg)', color: 'var(--arvo-fg)', flex: 1, minWidth: 180 }}
              />
              <button
                onClick={createCategory}
                disabled={creating || !newCatName.trim()}
                style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 12, padding: '8px 18px', borderRadius: 999, border: 'none', background: OCRE, color: '#1a1200', cursor: 'pointer', opacity: creating || !newCatName.trim() ? 0.5 : 1 }}
              >
                {creating ? '...' : `+ ${ta.createCat ?? 'Criar'}`}
              </button>
            </div>
            <div className="flex items-center gap-1.5 flex-wrap" style={{ marginTop: 10 }}>
              {ICON_KEYS.map(k => (
                <button
                  key={k}
                  onClick={() => setNewCatIcon(k)}
                  title={k}
                  style={{
                    width: 32, height: 32, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center',
                    border: `1px solid ${newCatIcon === k ? OCRE : 'var(--arvo-border)'}`,
                    background: newCatIcon === k ? 'rgba(232,160,32,0.10)' : 'transparent',
                    color: newCatIcon === k ? OCRE : 'var(--arvo-fg-muted)', cursor: 'pointer',
                  }}
                >
                  <CategoryIcon iconKey={k} size={15} />
                </button>
              ))}
            </div>
            {catErr && <p style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 12, color: 'var(--arvo-red, #D63B2F)', marginTop: 8 }}>{catErr}</p>}
          </div>
        </div>
      </section>

      {/* ── Membros ── */}
      <section className="space-y-3">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <h2 style={sectionTitle}>{ta.members ?? 'Membros'}</h2>
          <input
            value={memberQ}
            onChange={e => setMemberQ(e.target.value)}
            placeholder={ta.searchMembers ?? 'Buscar membro'}
            style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 13, padding: '7px 12px', border: '1px solid var(--arvo-border)', borderRadius: 999, background: 'var(--arvo-bg)', color: 'var(--arvo-fg)', width: 200 }}
          />
        </div>
        <div style={card}>
          {filteredMembers.map(m => (
            <div key={m.id} className="flex items-center gap-3" style={{ padding: '10px 14px', borderBottom: '1px solid var(--arvo-border-soft, var(--arvo-border))' }}>
              <Avatar name={m.name} avatarUrl={m.avatar_url ?? undefined} size={30} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <span style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 13.5, color: 'var(--arvo-fg)' }}>{m.name}</span>
                  {m.is_admin && <img src="/brand/logo/arvo-symbol-gold.svg" width="10" height="10" alt="Admin" title="Admin" />}
                </div>
                <span style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 11.5, color: 'var(--arvo-fg-soft)' }}>
                  {m.username ? `@${m.username}` : ''}{m.username ? ' · ' : ''}{ta.since ?? 'desde'} {new Date(m.joined_at).toLocaleDateString()}
                </span>
              </div>
              <select
                value={m.tier}
                onChange={e => changeTier(m, e.target.value as CommunityMemberRow['tier'])}
                disabled={busy === m.id}
                style={{
                  fontFamily: 'var(--arvo-font-body)', fontSize: 11, padding: '4px 8px', borderRadius: 999, cursor: 'pointer',
                  border: '1px solid var(--arvo-border)', background: 'var(--arvo-bg)', color: 'var(--arvo-fg)',
                  opacity: busy === m.id ? 0.5 : 1,
                }}
              >
                <option value="free">{ta.tierFree ?? 'Free'}</option>
                <option value="plus">{ta.tierPlus ?? 'Plus'}</option>
                <option value="beta">{ta.tierBeta ?? 'Beta'}</option>
              </select>
              <button
                onClick={() => toggleAdmin(m)}
                disabled={busy === m.id}
                style={{
                  fontFamily: 'var(--arvo-font-body)', fontSize: 11, padding: '4px 12px', borderRadius: 999, cursor: 'pointer',
                  border: `1px solid ${m.is_admin ? 'var(--arvo-border)' : OCRE}`,
                  background: m.is_admin ? 'none' : 'rgba(232,160,32,0.08)',
                  color: m.is_admin ? 'var(--arvo-fg-soft)' : OCRE,
                  opacity: busy === m.id ? 0.5 : 1,
                }}
              >
                {m.is_admin ? (ta.demote ?? 'Remover admin') : (ta.promote ?? 'Tornar admin')}
              </button>
            </div>
          ))}
          {filteredMembers.length === 0 && (
            <p style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 13, color: 'var(--arvo-fg-soft)', padding: '14px' }}>{ta.noMembers ?? 'Nenhum membro encontrado.'}</p>
          )}
        </div>
      </section>

      {/* ── Últimos posts ── */}
      <section className="space-y-3">
        <h2 style={sectionTitle}>{ta.recentPosts ?? 'Últimos posts'}</h2>
        <div style={card}>
          {recent.map(p => (
            <button
              key={p.id}
              onClick={() => navigate(`/community/${p.category_slug}/${p.topic_id}`)}
              className="w-full text-left"
              style={{ display: 'block', padding: '10px 14px', borderBottom: '1px solid var(--arvo-border-soft, var(--arvo-border))', background: 'none', border: 'none', borderBottomStyle: 'solid', cursor: 'pointer' }}
            >
              <div className="flex items-center gap-2">
                <span style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 12.5, fontWeight: 600, color: 'var(--arvo-fg)' }}>{p.author_name}</span>
                <span style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 11, color: 'var(--arvo-fg-faint)' }}>· {timeAgo(p.created_at)}</span>
                <span style={{ marginLeft: 'auto', fontFamily: 'var(--arvo-font-body)', fontSize: 11, color: 'var(--arvo-fg-soft)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 180 }}>{p.topic_title}</span>
              </div>
              <p style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 12.5, color: 'var(--arvo-fg-muted)', marginTop: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.excerpt}</p>
            </button>
          ))}
          {recent.length === 0 && (
            <p style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 13, color: 'var(--arvo-fg-soft)', padding: '14px' }}>{ta.noPosts ?? 'Nenhum post ainda.'}</p>
          )}
        </div>
      </section>
    </div>
  )
}
