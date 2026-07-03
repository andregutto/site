import { useState } from 'react'
import { useI18n } from '../contexts/I18nContext'
import { apiFetch } from '../lib/api'
import Avatar from '../pages/voyage/_shared/Avatar'

const RED = '#D63B2F'

export interface SplitMember {
  id: number
  user_id: string | null
  status: string
  share_pct: number
  share_mode: 'salary_based' | 'manual'
  salary_authorized: boolean
  display: { name: string; email: string; avatar_url?: string }
}

// Divisão de despesas de um shared_groups — vale pro grupo inteiro (todas as
// categorias compartilhadas com ele), não só uma categoria específica. Extraído
// como componente único porque tanto o Planejamento ("Editar divisão" numa
// categoria) quanto Amigos ("Gerenciar grupo") precisavam da mesma UI — manter
// duas cópias já tinha causado o bug de %/salário dessincronizados uma vez.
export default function GroupSplitSection({ groupId, members, userId, onSaved, showScopeWarning }: {
  groupId: number
  members: SplitMember[]
  userId: string
  onSaved: () => void
  showScopeWarning?: boolean
}) {
  const { t } = useI18n()
  const activeMembers = members.filter(m => m.status === 'active')
  const [editingId, setEditingId] = useState<number | null>(null)
  const [pctInput, setPctInput] = useState('')
  const [saving, setSaving] = useState(false)
  const [togglingSalary, setTogglingSalary] = useState<number | null>(null)

  async function savePct(memberId: number) {
    const pct = parseFloat(pctInput)
    setEditingId(null)
    if (isNaN(pct) || pct < 0 || pct > 100) return
    setSaving(true)
    try {
      await apiFetch(`/shared/groups/${groupId}/members/${memberId}`, { method: 'PATCH', body: JSON.stringify({ share_pct: pct }) })
      const other = activeMembers.find(m => m.id !== memberId)
      if (activeMembers.length === 2 && other) {
        await apiFetch(`/shared/groups/${groupId}/members/${other.id}`, {
          method: 'PATCH', body: JSON.stringify({ share_pct: Math.round((100 - pct) * 100) / 100 }),
        })
      }
      onSaved()
    } finally {
      setSaving(false)
    }
  }

  async function toggleSalary(memberId: number, current: boolean) {
    setTogglingSalary(memberId)
    try {
      await apiFetch(`/shared/groups/${groupId}/members/${memberId}`, {
        method: 'PATCH', body: JSON.stringify({ salary_authorized: !current, share_mode: !current ? 'salary_based' : 'manual' }),
      })
      onSaved()
    } finally {
      setTogglingSalary(null)
    }
  }

  return (
    <div className="flex flex-col gap-3">
      {showScopeWarning && (
        <p className="text-xs px-2.5 py-2 rounded-lg" style={{ background: 'var(--arvo-hover-bg)', color: 'var(--arvo-fg-soft)' }}>
          {t.finances.editSplitScopeWarning}
        </p>
      )}
      <div className="flex flex-col gap-3">
        {activeMembers.map(m => {
          const isMe = m.user_id === userId
          return (
            <div key={m.id} className="flex items-start gap-3">
              <Avatar name={m.display.name} email={m.display.email} avatarUrl={m.display.avatar_url} size={28} />
              <div className="flex-1 min-w-0">
                <p className="text-sm truncate" style={{ color: 'var(--arvo-fg)' }}>{m.display.name}</p>
                {m.share_mode === 'salary_based' && (
                  <p className="text-xs" style={{ color: 'var(--arvo-fg-soft)' }}>{t.finances.splitSalaryBased}</p>
                )}
                {isMe && (
                  <button
                    onClick={() => toggleSalary(m.id, m.salary_authorized)}
                    disabled={togglingSalary !== null}
                    className="mt-1 flex items-center gap-1.5 text-xs"
                    style={{ color: m.salary_authorized ? 'var(--arvo-green)' : 'var(--arvo-fg-soft)', opacity: togglingSalary !== null ? 0.5 : 1 }}
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-3 h-3"><path d="M8 9.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3Z"/><path d="M1.38 8a6.998 6.998 0 0 1 13.24 0 7 7 0 0 1-13.24 0ZM8 5.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5Z"/></svg>
                    {m.salary_authorized ? t.finances.splitSalaryAuthorized : t.finances.splitAuthorizeSalary}
                  </button>
                )}
              </div>
              {editingId === m.id ? (
                <input
                  autoFocus
                  type="number" min="0" max="100"
                  value={pctInput}
                  onChange={e => setPctInput(e.target.value)}
                  onBlur={() => savePct(m.id)}
                  onKeyDown={e => { if (e.key === 'Enter') savePct(m.id); if (e.key === 'Escape') setEditingId(null) }}
                  className="w-16 text-sm text-right border rounded px-1.5 py-0.5 focus:outline-none focus:ring-1"
                  style={{ borderColor: 'var(--arvo-border)', color: 'var(--arvo-fg)' }}
                />
              ) : (
                <button
                  onClick={() => isMe && (setEditingId(m.id), setPctInput(String(m.share_pct)))}
                  className="text-sm font-medium shrink-0"
                  style={{ color: isMe ? 'var(--arvo-fg)' : 'var(--arvo-fg-soft)', textDecoration: isMe ? 'underline dotted' : 'none' }}
                  disabled={!isMe || saving}
                >
                  {m.share_pct}%
                </button>
              )}
            </div>
          )
        })}
      </div>
      {activeMembers.length < 2 && (
        <p className="text-xs" style={{ color: RED }}>{t.finances.editSplitNeedsTwo}</p>
      )}
    </div>
  )
}
