import { useState, useEffect, useCallback } from 'react'
import { apiFetch } from '../../lib/api'
import { useAuth } from '../../contexts/AuthContext'
import { useI18n } from '../../contexts/I18nContext'
import Avatar from '../voyage/_shared/Avatar'
import type { MomentMember } from './FinancesMomentsPage'

interface ExpenseShare {
  user_id: string
  share_amount: number
  display?: { name?: string; email?: string; avatar_url?: string }
}

interface MomentExpense {
  id: number
  description: string
  amount: number
  currency: string
  paid_by_user_id: string
  split_type: 'equal' | 'custom'
  expense_date: string
  created_by: string
  paid_by_display?: { name?: string; email?: string; avatar_url?: string }
  shares: ExpenseShare[]
}

interface Participant {
  user_id: string
  display?: { name?: string; email?: string; avatar_url?: string }
}

export default function ExpensesPanel({ momentId, currency, fmt }: { momentId: number; currency: string; fmt: (n: number, c: string) => string }) {
  const { t } = useI18n()
  const { user } = useAuth()
  const [expenses, setExpenses] = useState<MomentExpense[]>([])
  const [participants, setParticipants] = useState<Participant[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const [description, setDescription] = useState('')
  const [amount, setAmount] = useState('')
  const [paidBy, setPaidBy] = useState('')
  const [splitType, setSplitType] = useState<'equal' | 'custom'>('equal')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [customShares, setCustomShares] = useState<Record<string, string>>({})

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [expensesRes, membersRes] = await Promise.all([
        apiFetch<{ expenses: MomentExpense[] }>(`/finances/moments/${momentId}/expenses`),
        apiFetch<{ members: MomentMember[] }>(`/finances/moments/${momentId}/members`),
      ])
      setExpenses(expensesRes.expenses)
      const active = membersRes.members.filter(m => m.status === 'active' && m.user_id)
      const parts = active.map(m => ({ user_id: m.user_id as string, display: m.display }))
      setParticipants(parts)
      if (!paidBy && parts.length > 0) {
        const me = parts.find(p => p.user_id === user?.id)
        setPaidBy(me?.user_id ?? parts[0].user_id)
      }
      setSelected(new Set(parts.map(p => p.user_id)))
    } finally {
      setLoading(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [momentId])

  useEffect(() => { load() }, [load])

  function toggleParticipant(uid: string) {
    setSelected(prev => {
      const next = new Set(prev)
      next.has(uid) ? next.delete(uid) : next.add(uid)
      return next
    })
  }

  function resetForm() {
    setDescription(''); setAmount(''); setSplitType('equal'); setError('')
    setSelected(new Set(participants.map(p => p.user_id)))
    setCustomShares({})
  }

  async function submit() {
    setError('')
    const value = parseFloat(amount.replace(',', '.'))
    if (!description.trim() || !value || value <= 0 || !paidBy) {
      setError(t.finances.expenseFormIncomplete); return
    }
    const participantIds = [...selected]
    if (participantIds.length === 0) { setError(t.finances.expenseFormIncomplete); return }

    const body: Record<string, unknown> = {
      description: description.trim(),
      amount: value,
      currency,
      paid_by_user_id: paidBy,
      split_type: splitType,
      participant_ids: participantIds,
    }
    if (splitType === 'custom') {
      body.custom_shares = Object.fromEntries(participantIds.map(uid => [uid, parseFloat((customShares[uid] ?? '0').replace(',', '.')) || 0]))
    }

    setSaving(true)
    try {
      await apiFetch(`/finances/moments/${momentId}/expenses`, { method: 'POST', body: JSON.stringify(body) })
      setShowForm(false)
      resetForm()
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : t.finances.expenseFormIncomplete)
    } finally {
      setSaving(false)
    }
  }

  async function remove(expenseId: number) {
    if (!confirm(t.finances.expenseConfirmDelete)) return
    await apiFetch(`/finances/moments/${momentId}/expenses/${expenseId}`, { method: 'DELETE' })
    await load()
  }

  if (loading) return <p className="text-xs text-[var(--arvo-fg-soft)] text-center py-4">…</p>

  return (
    <div className="space-y-3">
      {expenses.length > 0 ? (
        <div className="space-y-0 border border-[var(--arvo-border)] rounded-xl overflow-hidden">
          {expenses.map((e, i) => (
            <div key={e.id} className={`flex items-center gap-2.5 px-4 py-2.5 text-sm ${i > 0 ? 'border-t border-[var(--arvo-border-soft)]' : ''}`}>
              <Avatar name={e.paid_by_display?.name} email={e.paid_by_display?.email} avatarUrl={e.paid_by_display?.avatar_url} size={22} />
              <div className="flex-1 min-w-0">
                <span className="text-[var(--arvo-fg)] truncate text-xs block">{e.description}</span>
                <span className="text-[10px] text-[var(--arvo-fg-soft)] block truncate">
                  {t.finances.expensePaidBy}: {e.paid_by_display?.name} · {e.shares.length} {t.finances.expenseParticipants.toLowerCase()}
                </span>
              </div>
              <span className="text-xs font-semibold shrink-0 text-[var(--arvo-fg)]">{fmt(e.amount, e.currency)}</span>
              {(e.created_by === user?.id) && (
                <button onClick={() => remove(e.id)} className="ml-1 p-1 text-[var(--arvo-fg-faint)] hover:text-[var(--arvo-red)] transition-colors" title={t.finances.expenseDelete}>
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              )}
            </div>
          ))}
        </div>
      ) : (
        <p className="text-xs text-[var(--arvo-fg-soft)] text-center py-4">{t.finances.expenseNoEntries}</p>
      )}

      {!showForm ? (
        <button
          onClick={() => setShowForm(true)}
          className="w-full text-center text-xs py-2 rounded-lg border border-dashed border-[var(--arvo-border)] text-[var(--arvo-fg-soft)] hover:text-[var(--arvo-fg)] hover:border-[var(--arvo-border-strong,var(--arvo-border))] transition-colors"
        >
          + {t.finances.expenseAdd}
        </button>
      ) : (
        <div className="p-4 rounded-xl border border-[var(--arvo-border)] space-y-3">
          <input
            value={description} onChange={e => setDescription(e.target.value)}
            placeholder={t.finances.expenseDescription}
            className="w-full text-sm px-3 py-2 rounded-lg bg-[var(--arvo-surface-2)] border border-[var(--arvo-border)] text-[var(--arvo-fg)]"
          />
          <div className="flex gap-2">
            <input
              value={amount} onChange={e => setAmount(e.target.value)}
              placeholder={t.finances.expenseAmount}
              inputMode="decimal"
              className="flex-1 text-sm px-3 py-2 rounded-lg bg-[var(--arvo-surface-2)] border border-[var(--arvo-border)] text-[var(--arvo-fg)]"
            />
            <select
              value={paidBy} onChange={e => setPaidBy(e.target.value)}
              className="flex-1 text-sm px-3 py-2 rounded-lg bg-[var(--arvo-surface-2)] border border-[var(--arvo-border)] text-[var(--arvo-fg)]"
            >
              {participants.map(p => (
                <option key={p.user_id} value={p.user_id}>{p.display?.name ?? p.user_id}</option>
              ))}
            </select>
          </div>

          <div className="flex gap-2 text-xs">
            <button
              onClick={() => setSplitType('equal')}
              className={`flex-1 py-1.5 rounded-lg border transition-colors ${splitType === 'equal' ? 'bg-[var(--arvo-fg)]/10 border-[var(--arvo-fg)]/30 text-[var(--arvo-fg)]' : 'border-[var(--arvo-border)] text-[var(--arvo-fg-soft)]'}`}
            >
              {t.finances.expenseSplitEqual}
            </button>
            <button
              onClick={() => setSplitType('custom')}
              className={`flex-1 py-1.5 rounded-lg border transition-colors ${splitType === 'custom' ? 'bg-[var(--arvo-fg)]/10 border-[var(--arvo-fg)]/30 text-[var(--arvo-fg)]' : 'border-[var(--arvo-border)] text-[var(--arvo-fg-soft)]'}`}
            >
              {t.finances.expenseSplitCustom}
            </button>
          </div>

          <div className="space-y-1.5">
            <p className="text-[10px] uppercase tracking-wide text-[var(--arvo-fg-soft)]">{t.finances.expenseParticipants}</p>
            {participants.map(p => (
              <div key={p.user_id} className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={selected.has(p.user_id)}
                  onChange={() => toggleParticipant(p.user_id)}
                  className="shrink-0"
                />
                <Avatar name={p.display?.name} email={p.display?.email} avatarUrl={p.display?.avatar_url} size={18} />
                <span className="text-xs text-[var(--arvo-fg)] flex-1 truncate">{p.display?.name ?? p.user_id}</span>
                {splitType === 'custom' && selected.has(p.user_id) && (
                  <input
                    value={customShares[p.user_id] ?? ''}
                    onChange={e => setCustomShares(prev => ({ ...prev, [p.user_id]: e.target.value }))}
                    placeholder="0"
                    inputMode="decimal"
                    className="w-20 text-xs px-2 py-1 rounded-md bg-[var(--arvo-surface-2)] border border-[var(--arvo-border)] text-[var(--arvo-fg)] text-right"
                  />
                )}
              </div>
            ))}
          </div>

          {error && <p className="text-xs text-[var(--arvo-red)]">{error}</p>}

          <div className="flex gap-2">
            <button
              onClick={() => { setShowForm(false); resetForm() }}
              className="flex-1 text-xs py-2 rounded-lg border border-[var(--arvo-border)] text-[var(--arvo-fg-soft)]"
            >
              {t.common.cancel}
            </button>
            <button
              onClick={submit} disabled={saving}
              className="flex-1 text-xs py-2 rounded-lg bg-[var(--arvo-fg)] text-[var(--arvo-bg)] disabled:opacity-60"
            >
              {t.common.save}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
