import { useState, useEffect, useCallback } from 'react'
import { apiFetch } from '../../lib/api'
import { useI18n } from '../../contexts/I18nContext'
import { useAuth } from '../../contexts/AuthContext'

// ─── Types ───────────────────────────────────────────────────────────────────

interface MemberDisplay { name: string; email: string; avatar_url?: string }
interface Member {
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
  currency: string
  my_share_pct: number
  my_goal: number
}
interface Group {
  id: number
  name: string
  created_by: string
  members: Member[]
  categories: SharedCategory[]
}
interface DetailMember {
  member_id: number
  user_id: string
  display: MemberDisplay
  share_pct: number
  goal: number
  spent: number
  is_me: boolean
}
interface DetailTxn {
  id: number
  user_id: string
  date: string
  description: string
  amount: number
  currency: string
}
interface CategoryDetail {
  category: SharedCategory
  members: DetailMember[]
  transactions: DetailTxn[]
  alerts: { user_id: string; name: string; overspent_by: number }[]
  total_spent: number
}
interface FinanceCategory { id: number; name: string; icon: string; color?: string }

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmt(n: number, currency = 'EUR') {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency, minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(n)
}

function Avatar({ display, size = 28 }: { display: MemberDisplay; size?: number }) {
  const initials = display.name?.slice(0, 2).toUpperCase() || '?'
  if (display.avatar_url) {
    return <img src={display.avatar_url} alt={display.name} style={{ width: size, height: size, borderRadius: '50%', objectFit: 'cover' }} />
  }
  return (
    <div style={{ width: size, height: size, borderRadius: '50%', background: 'var(--arvo-black)', color: 'var(--arvo-gold)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: size * 0.36, fontFamily: 'var(--arvo-font-body)', letterSpacing: '0.06em', flexShrink: 0 }}>
      {initials}
    </div>
  )
}

const ICONS = ['🏠','💡','🚗','🛒','💊','📱','🎬','✈️','🏋️','🐾','📚','🧾','🎓','🏦','💰','🍽️']
const COLORS = ['#3b82f6','#10b981','#f59e0b','#ef4444','#8b5cf6','#6366f1','#ec4899','#f97316','#06b6d4','#84cc16']

// ─── Main Page ───────────────────────────────────────────────────────────────

export default function SharedCategoriesPage() {
  const { t } = useI18n()
  const { user } = useAuth()
  const s = t.shared

  const [groups, setGroups] = useState<Group[]>([])
  const [loading, setLoading] = useState(true)
  const [activeGroupId, setActiveGroupId] = useState<number | null>(null)
  const [activeCatId, setActiveCatId] = useState<number | null>(null)
  const [detail, setDetail] = useState<CategoryDetail | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)

  // Modals
  const [showGroupModal, setShowGroupModal] = useState<'new' | Group | null>(null)
  const [showInvite, setShowInvite] = useState<number | null>(null)
  const [showNewCat, setShowNewCat] = useState<number | null>(null)
  const [editCat, setEditCat] = useState<SharedCategory | null>(null)
  const [showPickCategory, setShowPickCategory] = useState<number | null>(null) // groupId
  const [prefilledCat, setPrefilledCat] = useState<Partial<SharedCategory> | null>(null)
  const [inviteResult, setInviteResult] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const data = await apiFetch<Group[]>('/shared/groups')
      setGroups(data)
      if (data.length) setActiveGroupId(prev => prev ?? data[0].id)
    } catch { /* ignore */ } finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [])

  const loadDetail = useCallback(async (catId: number) => {
    setDetailLoading(true)
    setActiveCatId(catId)
    try {
      const data = await apiFetch<CategoryDetail>(`/shared/categories/${catId}/detail`)
      setDetail(data)
    } catch { /* ignore */ } finally { setDetailLoading(false) }
  }, [])

  const activeGroup = groups.find(g => g.id === activeGroupId) ?? null

  if (loading) {
    return (
      <div className="flex flex-col gap-6">
        <div style={{ height: 28, borderRadius: 6, background: 'var(--arvo-border)', width: 200 }} className="animate-pulse" />
        <div style={{ height: 120, borderRadius: 12, background: 'var(--arvo-border)' }} className="animate-pulse" />
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-6 pb-4">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 style={{ fontFamily: 'var(--arvo-font-display)', fontSize: 22, letterSpacing: '0.06em', color: 'var(--arvo-black)' }}>{s.pageTitle}</h1>
          <p className="text-xs mt-0.5" style={{ color: 'var(--arvo-fg-soft)' }}>{s.pageSubtitle}</p>
        </div>
        <button
          onClick={() => setShowGroupModal('new')}
          className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs transition-all"
          style={{ background: 'var(--arvo-black)', color: 'var(--arvo-offwhite)', fontFamily: 'var(--arvo-font-body)', letterSpacing: '0.08em' }}
        >
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-3.5 h-3.5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M8 1v14M1 8h14" />
          </svg>
          {s.newGroup}
        </button>
      </div>

      {groups.length === 0 ? (
        <EmptyState s={s} onNew={() => setShowGroupModal('new')} />
      ) : (
        <div className="flex flex-col gap-4">
          {/* Group tabs */}
          {groups.length > 1 && (
            <div className="flex gap-2 flex-wrap">
              {groups.map(g => (
                <button
                  key={g.id}
                  onClick={() => { setActiveGroupId(g.id); setActiveCatId(null); setDetail(null) }}
                  className="px-3 py-1.5 rounded-full text-xs transition-all"
                  style={g.id === activeGroupId
                    ? { background: 'var(--arvo-black)', color: 'var(--arvo-offwhite)', fontFamily: 'var(--arvo-font-body)', letterSpacing: '0.06em' }
                    : { background: 'rgba(13,13,13,0.07)', color: 'var(--arvo-fg)', fontFamily: 'var(--arvo-font-body)', letterSpacing: '0.06em' }}
                >{g.name}</button>
              ))}
            </div>
          )}

          {activeGroup && (
            <GroupPanel
              group={activeGroup}
              userId={user?.id ?? ''}
              s={s}
              onEditGroup={() => setShowGroupModal(activeGroup)}
              onInvite={() => { setShowInvite(activeGroup.id); setInviteResult(null) }}
              onResendInvite={async (email) => {
                const data = await apiFetch<{ invite_url: string }>(`/shared/groups/${activeGroup.id}/invite`, { method: 'POST', body: JSON.stringify({ email }) })
                setInviteResult(data.invite_url)
                setShowInvite(activeGroup.id)
              }}
              onNewCat={() => { setPrefilledCat(null); setShowNewCat(activeGroup.id) }}
              onPickExisting={() => setShowPickCategory(activeGroup.id)}
              onEditCat={setEditCat}
              onSelectCat={loadDetail}
              activeCatId={activeCatId}
              onRefresh={load}
              onDelete={() => { load(); setActiveGroupId(null) }}
            />
          )}

          {activeCatId && (
            <CategoryDetailPanel
              loading={detailLoading}
              detail={detail}
              s={s}
              onClose={() => { setActiveCatId(null); setDetail(null) }}
            />
          )}
        </div>
      )}

      {/* Modals */}
      {showGroupModal && (
        <GroupModal
          s={s}
          initial={showGroupModal === 'new' ? undefined : showGroupModal}
          onClose={() => setShowGroupModal(null)}
          onSaved={(id) => { setShowGroupModal(null); load(); if (id) setActiveGroupId(id) }}
        />
      )}
      {showInvite !== null && (
        <InviteModal
          s={s}
          result={inviteResult}
          copied={copied}
          onInvite={async (email) => {
            const data = await apiFetch<{ invite_url: string }>(`/shared/groups/${showInvite}/invite`, { method: 'POST', body: JSON.stringify({ email }) })
            setInviteResult(data.invite_url)
            load()
          }}
          onCopy={() => {
            if (inviteResult) { navigator.clipboard.writeText(inviteResult); setCopied(true); setTimeout(() => setCopied(false), 2000) }
          }}
          onClose={() => { setShowInvite(null); setInviteResult(null); setCopied(false) }}
        />
      )}
      {showPickCategory !== null && (
        <PickCategoryModal
          s={s}
          onClose={() => setShowPickCategory(null)}
          onPick={(cat) => {
            setShowPickCategory(null)
            setPrefilledCat({ name: cat.name, icon: cat.icon, color: cat.color })
            setShowNewCat(activeGroupId!)
          }}
        />
      )}
      {(showNewCat !== null || editCat) && (
        <CategoryModal
          s={s}
          groupId={showNewCat ?? editCat!.group_id}
          initial={editCat ?? undefined}
          prefilled={prefilledCat ?? undefined}
          onClose={() => { setShowNewCat(null); setEditCat(null); setPrefilledCat(null) }}
          onSaved={() => { setShowNewCat(null); setEditCat(null); setPrefilledCat(null); load() }}
        />
      )}
    </div>
  )
}

// ─── Empty State ─────────────────────────────────────────────────────────────

function EmptyState({ s, onNew }: { s: Record<string, string>; onNew: () => void }) {
  return (
    <div className="flex flex-col items-center gap-4 py-16 text-center">
      <div style={{ width: 56, height: 56, borderRadius: '50%', background: 'rgba(13,13,13,0.06)', border: '1px solid var(--arvo-border)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} style={{ width: 24, height: 24, color: 'var(--arvo-fg-soft)' }}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M18 18.72a9.094 9.094 0 0 0 3.741-.479 3 3 0 0 0-4.682-2.72m.94 3.198.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0 1 12 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 0 1 6 18.719m12 0a5.971 5.971 0 0 0-.941-3.197m0 0A5.995 5.995 0 0 0 12 12.75a5.995 5.995 0 0 0-5.058 2.772m0 0a3 3 0 0 0-4.681 2.72 8.986 8.986 0 0 0 3.74.477m.94-3.197a5.971 5.971 0 0 0-.94 3.197M15 6.75a3 3 0 1 1-6 0 3 3 0 0 1 6 0Zm6 3a2.25 2.25 0 1 1-4.5 0 2.25 2.25 0 0 1 4.5 0Zm-13.5 0a2.25 2.25 0 1 1-4.5 0 2.25 2.25 0 0 1 4.5 0Z" />
        </svg>
      </div>
      <div>
        <p className="text-sm font-medium" style={{ color: 'var(--arvo-black)' }}>{s.noGroups}</p>
        <p className="text-xs mt-1 max-w-xs" style={{ color: 'var(--arvo-fg-soft)' }}>{s.createFirstGroup}</p>
      </div>
      <button onClick={onNew} className="px-4 py-2 rounded-lg text-xs"
        style={{ background: 'var(--arvo-black)', color: 'var(--arvo-offwhite)', fontFamily: 'var(--arvo-font-body)', letterSpacing: '0.08em' }}>
        {s.newGroup}
      </button>
    </div>
  )
}

// ─── Group Panel ──────────────────────────────────────────────────────────────

function GroupPanel({ group, userId, s, onEditGroup, onInvite, onResendInvite, onNewCat, onPickExisting, onEditCat, onSelectCat, activeCatId, onRefresh, onDelete }: {
  group: Group; userId: string; s: Record<string, string>
  onEditGroup: () => void
  onInvite: () => void
  onResendInvite: (email: string) => Promise<void>
  onNewCat: () => void
  onPickExisting: () => void
  onEditCat: (c: SharedCategory) => void
  onSelectCat: (id: number) => void
  activeCatId: number | null
  onRefresh: () => void
  onDelete: () => void
}) {
  const [showMembers, setShowMembers] = useState(false)
  const [editingPct, setEditingPct] = useState<number | null>(null) // memberId
  const [pctVal, setPctVal] = useState('')
  const [savingPct, setSavingPct] = useState(false)
  const [resending, setResending] = useState<number | null>(null)
  const [toggingSalary, setToggingSalary] = useState(false)

  async function handleDeleteGroup() {
    if (!confirm(s.deleteGroupConfirm)) return
    await apiFetch(`/shared/groups/${group.id}`, { method: 'DELETE' })
    onDelete()
  }

  async function handleLeave(memberId: number) {
    if (!confirm(s.leaveConfirm)) return
    await apiFetch(`/shared/groups/${group.id}/members/${memberId}`, { method: 'DELETE' })
    onRefresh()
  }

  async function savePct(memberId: number) {
    const pct = parseFloat(pctVal)
    if (isNaN(pct) || pct < 0 || pct > 100) { setEditingPct(null); return }
    setSavingPct(true)
    try {
      await apiFetch(`/shared/groups/${group.id}/members/${memberId}`, { method: 'PATCH', body: JSON.stringify({ share_pct: pct }) })
      onRefresh()
    } finally { setSavingPct(false); setEditingPct(null) }
  }

  async function handleResend(m: Member) {
    if (!m.invite_email) return
    setResending(m.id)
    try { await onResendInvite(m.invite_email) }
    finally { setResending(null) }
  }

  async function toggleSalary(myMemberId: number, current: boolean) {
    setToggingSalary(true)
    try {
      await apiFetch(`/shared/groups/${group.id}/members/${myMemberId}`, {
        method: 'PATCH',
        body: JSON.stringify({ salary_authorized: !current, share_mode: !current ? 'salary_based' : 'manual' }),
      })
      onRefresh()
    } finally { setToggingSalary(false) }
  }

  const myMember = group.members.find(m => m.user_id === userId)

  return (
    <div className="flex flex-col gap-3">
      {/* Group header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="flex -space-x-2">
            {group.members.filter(m => m.status === 'active').slice(0, 3).map(m => (
              <div key={m.id} style={{ border: '2px solid var(--arvo-offwhite)', borderRadius: '50%' }}>
                <Avatar display={m.display} size={28} />
              </div>
            ))}
          </div>
          <button onClick={() => setShowMembers(v => !v)} className="text-left" style={{ fontFamily: 'var(--arvo-font-body)' }}>
            <span className="text-sm font-semibold" style={{ color: 'var(--arvo-black)' }}>{group.name}</span>
            <span className="text-xs ml-1.5" style={{ color: 'var(--arvo-fg-soft)' }}>· {s.groupMembers} ({group.members.filter(m => m.status !== 'left').length})</span>
          </button>
        </div>
        <div className="flex gap-1.5">
          <button onClick={onEditGroup} className="px-2 py-1.5 rounded-lg" style={{ color: 'var(--arvo-fg-soft)', background: 'rgba(13,13,13,0.06)' }} title={s.editGroup}>
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-4 h-4">
              <path strokeLinecap="round" strokeLinejoin="round" d="M11.5 2.5l2 2-8 8H3.5v-2l8-8z" />
            </svg>
          </button>
          <button onClick={onInvite} className="px-3 py-1.5 rounded-lg text-xs font-medium transition-all" style={{ background: 'rgba(13,13,13,0.07)', color: 'var(--arvo-fg)', fontFamily: 'var(--arvo-font-body)', letterSpacing: '0.04em' }}>
            + {s.invite}
          </button>
          <button onClick={handleDeleteGroup} className="px-2 py-1.5 rounded-lg" style={{ color: 'var(--arvo-red)', background: 'rgba(214,59,47,0.06)' }}>
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-4 h-4">
              <path strokeLinecap="round" strokeLinejoin="round" d="M2 4.5h12v1.5H2zM3.5 6v7h9V6M6 9h4M6.5 2.5h3" />
            </svg>
          </button>
        </div>
      </div>

      {/* Members list */}
      {showMembers && (
        <div className="rounded-xl p-4 flex flex-col gap-3" style={{ background: 'rgba(13,13,13,0.04)', border: '1px solid var(--arvo-border-soft)' }}>
          {group.members.filter(m => m.status !== 'left').map(m => {
            const isMe = m.user_id === userId
            const accountDeleted = !m.user_id && m.status === 'active'
            return (
              <div key={m.id} className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3 min-w-0">
                  <Avatar display={m.display} size={32} />
                  <div className="min-w-0">
                    <p className="text-sm font-semibold truncate" style={{ color: accountDeleted ? 'var(--arvo-fg-soft)' : 'var(--arvo-black)' }}>
                      {accountDeleted
                        ? <span className="italic">{s.accountDeleted ?? 'Conta excluída'}</span>
                        : <>{m.display.name}{isMe ? <span className="font-normal text-xs ml-1" style={{ color: 'var(--arvo-fg-soft)' }}>(você)</span> : ''}</>
                      }
                    </p>
                    {m.status === 'pending' ? (
                      <p className="text-xs mt-0.5" style={{ color: 'var(--arvo-fg-soft)' }}>{s.pending}</p>
                    ) : editingPct === m.id ? (
                      <div className="flex items-center gap-2 mt-1">
                        <input
                          type="number" min="0" max="100" value={pctVal}
                          onChange={e => setPctVal(e.target.value)}
                          onKeyDown={e => { if (e.key === 'Enter') savePct(m.id); if (e.key === 'Escape') setEditingPct(null) }}
                          autoFocus
                          className="w-16 px-2 py-1 rounded-lg text-sm font-semibold"
                          style={{ border: '1.5px solid var(--arvo-black)', outline: 'none' }}
                        />
                        <span className="text-sm font-medium" style={{ color: 'var(--arvo-fg-soft)' }}>%</span>
                        <button onClick={() => savePct(m.id)} disabled={savingPct} className="px-2.5 py-1 rounded-lg text-xs font-semibold" style={{ background: 'var(--arvo-black)', color: 'white' }}>
                          {savingPct ? '...' : s.save ?? 'Salvar'}
                        </button>
                        <button onClick={() => setEditingPct(null)} className="px-2 py-1 rounded-lg text-xs" style={{ color: 'var(--arvo-fg-soft)' }}>✕</button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2 mt-0.5">
                        <button
                          onClick={() => isMe ? (setEditingPct(m.id), setPctVal(String(m.share_pct))) : undefined}
                          className="text-sm font-bold"
                          style={{
                            color: 'var(--arvo-black)',
                            cursor: isMe ? 'pointer' : 'default',
                            background: isMe ? 'rgba(13,13,13,0.08)' : 'transparent',
                            padding: isMe ? '2px 8px' : '2px 0',
                            borderRadius: 6,
                          }}
                          title={isMe ? s.editPct : undefined}
                        >
                          {m.share_pct}%
                        </button>
                        {m.share_mode === 'salary_based' && (
                          <span className="text-xs px-1.5 py-0.5 rounded-full" style={{ background: 'rgba(31,138,91,0.10)', color: 'var(--arvo-green)', fontWeight: 600 }}>
                            {s.salaryBased}
                          </span>
                        )}
                      </div>
                    )}
                    {/* Salary authorization toggle — only for me, only when active */}
                    {isMe && m.status === 'active' && editingPct !== m.id && (
                      <button
                        onClick={() => toggleSalary(m.id, m.salary_authorized)}
                        disabled={toggingSalary}
                        className="mt-1.5 text-xs flex items-center gap-1.5"
                        style={{ color: m.salary_authorized ? 'var(--arvo-green)' : 'var(--arvo-fg-soft)', opacity: toggingSalary ? 0.5 : 1 }}
                      >
                        <span style={{ fontSize: 14 }}>{m.salary_authorized ? '✅' : '☐'}</span>
                        {m.salary_authorized ? s.salaryAuthorized : s.authorizeSalary}
                      </button>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0 mt-0.5">
                  {m.status === 'pending' && (
                    <button
                      onClick={() => handleResend(m)}
                      disabled={resending === m.id}
                      className="text-xs px-3 py-1.5 rounded-lg font-medium"
                      style={{ color: 'var(--arvo-black)', background: 'rgba(13,13,13,0.08)', opacity: resending === m.id ? 0.5 : 1 }}
                    >
                      {resending === m.id ? '...' : s.resendInvite}
                    </button>
                  )}
                  {isMe && m.status === 'active' && (
                    <button onClick={() => handleLeave(m.id)} className="text-xs px-3 py-1.5 rounded-lg" style={{ color: 'var(--arvo-fg-soft)', background: 'rgba(13,13,13,0.06)' }}>
                      {s.leaveGroup}
                    </button>
                  )}
                </div>
              </div>
            )
          })}
          <p className="text-xs pt-1 border-t" style={{ color: 'var(--arvo-fg-soft)', borderColor: 'var(--arvo-border-soft)' }}>
            {s.editPctHint}
          </p>
        </div>
      )}

      {/* Categories */}
      <div className="flex flex-col gap-2">
        {group.categories.length === 0 ? (
          <p className="text-xs text-center py-4" style={{ color: 'var(--arvo-fg-soft)' }}>{s.noCategories}</p>
        ) : (
          group.categories.map(cat => {
            const myPct = myMember?.share_pct ?? 50
            const myGoal = cat.total_goal * myPct / 100
            return (
              <SharedCategoryCard
                key={cat.id}
                cat={{ ...cat, my_share_pct: myPct, my_goal: myGoal }}
                group={group}
                s={s}
                active={activeCatId === cat.id}
                onClick={() => onSelectCat(cat.id)}
                onEdit={() => onEditCat(cat)}
              />
            )
          })
        )}
        <div className="flex gap-2">
          <button
            onClick={onNewCat}
            className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl text-xs transition-all border border-dashed"
            style={{ borderColor: 'var(--arvo-border)', color: 'var(--arvo-fg-soft)', fontFamily: 'var(--arvo-font-body)' }}
          >
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-3.5 h-3.5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M8 1v14M1 8h14" />
            </svg>
            {s.addCategory}
          </button>
          <button
            onClick={onPickExisting}
            className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl text-xs transition-all border border-dashed"
            style={{ borderColor: 'var(--arvo-border)', color: 'var(--arvo-fg-soft)', fontFamily: 'var(--arvo-font-body)' }}
          >
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-3.5 h-3.5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M1.5 3h13M1.5 8h8.5M1.5 13h5.5" />
            </svg>
            {s.useExistingCategory ?? 'Usar existente'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Shared Category Card ─────────────────────────────────────────────────────

function SharedCategoryCard({ cat, group, s, active, onClick, onEdit }: {
  cat: SharedCategory; group: Group; s: Record<string, string>
  active: boolean; onClick: () => void; onEdit: () => void
}) {
  const memberAvatars = group.members.filter(m => m.status === 'active' && m.user_id)
  const myPct = cat.my_share_pct

  return (
    <div
      onClick={onClick}
      className="rounded-xl p-4 cursor-pointer transition-all"
      style={{
        background: active ? `${cat.color}10` : 'white',
        border: `1px solid ${active ? cat.color : 'var(--arvo-border-soft)'}`,
        boxShadow: active ? `0 0 0 2px ${cat.color}30` : undefined,
      }}
    >
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span style={{ fontSize: 18 }}>{cat.icon}</span>
          <div>
            <p className="text-sm font-medium" style={{ color: 'var(--arvo-black)' }}>{cat.name}</p>
            <p className="text-[10px]" style={{ color: 'var(--arvo-fg-soft)' }}>{s.sharedWith}: {memberAvatars.map(m => m.display.name.split(' ')[0]).join(', ')}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex -space-x-1.5">
            {memberAvatars.slice(0, 2).map(m => (
              <div key={m.id} style={{ border: '1.5px solid white', borderRadius: '50%' }}>
                <Avatar display={m.display} size={20} />
              </div>
            ))}
          </div>
          <button onClick={e => { e.stopPropagation(); onEdit() }} style={{ color: 'var(--arvo-fg-soft)' }}>
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-3.5 h-3.5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M11.5 2.5l2 2-8 8H3.5v-2l8-8z" />
            </svg>
          </button>
        </div>
      </div>
      <div className="flex justify-between text-[10px] mb-1.5" style={{ color: 'var(--arvo-fg-soft)' }}>
        <span>{s.yourGoal}: <strong style={{ color: 'var(--arvo-black)' }}>{fmt(cat.my_goal, cat.currency)}</strong> ({myPct}%)</span>
        <span>{s.totalGoal}: <strong style={{ color: 'var(--arvo-black)' }}>{fmt(cat.total_goal, cat.currency)}</strong></span>
      </div>
      <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(13,13,13,0.08)' }}>
        <div className="h-full rounded-full" style={{ width: `${myPct}%`, background: cat.color }} />
      </div>
      <p className="text-[10px] mt-1" style={{ color: 'var(--arvo-fg-soft)' }}>{s.shareGoal}: {myPct}% {s.ofTotal}</p>
    </div>
  )
}

// ─── Category Detail Panel ────────────────────────────────────────────────────

function CategoryDetailPanel({ loading, detail, s, onClose }: {
  loading: boolean; detail: CategoryDetail | null; s: Record<string, string>; onClose: () => void
}) {
  return (
    <div className="rounded-xl flex flex-col gap-4 p-4" style={{ background: 'white', border: '1px solid var(--arvo-border-soft)' }}>
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium" style={{ color: 'var(--arvo-black)' }}>{s.thisMonth}</p>
        <button onClick={onClose} style={{ color: 'var(--arvo-fg-soft)' }}>
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4">
            <path strokeLinecap="round" d="M3 3l10 10M13 3L3 13" />
          </svg>
        </button>
      </div>
      {loading && <div className="h-24 rounded-lg animate-pulse" style={{ background: 'var(--arvo-border)' }} />}
      {!loading && detail && (
        <>
          {detail.alerts.map(a => (
            <div key={a.user_id} className="flex items-center gap-2 px-3 py-2 rounded-lg" style={{ background: 'rgba(214,59,47,0.08)', border: '1px solid rgba(214,59,47,0.15)' }}>
              <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-4 h-4 shrink-0" style={{ color: 'var(--arvo-red)' }}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M8 2l6 11H2L8 2zM8 7v3M8 11.5v.5" />
              </svg>
              <p className="text-xs" style={{ color: 'var(--arvo-red)' }}>
                <strong>{a.name}</strong> {s.overspentAlert} (+{fmt(a.overspent_by, detail.category.currency)})
              </p>
            </div>
          ))}
          <div className="flex flex-col gap-3">
            {detail.members.map(m => {
              const pct = m.goal > 0 ? Math.min(100, Math.round(m.spent / m.goal * 100)) : 0
              const over = m.spent > m.goal && m.goal > 0
              return (
                <div key={m.member_id}>
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-1.5">
                      <Avatar display={m.display} size={20} />
                      <span className="text-xs" style={{ color: 'var(--arvo-black)', fontWeight: m.is_me ? 600 : 400 }}>
                        {m.is_me ? 'Você' : m.display.name}
                      </span>
                    </div>
                    <span className="text-xs" style={{ color: over ? 'var(--arvo-red)' : 'var(--arvo-fg-soft)' }}>
                      {fmt(m.spent, detail.category.currency)} / {fmt(m.goal, detail.category.currency)}
                    </span>
                  </div>
                  <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(13,13,13,0.08)' }}>
                    <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: over ? 'var(--arvo-red)' : detail.category.color }} />
                  </div>
                </div>
              )
            })}
          </div>
          <div className="flex justify-between text-xs pt-1" style={{ borderTop: '1px solid var(--arvo-border-soft)', color: 'var(--arvo-fg-soft)' }}>
            <span>{s.totalSpent}</span>
            <strong style={{ color: 'var(--arvo-black)' }}>{fmt(detail.total_spent, detail.category.currency)} / {fmt(detail.category.total_goal, detail.category.currency)}</strong>
          </div>
          {detail.transactions.length > 0 && (
            <div className="flex flex-col gap-1">
              <p className="text-[10px] uppercase tracking-widest mb-1" style={{ color: 'var(--arvo-fg-soft)', fontFamily: 'var(--arvo-font-body)' }}>{s.transactions}</p>
              {detail.transactions.map(txn => {
                const member = detail.members.find(m => m.user_id === txn.user_id)
                return (
                  <div key={txn.id} className="flex items-center justify-between px-2 py-2 rounded-lg" style={{ background: 'rgba(13,13,13,0.03)' }}>
                    <div className="flex items-center gap-2 min-w-0">
                      {member && <Avatar display={member.display} size={18} />}
                      <div className="min-w-0">
                        <p className="text-xs truncate" style={{ color: 'var(--arvo-black)' }}>{txn.description}</p>
                        <p className="text-[10px]" style={{ color: 'var(--arvo-fg-soft)' }}>{txn.date}</p>
                      </div>
                    </div>
                    <span className="text-xs ml-2 shrink-0" style={{ color: 'var(--arvo-red)' }}>{fmt(Math.abs(txn.amount), txn.currency)}</span>
                  </div>
                )
              })}
            </div>
          )}
        </>
      )}
    </div>
  )
}

// ─── Modals ───────────────────────────────────────────────────────────────────

function GroupModal({ s, initial, onClose, onSaved }: {
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
        <h2 className="text-sm font-semibold" style={{ color: 'var(--arvo-black)', fontFamily: 'var(--arvo-font-body)', letterSpacing: '0.06em' }}>
          {initial ? (s.editGroup ?? 'Editar grupo') : s.newGroup}
        </h2>
        <div className="flex flex-col gap-1">
          <label className="text-[11px] uppercase tracking-widest" style={{ color: 'var(--arvo-fg-soft)', fontFamily: 'var(--arvo-font-body)' }}>{s.groupName}</label>
          <input
            value={name} onChange={e => setName(e.target.value)}
            placeholder={s.groupNamePlaceholder} autoFocus
            className="w-full px-3 py-2.5 rounded-lg text-sm"
            style={{ border: '1px solid var(--arvo-border)', background: 'white', color: 'var(--arvo-black)', outline: 'none' }}
          />
        </div>
        <div className="flex gap-2 justify-end">
          <button type="button" onClick={onClose} className="px-4 py-2 rounded-lg text-xs" style={{ background: 'rgba(13,13,13,0.07)', color: 'var(--arvo-fg)' }}>{s.cancel ?? 'Cancelar'}</button>
          <button type="submit" disabled={saving || !name.trim()} className="px-4 py-2 rounded-lg text-xs" style={{ background: 'var(--arvo-black)', color: 'var(--arvo-offwhite)', opacity: saving ? 0.6 : 1 }}>
            {saving ? '...' : (initial ? (s.save ?? 'Salvar') : s.newGroup)}
          </button>
        </div>
      </form>
    </ModalOverlay>
  )
}

function InviteModal({ s, result, copied, onInvite, onCopy, onClose }: {
  s: Record<string, string>; result: string | null; copied: boolean
  onInvite: (email: string) => Promise<void>; onCopy: () => void; onClose: () => void
}) {
  const [email, setEmail] = useState('')
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!email.includes('@')) { setErr('E-mail inválido'); return }
    setSaving(true); setErr('')
    try { await onInvite(email) }
    catch (ex: unknown) { setErr((ex as Error).message ?? 'Erro') }
    finally { setSaving(false) }
  }

  return (
    <ModalOverlay onClose={onClose}>
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <h2 className="text-sm font-semibold" style={{ color: 'var(--arvo-black)', fontFamily: 'var(--arvo-font-body)', letterSpacing: '0.06em' }}>{s.invite}</h2>
        {!result ? (
          <>
            <p className="text-xs" style={{ color: 'var(--arvo-fg-soft)', lineHeight: 1.5 }}>
              {s.inviteHint ?? 'Informe o e-mail do convidado. Nenhuma mensagem é enviada automaticamente — você receberá um link para compartilhar.'}
            </p>
            <div className="flex flex-col gap-1">
              <label className="text-[11px] uppercase tracking-widest" style={{ color: 'var(--arvo-fg-soft)', fontFamily: 'var(--arvo-font-body)' }}>{s.inviteEmail}</label>
              <input
                type="email" value={email} onChange={e => setEmail(e.target.value)} autoFocus
                className="w-full px-3 py-2.5 rounded-lg text-sm"
                style={{ border: `1px solid ${err ? 'var(--arvo-red)' : 'var(--arvo-border)'}`, background: 'white', color: 'var(--arvo-black)', outline: 'none' }}
              />
              {err && <p className="text-xs" style={{ color: 'var(--arvo-red)' }}>{err}</p>}
            </div>
            <div className="flex gap-2 justify-end">
              <button type="button" onClick={onClose} className="px-4 py-2 rounded-lg text-xs" style={{ background: 'rgba(13,13,13,0.07)', color: 'var(--arvo-fg)' }}>{s.cancel ?? 'Cancelar'}</button>
              <button type="submit" disabled={saving} className="px-4 py-2 rounded-lg text-xs" style={{ background: 'var(--arvo-black)', color: 'var(--arvo-offwhite)', opacity: saving ? 0.6 : 1 }}>
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
              <input readOnly value={result} className="flex-1 px-3 py-2 rounded-lg text-xs" style={{ border: '1px solid var(--arvo-border)', background: 'rgba(13,13,13,0.04)', color: 'var(--arvo-fg)', outline: 'none' }} />
              <button type="button" onClick={onCopy} className="px-3 py-2 rounded-lg text-xs shrink-0" style={{ background: copied ? 'var(--arvo-green)' : 'var(--arvo-black)', color: 'var(--arvo-offwhite)' }}>
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

function PickCategoryModal({ s, onClose, onPick }: {
  s: Record<string, string>
  onClose: () => void
  onPick: (cat: FinanceCategory) => void
}) {
  const [cats, setCats] = useState<FinanceCategory[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    apiFetch<FinanceCategory[]>('/finances/categories')
      .then(data => setCats(data))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  return (
    <ModalOverlay onClose={onClose}>
      <div className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold" style={{ color: 'var(--arvo-black)', fontFamily: 'var(--arvo-font-body)', letterSpacing: '0.06em' }}>
          {s.useExistingCategory ?? 'Usar categoria existente'}
        </h2>
        <p className="text-xs" style={{ color: 'var(--arvo-fg-soft)' }}>
          {s.pickCategoryHint ?? 'Escolha uma categoria do planejamento para usar como base. Você poderá ajustar nome, ícone e meta.'}
        </p>
        {loading ? (
          <div className="h-20 animate-pulse rounded-lg" style={{ background: 'var(--arvo-border)' }} />
        ) : cats.length === 0 ? (
          <p className="text-xs text-center py-4" style={{ color: 'var(--arvo-fg-soft)' }}>Nenhuma categoria encontrada.</p>
        ) : (
          <div className="flex flex-col gap-1 max-h-64 overflow-y-auto">
            {cats.map(cat => (
              <button
                key={cat.id}
                onClick={() => onPick(cat)}
                className="flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-left transition-all hover:bg-gray-50"
                style={{ border: '1px solid transparent' }}
              >
                <span style={{ fontSize: 18 }}>{cat.icon}</span>
                <span className="text-sm" style={{ color: 'var(--arvo-black)' }}>{cat.name}</span>
              </button>
            ))}
          </div>
        )}
        <button type="button" onClick={onClose} className="text-xs self-end mt-1" style={{ color: 'var(--arvo-fg-soft)' }}>{s.cancel ?? 'Cancelar'}</button>
      </div>
    </ModalOverlay>
  )
}

function CategoryModal({ s, groupId, initial, prefilled, onClose, onSaved }: {
  s: Record<string, string>; groupId: number
  initial?: SharedCategory
  prefilled?: Partial<SharedCategory>
  onClose: () => void; onSaved: () => void
}) {
  const [name, setName] = useState(initial?.name ?? prefilled?.name ?? '')
  const [icon, setIcon] = useState(initial?.icon ?? prefilled?.icon ?? '🏠')
  const [color, setColor] = useState(initial?.color ?? prefilled?.color ?? '#3b82f6')
  const [goal, setGoal] = useState(String(initial?.total_goal ?? ''))
  const [currency, setCurrency] = useState(initial?.currency ?? 'EUR')
  const [saving, setSaving] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) return
    setSaving(true)
    try {
      const body = { group_id: groupId, name, icon, color, total_goal: Number(goal) || 0, currency }
      if (initial) {
        await apiFetch(`/shared/categories/${initial.id}`, { method: 'PATCH', body: JSON.stringify(body) })
      } else {
        await apiFetch('/shared/categories', { method: 'POST', body: JSON.stringify(body) })
      }
      onSaved()
    } finally { setSaving(false) }
  }

  async function handleDelete() {
    if (!initial || !confirm('Excluir esta categoria compartilhada?')) return
    await apiFetch(`/shared/categories/${initial.id}`, { method: 'DELETE' })
    onSaved()
  }

  return (
    <ModalOverlay onClose={onClose}>
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <h2 className="text-sm font-semibold" style={{ color: 'var(--arvo-black)', fontFamily: 'var(--arvo-font-body)', letterSpacing: '0.06em' }}>
          {initial ? s.editCategory : s.newSharedCategory}
        </h2>
        <div>
          <label className="text-[11px] uppercase tracking-widest block mb-1" style={{ color: 'var(--arvo-fg-soft)', fontFamily: 'var(--arvo-font-body)' }}>Ícone</label>
          <div className="flex flex-wrap gap-1">
            {ICONS.map(ic => (
              <button key={ic} type="button" onClick={() => setIcon(ic)}
                className="w-8 h-8 rounded-lg text-base flex items-center justify-center transition-all"
                style={{ background: ic === icon ? color + '30' : 'rgba(13,13,13,0.05)', border: ic === icon ? `1px solid ${color}` : '1px solid transparent' }}>
                {ic}
              </button>
            ))}
          </div>
        </div>
        <div>
          <label className="text-[11px] uppercase tracking-widest block mb-1" style={{ color: 'var(--arvo-fg-soft)', fontFamily: 'var(--arvo-font-body)' }}>Cor</label>
          <div className="flex gap-1.5 flex-wrap">
            {COLORS.map(c => (
              <button key={c} type="button" onClick={() => setColor(c)}
                className="w-6 h-6 rounded-full transition-all"
                style={{ background: c, boxShadow: c === color ? `0 0 0 2px white, 0 0 0 3px ${c}` : undefined }} />
            ))}
          </div>
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-[11px] uppercase tracking-widest" style={{ color: 'var(--arvo-fg-soft)', fontFamily: 'var(--arvo-font-body)' }}>Nome</label>
          <input value={name} onChange={e => setName(e.target.value)} autoFocus className="w-full px-3 py-2.5 rounded-lg text-sm"
            style={{ border: '1px solid var(--arvo-border)', background: 'white', color: 'var(--arvo-black)', outline: 'none' }} />
        </div>
        <div className="flex gap-2">
          <div className="flex-1 flex flex-col gap-1">
            <label className="text-[11px] uppercase tracking-widest" style={{ color: 'var(--arvo-fg-soft)', fontFamily: 'var(--arvo-font-body)' }}>{s.totalGoal}</label>
            <input type="number" value={goal} onChange={e => setGoal(e.target.value)} min="0" step="any"
              className="w-full px-3 py-2.5 rounded-lg text-sm"
              style={{ border: '1px solid var(--arvo-border)', background: 'white', color: 'var(--arvo-black)', outline: 'none' }} />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[11px] uppercase tracking-widest" style={{ color: 'var(--arvo-fg-soft)', fontFamily: 'var(--arvo-font-body)' }}>Moeda</label>
            <select value={currency} onChange={e => setCurrency(e.target.value)}
              className="px-3 py-2.5 rounded-lg text-sm"
              style={{ border: '1px solid var(--arvo-border)', background: 'white', color: 'var(--arvo-black)', outline: 'none' }}>
              <option>EUR</option><option>BRL</option><option>USD</option>
            </select>
          </div>
        </div>
        <div className="flex gap-2 justify-between items-center">
          {initial && (
            <button type="button" onClick={handleDelete} className="text-xs" style={{ color: 'var(--arvo-red)' }}>Excluir</button>
          )}
          <div className="flex gap-2 ml-auto">
            <button type="button" onClick={onClose} className="px-4 py-2 rounded-lg text-xs" style={{ background: 'rgba(13,13,13,0.07)', color: 'var(--arvo-fg)' }}>{s.cancel ?? 'Cancelar'}</button>
            <button type="submit" disabled={saving || !name.trim()} className="px-4 py-2 rounded-lg text-xs" style={{ background: color, color: 'white', opacity: saving ? 0.6 : 1 }}>
              {saving ? '...' : (s.save ?? 'Salvar')}
            </button>
          </div>
        </div>
      </form>
    </ModalOverlay>
  )
}

function ModalOverlay({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center" style={{ background: 'rgba(0,0,0,0.45)' }} onClick={onClose}>
      <div
        className="w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl p-6 max-h-[90vh] overflow-y-auto"
        style={{ background: 'white', boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}
        onClick={e => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  )
}
