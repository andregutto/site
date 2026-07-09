import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { apiFetch } from '../lib/api'
import { useI18n } from '../contexts/I18nContext'
import { useTheme } from '../contexts/ThemeContext'
import { PageLoader } from '../components/ArvoLoader'
import Avatar from './voyage/_shared/Avatar'
import TierBadge from '../components/upgrade/TierBadge'

// Gestão de tier/admin de TODOS os usuários da plataforma (auth.users), não só
// quem entrou na comunidade (community_members só ganha linha no 1º acesso ao
// fórum). Papel de admin (community_admins) governa comunidade + recursos +
// aquisição + planos. Fonte: GET/PUT/POST /entitlements/admin/users*.

const OCRE = '#E8A020'

type Tier = 'free' | 'plus' | 'pro' | 'beta'

interface UserRow {
  id: string
  name: string
  username: string | null
  avatar_url: string | null
  email: string | null
  created_at: string | null
  signup_source: string | null
  tier: Tier
  is_admin: boolean
}

const sectionTitle: React.CSSProperties = { fontFamily: 'var(--arvo-font-display)', fontSize: 17, color: 'var(--arvo-fg)' }
const card: React.CSSProperties = { background: 'var(--arvo-surface)', border: '1px solid var(--arvo-border)', borderRadius: 12 }

export default function UsersAdminPage() {
  const { t } = useI18n()
  const tu = (t as any).admin?.users ?? {}
  const navigate = useNavigate()
  const { resolvedTheme } = useTheme()
  const onDark = resolvedTheme === 'dark'

  const [loading, setLoading] = useState(true)
  const [forbidden, setForbidden] = useState(false)
  const [users, setUsers] = useState<UserRow[]>([])
  const [q, setQ] = useState('')
  const [page, setPage] = useState(1)
  const [hasMore, setHasMore] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)

  // Debounce da busca: refaz do zero (página 1) quando o termo muda.
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [effectiveQ, setEffectiveQ] = useState('')
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => setEffectiveQ(q.trim()), 300)
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current) }
  }, [q])

  const load = useCallback(async (targetPage: number, query: string, append: boolean) => {
    if (append) setLoadingMore(true)
    else setLoading(true)
    try {
      const params = new URLSearchParams()
      if (query) params.set('q', query)
      params.set('page', String(targetPage))
      const d = await apiFetch<{ users: UserRow[]; page: number; has_more: boolean }>(`/entitlements/admin/users?${params.toString()}`)
      setUsers(prev => append ? [...prev, ...d.users] : d.users)
      setPage(d.page)
      setHasMore(d.has_more)
    } catch (err: any) {
      if (/403|forbidden|admin/i.test(String(err?.message))) setForbidden(true)
    } finally {
      setLoading(false)
      setLoadingMore(false)
    }
  }, [])

  useEffect(() => { load(1, effectiveQ, false) }, [effectiveQ, load])

  async function changeTier(u: UserRow, tier: Tier) {
    if (busy || tier === u.tier) return
    const label = tu[`tier${tier[0].toUpperCase()}${tier.slice(1)}`] ?? tier
    if (!confirm((tu.tierConfirm ?? 'Aplicar tier {tier} para {name}?').replace('{tier}', label).replace('{name}', u.name))) return
    setBusy(u.id)
    try {
      await apiFetch(`/entitlements/admin/users/${u.id}/tier`, { method: 'PUT', body: JSON.stringify({ tier }) })
      setUsers(us => us.map(x => x.id === u.id ? { ...x, tier } : x))
    } catch (err: any) {
      alert(err?.message ?? tu.saveError ?? 'Erro')
    } finally {
      setBusy(null)
    }
  }

  async function toggleAdmin(u: UserRow) {
    if (busy) return
    const msg = u.is_admin
      ? (tu.demoteConfirm ?? 'Remover {name} como admin?')
      : (tu.promoteConfirm ?? 'Promover {name} a admin?')
    if (!confirm(msg.replace('{name}', u.name))) return
    setBusy(u.id)
    try {
      await apiFetch(`/entitlements/admin/users/${u.id}/${u.is_admin ? 'demote' : 'promote'}`, { method: 'POST' })
      setUsers(us => us.map(x => x.id === u.id ? { ...x, is_admin: !u.is_admin } : x))
    } catch (err: any) {
      alert(err?.message ?? tu.saveError ?? 'Erro')
    } finally {
      setBusy(null)
    }
  }

  if (loading) return <PageLoader />
  if (forbidden) { navigate('/dashboard'); return null }

  const fmtDate = (iso: string | null) => iso ? new Date(iso).toLocaleDateString() : ''
  const sourceLabel = (s: string | null) => s && s.trim() ? s : (tu.sourceDirect ?? 'direto')

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 style={sectionTitle}>{tu.title ?? 'Usuários'}</h2>
          <p style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 13.5, color: 'var(--arvo-fg-soft)', marginTop: 2 }}>
            {tu.subtitle ?? 'Todos os usuários da plataforma.'}
          </p>
        </div>
        <input
          value={q}
          onChange={e => setQ(e.target.value)}
          placeholder={tu.search ?? 'Buscar por nome, @ ou e-mail'}
          style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 16, padding: '8px 14px', border: '1px solid var(--arvo-border)', borderRadius: 999, background: 'var(--arvo-bg)', color: 'var(--arvo-fg)', width: 260, maxWidth: '100%' }}
        />
      </div>

      <div style={card}>
        {users.map(u => (
          <div
            key={u.id}
            className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-3"
            style={{ padding: '12px 14px', borderBottom: '1px solid var(--arvo-border-soft, var(--arvo-border))' }}
          >
            {/* Identidade */}
            <div className="flex items-center gap-3 min-w-0 sm:flex-1">
              <Avatar name={u.name} email={u.email ?? undefined} avatarUrl={u.avatar_url ?? undefined} size={34} />
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <span style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 14.5, color: 'var(--arvo-fg)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{u.name}</span>
                  {u.is_admin && <img src="/brand/logo/arvo-symbol-gold.svg" width="11" height="11" alt={tu.adminBadge ?? 'Admin'} title={tu.adminBadge ?? 'Admin'} style={{ flexShrink: 0 }} />}
                </div>
                <span style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 12.5, color: 'var(--arvo-fg-soft)', display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {u.username ? `@${u.username}` : ''}{u.username && u.email ? ' · ' : ''}{u.email ?? ''}
                </span>
              </div>
            </div>

            {/* Meta: cadastro + origem */}
            <div className="flex items-center gap-3 sm:gap-4 sm:w-56 shrink-0" style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 12.5, color: 'var(--arvo-fg-soft)' }}>
              <span>{tu.since ?? 'desde'} {fmtDate(u.created_at)}</span>
              <span style={{ color: 'var(--arvo-fg-muted)' }}>{sourceLabel(u.signup_source)}</span>
            </div>

            {/* Ações: tier + admin */}
            <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap sm:justify-end shrink-0">
              {(u.tier === 'plus' || u.tier === 'pro') && (
                <TierBadge tier={u.tier} size={13} onDark={onDark} />
              )}
              <select
                value={u.tier}
                onChange={e => changeTier(u, e.target.value as Tier)}
                disabled={busy === u.id}
                style={{
                  fontFamily: 'var(--arvo-font-body)', fontSize: 16, padding: '5px 8px', borderRadius: 999, cursor: 'pointer',
                  border: '1px solid var(--arvo-border)', background: 'var(--arvo-bg)', color: 'var(--arvo-fg)',
                  opacity: busy === u.id ? 0.5 : 1,
                }}
              >
                <option value="free">{tu.tierFree ?? 'Free'}</option>
                <option value="plus">{tu.tierPlus ?? 'Plus'}</option>
                <option value="pro">{tu.tierPro ?? 'Pro'}</option>
                <option value="beta">{tu.tierBeta ?? 'Beta'}</option>
              </select>
              <button
                onClick={() => toggleAdmin(u)}
                disabled={busy === u.id}
                style={{
                  fontFamily: 'var(--arvo-font-body)', fontSize: 12, padding: '5px 12px', borderRadius: 999, cursor: 'pointer', whiteSpace: 'nowrap',
                  border: `1px solid ${u.is_admin ? 'var(--arvo-border)' : OCRE}`,
                  background: u.is_admin ? 'none' : 'rgba(232,160,32,0.08)',
                  color: u.is_admin ? 'var(--arvo-fg-soft)' : OCRE,
                  opacity: busy === u.id ? 0.5 : 1,
                }}
              >
                {u.is_admin ? (tu.demote ?? 'Remover admin') : (tu.promote ?? 'Tornar admin')}
              </button>
            </div>
          </div>
        ))}

        {users.length === 0 && (
          <p style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 14, color: 'var(--arvo-fg-soft)', padding: '16px' }}>{tu.empty ?? 'Nenhum usuário encontrado.'}</p>
        )}
      </div>

      {hasMore && (
        <div className="flex justify-center">
          <button
            onClick={() => load(page + 1, effectiveQ, true)}
            disabled={loadingMore}
            style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 13.5, padding: '9px 22px', borderRadius: 999, border: '1px solid var(--arvo-border)', background: 'var(--arvo-surface)', color: 'var(--arvo-fg)', cursor: 'pointer', opacity: loadingMore ? 0.5 : 1 }}
          >
            {loadingMore ? (tu.loading ?? 'Carregando...') : (tu.loadMore ?? 'Carregar mais')}
          </button>
        </div>
      )}
    </div>
  )
}
