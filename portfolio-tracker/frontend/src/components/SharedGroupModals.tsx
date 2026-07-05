import { useState, useEffect } from 'react'
import { apiFetch } from '../lib/api'
import { useActiveFriends } from '../hooks/useActiveFriends'
import VoyageAvatar from '../pages/voyage/_shared/Avatar'

// Peças reutilizáveis pra grupos de categoria compartilhada (shared_groups) —
// usadas tanto em Amigos (criar/editar grupo, gerenciar membros) quanto no
// Planejamento (compartilhar categoria com um grupo). Antes viviam dentro de
// finances/SharedCategoriesPage.tsx, mas aquela página deixou de ser roteada
// (grupo migrou pra Amigos, ver docs/SHARED_EXPENSES_MODEL.md) — só o que era
// de fato reaproveitado sobrou aqui.

export interface MemberDisplay { name: string; email: string; avatar_url?: string }
export interface Member {
  id: number
  user_id: string | null
  invite_email: string | null
  status: 'pending' | 'active' | 'left'
  share_pct: number
  share_mode: 'salary_based' | 'manual'
  salary_authorized: boolean
  display: MemberDisplay
}
interface SharedCategory {
  id: number
  group_id: number
  name: string
  icon: string
  color: string
  total_goal: number
  total_spent: number
  member_spent: Record<string, number>
  currency: string
  my_share_pct: number
  my_goal: number
}
export interface Group {
  id: number
  name: string
  created_by: string
  members: Member[]
  categories: SharedCategory[]
  // Saldo do "momento oculto do grupo" (despesas avulsas, não categoria de
  // orçamento) — ver docs/SHARED_EXPENSES_MODEL.md.
  default_moment_id?: number | null
  balance?: { currency: string; amount: number }[]
}

export function ModalOverlay({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center" style={{ background: 'rgba(0,0,0,0.45)' }} onClick={onClose}>
      <div
        className="w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl p-6 max-h-[90vh] overflow-y-auto"
        style={{ background: 'var(--arvo-surface)', boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}
        onClick={e => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  )
}

export function GroupModal({ s, initial, onClose, onSaved }: {
  s: Record<string, string>
  initial?: Group
  onClose: () => void
  onSaved: (id?: number) => void
}) {
  const [name, setName] = useState(initial?.name ?? '')
  const [saving, setSaving] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) return
    setSaving(true)
    try {
      if (initial) {
        await apiFetch(`/shared/groups/${initial.id}`, { method: 'PATCH', body: JSON.stringify({ name }) })
        onSaved()
      } else {
        const data = await apiFetch<{ id: number }>('/shared/groups', { method: 'POST', body: JSON.stringify({ name }) })
        onSaved(data.id)
      }
    } finally { setSaving(false) }
  }

  return (
    <ModalOverlay onClose={onClose}>
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <h2 className="text-sm font-semibold" style={{ color: 'var(--arvo-fg)', fontFamily: 'var(--arvo-font-body)', letterSpacing: '0.06em' }}>
          {initial ? (s.editGroup ?? 'Editar grupo') : s.newGroup}
        </h2>
        <div className="flex flex-col gap-1">
          <label className="text-[11px] uppercase tracking-widest" style={{ color: 'var(--arvo-fg-soft)', fontFamily: 'var(--arvo-font-body)' }}>{s.groupName}</label>
          <input
            value={name} onChange={e => setName(e.target.value)}
            placeholder={s.groupNamePlaceholder} autoFocus
            className="w-full px-3 py-2.5 rounded-lg text-sm"
            style={{ border: '1px solid var(--arvo-border)', background: 'var(--arvo-surface)', color: 'var(--arvo-fg)', outline: 'none' }}
          />
        </div>
        <div className="flex gap-2 justify-end">
          <button type="button" onClick={onClose} className="px-4 py-2 rounded-lg text-xs" style={{ background: 'var(--arvo-chip-bg)', color: 'var(--arvo-fg)' }}>{s.cancel ?? 'Cancelar'}</button>
          <button type="submit" disabled={saving || !name.trim()} className="px-4 py-2 rounded-lg text-xs" style={{ background: 'var(--arvo-fg)', color: 'var(--arvo-pill-active-fg)', opacity: saving ? 0.6 : 1 }}>
            {saving ? '...' : (initial ? (s.save ?? 'Salvar') : s.newGroup)}
          </button>
        </div>
      </form>
    </ModalOverlay>
  )
}

interface InviteFriend { email: string; name?: string; avatar_url?: string; user_id: string | null }
interface InviteUserSuggestion { user_id: string; username: string; name?: string; avatar_url?: string }

export function InviteModal({ s, result, copied, onInvite, onCopy, onClose }: {
  s: Record<string, string>; result: string | null; copied: boolean
  onInvite: (payload: { email?: string; username?: string }) => Promise<{ direct: boolean }>; onCopy: () => void; onClose: () => void
}) {
  const [query, setQuery] = useState('')
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')
  const friends: InviteFriend[] = useActiveFriends()
  const [suggestions, setSuggestions] = useState<InviteUserSuggestion[]>([])
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [directOk, setDirectOk] = useState(false)
  // Com muitos amigos os chips de "já conectado" ficam gigantes — acima de 8,
  // corta e oferece um filtro local em vez de listar todo mundo de uma vez.
  const [friendFilter, setFriendFilter] = useState('')
  const FRIEND_CHIP_CAP = 8
  const filteredFriends = friendFilter.trim()
    ? friends.filter(f => (f.name ?? f.email).toLowerCase().includes(friendFilter.trim().toLowerCase()))
    : friends.slice(0, FRIEND_CHIP_CAP)

  const isEmailLike = /\S+@\S+\.\S+/.test(query)

  useEffect(() => {
    const q = query.trim().replace(/^@/, '')
    if (isEmailLike || q.length < 2) { setSuggestions([]); return }
    const handle = setTimeout(() => {
      apiFetch<InviteUserSuggestion[]>(`/people/search?q=${encodeURIComponent(q)}`)
        .then(r => { setSuggestions(r); setShowSuggestions(true) })
        .catch(() => setSuggestions([]))
    }, 300)
    return () => clearTimeout(handle)
  }, [query, isEmailLike])

  async function send(payload: { email?: string; username?: string }) {
    setSaving(true); setErr(''); setDirectOk(false)
    try {
      const { direct } = await onInvite(payload)
      if (direct) setDirectOk(true)
      setQuery('')
      setSuggestions([])
      setShowSuggestions(false)
    }
    catch (ex: unknown) { setErr((ex as Error).message ?? 'Erro') }
    finally { setSaving(false) }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (isEmailLike) { send({ email: query.trim() }); return }
    const username = query.trim().replace(/^@/, '')
    if (username.length < 3) { setErr('E-mail ou @ inválido'); return }
    send({ username })
  }

  return (
    <ModalOverlay onClose={onClose}>
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <h2 className="text-sm font-semibold" style={{ color: 'var(--arvo-fg)', fontFamily: 'var(--arvo-font-body)', letterSpacing: '0.06em' }}>{s.invite}</h2>
        {!result ? (
          <>
            <p className="text-xs" style={{ color: 'var(--arvo-fg-soft)', lineHeight: 1.5 }}>
              {s.inviteHint ?? 'Informe o e-mail ou @usuário do convidado. Ele(a) recebe um convite e precisa aceitar, a menos que tenha ativado "aceitar automaticamente" pra você.'}
            </p>
            {directOk && (
              <p className="text-xs" style={{ color: '#1F8A5B' }}>
                {s.inviteDirectOk ?? '✓ Adicionado direto: já é membro ativo do grupo.'}
              </p>
            )}

            {friends.length > FRIEND_CHIP_CAP && (
              <input
                type="text" value={friendFilter} onChange={e => setFriendFilter(e.target.value)}
                placeholder={s.filterFriendsPlaceholder ?? 'Filtrar amigos já conectados...'}
                className="w-full px-3 py-2 rounded-lg text-xs"
                style={{ border: '1px solid var(--arvo-border)', background: 'var(--arvo-surface)', color: 'var(--arvo-fg)', outline: 'none' }}
              />
            )}
            {friends.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {filteredFriends.map(f => (
                  <button
                    key={f.email} type="button" onClick={() => send({ email: f.email })} disabled={saving}
                    title={`Convidar ${f.name || f.email}`}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 6, padding: '4px 10px 4px 4px',
                      borderRadius: 999, border: '1px solid var(--arvo-border)', background: 'var(--arvo-hover-bg)',
                      cursor: 'pointer', fontFamily: 'var(--arvo-font-body)', fontSize: 11.5, color: 'var(--arvo-fg)',
                    }}
                  >
                    <VoyageAvatar name={f.name} email={f.email} avatarUrl={f.avatar_url} size={20} />
                    {f.name || f.email}
                    <span style={{ color: 'var(--arvo-fg-soft)' }}>+</span>
                  </button>
                ))}
              </div>
            )}
            {friends.length > FRIEND_CHIP_CAP && !friendFilter.trim() && (
              <p className="text-[11px]" style={{ color: 'var(--arvo-fg-soft)' }}>
                {(s.andMoreFriends ?? '+ {n} amigos, use o filtro acima').replace('{n}', String(friends.length - FRIEND_CHIP_CAP))}
              </p>
            )}

            <div className="flex flex-col gap-1" style={{ position: 'relative' }}>
              <label className="text-[11px] uppercase tracking-widest" style={{ color: 'var(--arvo-fg-soft)', fontFamily: 'var(--arvo-font-body)' }}>{s.inviteEmail}</label>
              <input
                type="text" value={query} onChange={e => setQuery(e.target.value)} autoFocus
                placeholder="email@exemplo.com ou @usuario"
                onFocus={() => setShowSuggestions(true)}
                onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
                className="w-full px-3 py-2.5 rounded-lg text-sm"
                style={{ border: `1px solid ${err ? 'var(--arvo-red)' : 'var(--arvo-border)'}`, background: 'var(--arvo-surface)', color: 'var(--arvo-fg)', outline: 'none' }}
              />
              {err && <p className="text-xs" style={{ color: 'var(--arvo-red)' }}>{err}</p>}

              {showSuggestions && suggestions.length > 0 && (
                <div style={{
                  position: 'absolute', top: '100%', left: 0, right: 0, marginTop: -4, zIndex: 30,
                  background: 'var(--arvo-surface)', border: '1px solid var(--arvo-border)',
                  borderRadius: 10, boxShadow: 'var(--arvo-shadow-md)', overflow: 'hidden',
                }}>
                  {suggestions.map(sg => (
                    <button
                      type="button" key={sg.user_id}
                      onClick={() => send({ username: sg.username })}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 10, width: '100%', textAlign: 'left',
                        padding: '8px 12px', background: 'none', border: 'none', cursor: 'pointer',
                      }}
                    >
                      <VoyageAvatar name={sg.name} avatarUrl={sg.avatar_url} size={26} />
                      <span style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 12.5, color: 'var(--arvo-fg)' }}>
                        {sg.name || `@${sg.username}`}
                      </span>
                      <span style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 11, color: 'var(--arvo-fg-soft)' }}>
                        @{sg.username}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div className="flex gap-2 justify-end">
              <button type="button" onClick={onClose} className="px-4 py-2 rounded-lg text-xs" style={{ background: 'var(--arvo-chip-bg)', color: 'var(--arvo-fg)' }}>{s.cancel ?? 'Cancelar'}</button>
              <button type="submit" disabled={saving} className="px-4 py-2 rounded-lg text-xs" style={{ background: 'var(--arvo-fg)', color: 'var(--arvo-pill-active-fg)', opacity: saving ? 0.6 : 1 }}>
                {saving ? '...' : (s.generateLink ?? 'Gerar link')}
              </button>
            </div>
          </>
        ) : (
          <>
            <p className="text-xs" style={{ color: 'var(--arvo-fg-soft)', lineHeight: 1.5 }}>
              {s.inviteLinkReady ?? 'Link gerado! Copie e envie via WhatsApp, e-mail ou onde preferir.'}
            </p>
            <div className="flex items-center gap-2">
              <input readOnly value={result} className="flex-1 px-3 py-2 rounded-lg text-xs" style={{ border: '1px solid var(--arvo-border)', background: 'var(--arvo-hover-bg)', color: 'var(--arvo-fg)', outline: 'none' }} />
              <button type="button" onClick={onCopy} className="px-3 py-2 rounded-lg text-xs shrink-0" style={{ background: copied ? 'var(--arvo-green)' : 'var(--arvo-fg)', color: copied ? 'var(--arvo-offwhite)' : 'var(--arvo-pill-active-fg)' }}>
                {copied ? s.linkCopied : s.copyLink}
              </button>
            </div>
            <button type="button" onClick={onClose} className="text-xs self-end" style={{ color: 'var(--arvo-fg-soft)' }}>{s.close ?? 'Fechar'}</button>
          </>
        )}
      </form>
    </ModalOverlay>
  )
}
