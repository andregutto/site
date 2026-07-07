import { useState, useEffect, useCallback } from 'react'
import { apiFetch } from '../../lib/api'
import { useAuth } from '../../contexts/AuthContext'
import { useI18n } from '../../contexts/I18nContext'
import { useCurrency } from '../../contexts/CurrencyContext'
import Avatar from '../voyage/_shared/Avatar'
import type { MomentMember } from './FinancesMomentsPage'

const CURRENCIES = ['BRL', 'EUR', 'USD'] as const
const CURRENCY_SYMBOLS: Record<string, string> = { BRL: 'R$', EUR: '€', USD: '$' }

interface ExpenseShare {
  user_id: string
  share_amount: number
  display?: { name?: string; email?: string; avatar_url?: string }
}

interface ExpenseCategory { id: number; name: string; icon: string; color: string; keyword_rules?: string[] }

const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')

// Mesma heurística usada no import bancário (matchCategory em shared-api/finances.ts):
// nome da categoria como substring, senão as keyword_rules configuradas — só que rodando
// local, sem chamada de rede, pra sugerir enquanto o usuário ainda digita a descrição.
function suggestCategory(description: string, categories: ExpenseCategory[]): ExpenseCategory | null {
  const d = norm(description)
  if (!d) return null
  for (const cat of categories) {
    const catName = norm(cat.name)
    if (catName.length >= 4 && d.includes(catName)) return cat
  }
  for (const cat of categories) {
    const rules = cat.keyword_rules ?? []
    if (rules.some(kw => d.includes(norm(kw)))) return cat
  }
  return null
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
  is_settlement?: boolean
  paid_by_display?: { name?: string; email?: string; avatar_url?: string }
  shares: ExpenseShare[]
  category?: ExpenseCategory | null
}

interface Participant {
  user_id: string
  display?: { name?: string; email?: string; avatar_url?: string }
}

// Converte um valor de uma moeda pra outra usando as mesmas taxas BRL-base do resto do
// site (fxRates.USD/EUR = BRL por 1 unidade), em vez de inventar uma conversão paralela.
function convertBetween(value: number, from: string, to: string, fxRates: { USD: number; EUR: number }): number {
  if (from === to) return value
  const rateOf = (c: string) => (c === 'BRL' ? 1 : c === 'USD' ? fxRates.USD : c === 'EUR' ? fxRates.EUR : 1)
  return (value * rateOf(from)) / rateOf(to)
}

export default function ExpensesPanel({ momentId, currency, fmt }: { momentId: number; currency: string; fmt: (n: number, c: string) => string }) {
  const { t } = useI18n()
  const { user } = useAuth()
  const { currency: displayCurrency, fxRates } = useCurrency()
  const [expenses, setExpenses] = useState<MomentExpense[]>([])
  const [participants, setParticipants] = useState<Participant[]>([])
  const [myCategories, setMyCategories] = useState<ExpenseCategory[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  // Recolhe saldos + lista de despesas assim que o form de nova despesa abre —
  // no mobile, os dois juntos empurravam o form (e o botão Salvar) pra fora da
  // tela, exigindo scroll só pra ver os campos. Usuário pode reabrir a
  // qualquer momento com o resumo de uma linha que aparece no lugar.
  const [historyOpen, setHistoryOpen] = useState(true)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [settlingWith, setSettlingWith] = useState<string | null>(null)

  const [description, setDescription] = useState('')
  const [amount, setAmount] = useState('')
  const [expCurrency, setExpCurrency] = useState(currency)
  const [paidBy, setPaidBy] = useState('')
  const [splitType, setSplitType] = useState<'equal' | 'custom'>('equal')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [customValues, setCustomValues] = useState<Record<string, string>>({})
  const [customPercents, setCustomPercents] = useState<Record<string, string>>({})
  const [categoryId, setCategoryId] = useState<number | ''>('')
  const [categoryTouched, setCategoryTouched] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [expensesRes, membersRes] = await Promise.all([
        apiFetch<{ expenses: MomentExpense[] }>(`/finances/moments/${momentId}/expenses`),
        apiFetch<{ members: MomentMember[] }>(`/finances/moments/${momentId}/members`),
        apiFetch<ExpenseCategory[]>('/finances/categories').then(setMyCategories).catch(() => {}),
      ])
      setExpenses(expensesRes.expenses)
      const active = membersRes.members.filter(m => m.status === 'active' && m.user_id)
      const parts = active.map(m => ({ user_id: m.user_id as string, display: m.display }))
      setParticipants(parts)
      setPaidBy(prev => {
        if (prev) return prev
        const me = parts.find(p => p.user_id === user?.id)
        return me?.user_id ?? parts[0]?.user_id ?? ''
      })
      setSelected(prev => (prev.size > 0 ? prev : new Set(parts.map(p => p.user_id))))
    } finally {
      setLoading(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [momentId])

  useEffect(() => { load() }, [load])

  // Recolhe saldos + histórico assim que o form abre (nova despesa ou edição);
  // volta a mostrar tudo quando fecha.
  useEffect(() => { setHistoryOpen(!showForm) }, [showForm])

  // Sugere categoria com base na descrição enquanto o usuário digita, mas só
  // enquanto ele não tiver escolhido uma manualmente — não queremos sobrescrever
  // uma escolha explícita a cada tecla.
  useEffect(() => {
    if (categoryTouched || paidBy !== user?.id) return
    const match = suggestCategory(description, myCategories)
    setCategoryId(match ? match.id : '')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [description, myCategories, paidBy])

  function toggleParticipant(uid: string) {
    setSelected(prev => {
      const next = new Set(prev)
      next.has(uid) ? next.delete(uid) : next.add(uid)
      return next
    })
  }

  function resetForm() {
    setDescription(''); setAmount(''); setExpCurrency(currency); setSplitType('equal'); setError('')
    setSelected(new Set(participants.map(p => p.user_id)))
    setCustomValues({}); setCustomPercents({})
    setCategoryId('')
    setCategoryTouched(false)
    setEditingId(null)
    const me = participants.find(p => p.user_id === user?.id)
    setPaidBy(me?.user_id ?? participants[0]?.user_id ?? '')
  }

  // Campos de valor e percentual da divisão personalizada ficam interligados: editar um
  // recalcula o outro a partir do valor total, em vez de deixar ambíguo qual dos dois vale.
  function setCustomValue(uid: string, raw: string) {
    setCustomValues(prev => ({ ...prev, [uid]: raw }))
    const total = parseFloat(amount.replace(',', '.'))
    const v = parseFloat(raw.replace(',', '.'))
    if (total > 0 && !isNaN(v)) {
      setCustomPercents(prev => ({ ...prev, [uid]: (Math.round((v / total) * 10000) / 100).toString() }))
    }
  }

  function setCustomPercent(uid: string, raw: string) {
    setCustomPercents(prev => ({ ...prev, [uid]: raw }))
    const total = parseFloat(amount.replace(',', '.'))
    const p = parseFloat(raw.replace(',', '.'))
    if (total > 0 && !isNaN(p)) {
      setCustomValues(prev => ({ ...prev, [uid]: (Math.round(total * (p / 100) * 100) / 100).toString() }))
    }
  }

  function startEdit(e: MomentExpense) {
    setEditingId(e.id)
    setDescription(e.description)
    setAmount(String(e.amount))
    setExpCurrency(e.currency)
    setPaidBy(e.paid_by_user_id)
    setSplitType(e.split_type)
    setSelected(new Set(e.shares.map(s => s.user_id)))
    const values: Record<string, string> = {}
    const percents: Record<string, string> = {}
    for (const s of e.shares) {
      values[s.user_id] = String(s.share_amount)
      percents[s.user_id] = e.amount > 0 ? (Math.round((s.share_amount / e.amount) * 10000) / 100).toString() : '0'
    }
    setCustomValues(values)
    setCustomPercents(percents)
    setCategoryId(e.category?.id ?? '')
    setCategoryTouched(true)
    setError('')
    setShowForm(true)
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
      currency: expCurrency,
      paid_by_user_id: paidBy,
      split_type: splitType,
      participant_ids: participantIds,
    }
    if (splitType === 'custom') {
      body.custom_shares = Object.fromEntries(participantIds.map(uid => [uid, parseFloat((customValues[uid] ?? '0').replace(',', '.')) || 0]))
    }
    // Categoria só pode vir da lista do próprio pagador — se ele não é quem está preenchendo
    // o formulário, o seletor fica oculto (ver JSX) e nunca chega aqui.
    if (paidBy === user?.id) {
      body.category_id = categoryId === '' ? null : categoryId
    }

    setSaving(true)
    try {
      if (editingId) {
        await apiFetch(`/finances/moments/${momentId}/expenses/${editingId}`, { method: 'PATCH', body: JSON.stringify(body) })
      } else {
        await apiFetch(`/finances/moments/${momentId}/expenses`, { method: 'POST', body: JSON.stringify(body) })
      }
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

  // Saldo líquido comigo (moeda original de cada despesa) por participante, incluindo
  // acertos já feitos (is_settlement) — é o que zera o saldo depois de "Acertar contas".
  const balances: { user_id: string; display?: Participant['display']; perCurrency: Record<string, number> }[] = (() => {
    if (!user) return []
    const byUser = new Map<string, Record<string, number>>()
    for (const e of expenses) {
      const mine = e.shares.find(s => s.user_id === user.id)
      if (e.paid_by_user_id === user.id) {
        for (const s of e.shares) {
          if (s.user_id === user.id) continue
          const rec = byUser.get(s.user_id) ?? {}
          rec[e.currency] = (rec[e.currency] ?? 0) + s.share_amount
          byUser.set(s.user_id, rec)
        }
      } else if (mine) {
        const rec = byUser.get(e.paid_by_user_id) ?? {}
        rec[e.currency] = (rec[e.currency] ?? 0) - mine.share_amount
        byUser.set(e.paid_by_user_id, rec)
      }
    }
    return [...byUser.entries()]
      .map(([uid, perCurrency]) => ({
        user_id: uid,
        display: participants.find(p => p.user_id === uid)?.display ?? expenses.find(e => e.paid_by_user_id === uid)?.paid_by_display,
        perCurrency: Object.fromEntries(Object.entries(perCurrency).filter(([, v]) => Math.abs(v) >= 0.01)),
      }))
      .filter(b => Object.keys(b.perCurrency).length > 0)
  })()

  async function settleWith(otherUserId: string, name: string) {
    if (!confirm(t.finances.expenseSettleConfirm.replace('{name}', name))) return
    setSettlingWith(otherUserId)
    try {
      await apiFetch('/people/settle', { method: 'POST', body: JSON.stringify({ friend_user_id: otherUserId, moment_id: momentId }) })
      await load()
    } finally {
      setSettlingWith(null)
    }
  }

  if (loading) return <p className="text-xs text-[var(--arvo-fg-soft)] text-center py-4">…</p>

  const fieldCls = 'text-sm px-3 py-2 rounded-lg bg-[var(--arvo-surface-2)] border border-[var(--arvo-border)] text-[var(--arvo-fg)]'

  return (
    <div className="space-y-3">
      {historyOpen ? (
        <>
          <p className="text-[11px] italic text-[var(--arvo-fg-soft)]">{t.finances.expenseSectionHint}</p>

          {/* Saldos vivos deste Momento — inclui quem deve o quê pra mim, com acerto direto,
              sem precisar sair pra página Pessoas (que só mostra o agregado entre TODOS os Momentos). */}
          <div className="p-3 rounded-xl border border-[var(--arvo-border)] bg-[var(--arvo-surface-2)] space-y-1.5">
            <p className="text-[10px] uppercase tracking-wide text-[var(--arvo-fg-soft)]">{t.finances.expenseBalances}</p>
            {balances.length === 0 ? (
              <p className="text-xs text-[var(--arvo-fg-soft)]">{t.finances.expenseBalancesSettled}</p>
            ) : balances.map(b => {
              const name = b.display?.name ?? b.display?.email ?? b.user_id
              return (
                <div key={b.user_id} className="flex items-center gap-2">
                  <Avatar name={b.display?.name} email={b.display?.email} avatarUrl={b.display?.avatar_url} size={18} />
                  <span className="text-xs text-[var(--arvo-fg)] flex-1 truncate">{name}</span>
                  {Object.entries(b.perCurrency).map(([cur, amt]) => (
                    <span key={cur} className="text-xs font-semibold" style={{ color: amt > 0 ? '#1F8A5B' : '#D63B2F' }}>
                      {amt > 0 ? '+' : '−'}{fmt(Math.abs(amt), cur)}
                    </span>
                  ))}
                  <button
                    onClick={() => settleWith(b.user_id, name)}
                    disabled={settlingWith === b.user_id}
                    className="arvo-btn arvo-btn--ghost arvo-btn--sm"
                  >
                    {settlingWith === b.user_id ? '…' : t.people.settleUp}
                  </button>
                </div>
              )
            })}
          </div>

          {expenses.length > 0 ? (
            <div className="space-y-0 border border-[var(--arvo-border)] rounded-xl overflow-hidden">
              {expenses.map((e, i) => {
                const converted = e.currency !== displayCurrency
                  ? convertBetween(e.amount, e.currency, displayCurrency, fxRates)
                  : null
                return (
                  <div key={e.id} className={`flex items-center gap-2.5 px-4 py-2.5 text-sm ${i > 0 ? 'border-t border-[var(--arvo-border-soft)]' : ''}`}>
                    <Avatar name={e.paid_by_display?.name} email={e.paid_by_display?.email} avatarUrl={e.paid_by_display?.avatar_url} size={22} />
                    <div className="flex-1 min-w-0">
                      <span className="text-[var(--arvo-fg)] truncate text-xs flex items-center gap-1.5">
                        {e.description}
                        {e.category && (
                          <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full font-medium shrink-0" style={{ background: e.category.color + '22', color: e.category.color }}>
                            {e.category.icon} {e.category.name}
                          </span>
                        )}
                      </span>
                      <span className="text-[10px] text-[var(--arvo-fg-soft)] block truncate">
                        {t.finances.expensePaidBy}: {e.paid_by_display?.name} · {e.shares.length} {t.finances.expenseParticipants.toLowerCase()}
                      </span>
                    </div>
                    <div className="text-right shrink-0">
                      <span className="text-xs font-semibold block text-[var(--arvo-fg)]">{fmt(e.amount, e.currency)}</span>
                      {converted != null && (
                        <span className="text-[10px] block text-[var(--arvo-fg-soft)]">≈ {fmt(converted, displayCurrency)}</span>
                      )}
                    </div>
                    {!e.is_settlement && (
                      <button onClick={() => startEdit(e)} className="ml-1 p-1 text-[var(--arvo-fg-faint)] hover:text-[var(--arvo-fg)] transition-colors" title={t.finances.expenseEdit}>
                        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" />
                        </svg>
                      </button>
                    )}
                    <button onClick={() => remove(e.id)} className="p-1 text-[var(--arvo-fg-faint)] hover:text-[var(--arvo-red)] transition-colors" title={t.finances.expenseDelete}>
                      <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                )
              })}
            </div>
          ) : (
            <p className="text-xs text-[var(--arvo-fg-soft)] text-center py-4">{t.finances.expenseNoEntries}</p>
          )}
        </>
      ) : (
        <button
          type="button"
          onClick={() => setHistoryOpen(true)}
          className="w-full flex items-center justify-between px-3 py-2 rounded-lg border border-[var(--arvo-border)] text-xs text-[var(--arvo-fg-soft)] hover:text-[var(--arvo-fg)] transition-colors"
        >
          <span>{(t.finances.expenseHistorySummary ?? '{count} despesas · ver saldos').replace('{count}', String(expenses.length))}</span>
          <svg className="w-3 h-3 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 9l6 6 6-6" />
          </svg>
        </button>
      )}

      {!showForm ? (
        <button
          onClick={() => setShowForm(true)}
          className="w-full text-center text-sm py-3 rounded-lg border border-dashed border-[var(--arvo-border)] text-[var(--arvo-fg-soft)] hover:text-[var(--arvo-fg)] hover:border-[var(--arvo-border-strong,var(--arvo-border))] transition-colors"
        >
          + {t.finances.expenseAdd}
        </button>
      ) : (
        <div className="p-4 rounded-xl border border-[var(--arvo-border)] space-y-3">
          <input
            value={description} onChange={e => setDescription(e.target.value)}
            placeholder={t.finances.expenseDescription}
            className={`w-full ${fieldCls}`}
          />
          <div className="flex gap-2">
            <input
              value={amount} onChange={e => setAmount(e.target.value)}
              placeholder={t.finances.expenseAmount}
              inputMode="decimal"
              className={`flex-1 min-w-0 ${fieldCls}`}
            />
            <select value={expCurrency} onChange={e => setExpCurrency(e.target.value)} className={`shrink-0 ${fieldCls}`}>
              {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[10px] uppercase tracking-wide text-[var(--arvo-fg-soft)] shrink-0">{t.finances.expensePaidBy}</span>
            <select
              value={paidBy} onChange={e => setPaidBy(e.target.value)}
              className={`flex-1 min-w-0 ${fieldCls}`}
            >
              {participants.map(p => (
                <option key={p.user_id} value={p.user_id}>{p.display?.name ?? p.user_id}</option>
              ))}
            </select>
          </div>

          {/* Categoria só existe pro próprio pagador (categorias são por usuário) — se quem
              está editando não é quem pagou, não dá pra saber/mexer na categoria dele. */}
          {paidBy === user?.id && myCategories.length > 0 ? (
            <select
              value={categoryId}
              onChange={e => { setCategoryTouched(true); setCategoryId(e.target.value === '' ? '' : Number(e.target.value)) }}
              className={`w-full ${fieldCls}`}
            >
              <option value="">{t.finances.noCategory}</option>
              {myCategories.map(c => <option key={c.id} value={c.id}>{c.icon} {c.name}</option>)}
            </select>
          ) : paidBy && paidBy !== user?.id ? (
            <p className="text-[11px] text-[var(--arvo-fg-soft)]">{t.finances.expenseCategorizeLaterHint}</p>
          ) : null}

          <div className="flex gap-2 text-sm">
            <button
              onClick={() => setSplitType('equal')}
              className={`flex-1 py-2.5 rounded-lg border transition-colors ${splitType === 'equal' ? 'bg-[var(--arvo-fg)]/10 border-[var(--arvo-fg)]/30 text-[var(--arvo-fg)]' : 'border-[var(--arvo-border)] text-[var(--arvo-fg-soft)]'}`}
            >
              {t.finances.expenseSplitEqual}
            </button>
            <button
              onClick={() => setSplitType('custom')}
              className={`flex-1 py-2.5 rounded-lg border transition-colors ${splitType === 'custom' ? 'bg-[var(--arvo-fg)]/10 border-[var(--arvo-fg)]/30 text-[var(--arvo-fg)]' : 'border-[var(--arvo-border)] text-[var(--arvo-fg-soft)]'}`}
            >
              {t.finances.expenseSplitCustom}
            </button>
          </div>

          <div className="space-y-1">
            <p className="text-[10px] uppercase tracking-wide text-[var(--arvo-fg-soft)]">{t.finances.expenseParticipants}</p>
            {participants.map(p => (
              <div key={p.user_id} className="flex items-center gap-2">
                {/* <label> em volta do checkbox+avatar+nome — clicar em qualquer
                    ponto dessa área (não só na caixinha de 13px) já marca/desmarca,
                    sem precisar acertar o checkbox pelo dedo no mobile. */}
                <label className="flex items-center gap-2.5 flex-1 min-w-0 py-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={selected.has(p.user_id)}
                    onChange={() => toggleParticipant(p.user_id)}
                    className="shrink-0 w-[18px] h-[18px] accent-[var(--arvo-fg)]"
                  />
                  <Avatar name={p.display?.name} email={p.display?.email} avatarUrl={p.display?.avatar_url} size={24} />
                  <span className="text-sm text-[var(--arvo-fg)] flex-1 min-w-0 truncate">{p.display?.name ?? p.user_id}</span>
                </label>
                {splitType === 'custom' && selected.has(p.user_id) && (
                  <>
                    <div className="w-16 flex items-center rounded-md bg-[var(--arvo-surface-2)] border border-[var(--arvo-border)] overflow-hidden shrink-0">
                      <span className="text-xs text-[var(--arvo-fg-soft)] pl-1.5 shrink-0">{CURRENCY_SYMBOLS[expCurrency] ?? expCurrency}</span>
                      <input
                        value={customValues[p.user_id] ?? ''}
                        onChange={e => setCustomValue(p.user_id, e.target.value)}
                        inputMode="decimal"
                        className="w-full min-w-0 text-sm pl-1 pr-1.5 py-1.5 bg-transparent text-[var(--arvo-fg)] text-right"
                      />
                    </div>
                    <div className="w-14 flex items-center rounded-md bg-[var(--arvo-surface-2)] border border-[var(--arvo-border)] overflow-hidden shrink-0">
                      <input
                        value={customPercents[p.user_id] ?? ''}
                        onChange={e => setCustomPercent(p.user_id, e.target.value)}
                        inputMode="decimal"
                        className="w-full min-w-0 text-sm pl-1.5 py-1.5 bg-transparent text-[var(--arvo-fg)] text-right"
                      />
                      <span className="text-xs text-[var(--arvo-fg-soft)] pr-1.5 shrink-0">%</span>
                    </div>
                  </>
                )}
              </div>
            ))}
          </div>

          {error && <p className="text-xs text-[var(--arvo-red)]">{error}</p>}

          <div className="flex gap-2">
            <button
              onClick={() => { setShowForm(false); resetForm() }}
              className="flex-1 text-sm py-3 rounded-lg border border-[var(--arvo-border)] text-[var(--arvo-fg-soft)]"
            >
              {t.common.cancel}
            </button>
            <button
              onClick={submit} disabled={saving}
              className="flex-1 text-sm py-3 rounded-lg bg-[var(--arvo-fg)] text-[var(--arvo-bg)] disabled:opacity-60"
            >
              {t.common.save}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// Modal pra "dividir" uma transação JÁ existente (ex: veio do banco) — reaproveita o
// valor/descrição dela em vez de criar uma nova, só pede participantes + tipo de divisão
// (quem pagou já é fixo: o dono da transação).
export function SplitTransactionModal({ momentId, transaction, onDone, onClose }: {
  momentId: number
  transaction: { id: number; description: string; amount: number; currency: string; user_id: string }
  onDone: () => void
  onClose: () => void
}) {
  const { t } = useI18n()
  const [participants, setParticipants] = useState<Participant[]>([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [splitType, setSplitType] = useState<'equal' | 'custom'>('equal')
  const [customValues, setCustomValues] = useState<Record<string, string>>({})
  const [customPercents, setCustomPercents] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    apiFetch<{ members: MomentMember[] }>(`/finances/moments/${momentId}/members`).then(res => {
      const active = res.members.filter(m => m.status === 'active' && m.user_id)
      const parts = active.map(m => ({ user_id: m.user_id as string, display: m.display }))
      setParticipants(parts)
      setSelected(new Set(parts.map(p => p.user_id)))
      setLoading(false)
    })
  }, [momentId])

  function toggleParticipant(uid: string) {
    setSelected(prev => {
      const next = new Set(prev)
      next.has(uid) ? next.delete(uid) : next.add(uid)
      return next
    })
  }

  function setCustomValue(uid: string, raw: string) {
    setCustomValues(prev => ({ ...prev, [uid]: raw }))
    const v = parseFloat(raw.replace(',', '.'))
    if (transaction.amount > 0 && !isNaN(v)) {
      setCustomPercents(prev => ({ ...prev, [uid]: (Math.round((v / Math.abs(transaction.amount)) * 10000) / 100).toString() }))
    }
  }

  function setCustomPercent(uid: string, raw: string) {
    setCustomPercents(prev => ({ ...prev, [uid]: raw }))
    const p = parseFloat(raw.replace(',', '.'))
    if (!isNaN(p)) {
      setCustomValues(prev => ({ ...prev, [uid]: (Math.round(Math.abs(transaction.amount) * (p / 100) * 100) / 100).toString() }))
    }
  }

  async function submit() {
    setError('')
    const participantIds = [...selected]
    if (participantIds.length === 0) { setError(t.finances.expenseFormIncomplete); return }
    const body: Record<string, unknown> = {
      from_transaction_id: transaction.id, split_type: splitType, participant_ids: participantIds,
    }
    if (splitType === 'custom') {
      body.custom_shares = Object.fromEntries(participantIds.map(uid => [uid, parseFloat((customValues[uid] ?? '0').replace(',', '.')) || 0]))
    }
    setSaving(true)
    try {
      await apiFetch(`/finances/moments/${momentId}/expenses`, { method: 'POST', body: JSON.stringify(body) })
      onDone()
    } catch (e) {
      setError(e instanceof Error ? e.message : t.finances.expenseFormIncomplete)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center" style={{ background: 'rgba(0,0,0,0.45)' }} onClick={onClose}>
      <div
        className="w-full sm:max-w-xs rounded-t-2xl sm:rounded-2xl max-h-[92vh] sm:max-h-[85vh] overflow-y-auto p-5 space-y-3"
        style={{ background: 'var(--arvo-surface)', boxShadow: 'var(--arvo-shadow-lg)', paddingBottom: 'calc(20px + env(safe-area-inset-bottom, 0px))' }}
        onClick={e => e.stopPropagation()}
      >
        <div>
          <h3 className="font-semibold text-[var(--arvo-fg)] text-sm">{t.finances.expenseSplitTransactionTitle}</h3>
          <p className="text-xs text-[var(--arvo-fg-soft)] truncate">{transaction.description} · {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: transaction.currency }).format(Math.abs(transaction.amount))}</p>
        </div>

        {loading ? <p className="text-xs text-[var(--arvo-fg-soft)]">…</p> : (<>
          <div className="flex gap-2 text-sm">
            <button
              onClick={() => setSplitType('equal')}
              className={`flex-1 py-2.5 rounded-lg border transition-colors ${splitType === 'equal' ? 'bg-[var(--arvo-fg)]/10 border-[var(--arvo-fg)]/30 text-[var(--arvo-fg)]' : 'border-[var(--arvo-border)] text-[var(--arvo-fg-soft)]'}`}
            >
              {t.finances.expenseSplitEqual}
            </button>
            <button
              onClick={() => setSplitType('custom')}
              className={`flex-1 py-2.5 rounded-lg border transition-colors ${splitType === 'custom' ? 'bg-[var(--arvo-fg)]/10 border-[var(--arvo-fg)]/30 text-[var(--arvo-fg)]' : 'border-[var(--arvo-border)] text-[var(--arvo-fg-soft)]'}`}
            >
              {t.finances.expenseSplitCustom}
            </button>
          </div>

          <div className="space-y-1">
            {participants.map(p => (
              <div key={p.user_id} className="flex items-center gap-2">
                <label className="flex items-center gap-2.5 flex-1 min-w-0 py-2 cursor-pointer">
                  <input type="checkbox" checked={selected.has(p.user_id)} onChange={() => toggleParticipant(p.user_id)} className="shrink-0 w-[18px] h-[18px] accent-[var(--arvo-fg)]" />
                  <Avatar name={p.display?.name} email={p.display?.email} avatarUrl={p.display?.avatar_url} size={24} />
                  <span className="text-sm text-[var(--arvo-fg)] flex-1 min-w-0 truncate">{p.display?.name ?? p.user_id}</span>
                </label>
                {splitType === 'custom' && selected.has(p.user_id) && (
                  <>
                    <input
                      value={customValues[p.user_id] ?? ''}
                      onChange={e => setCustomValue(p.user_id, e.target.value)}
                      placeholder={t.finances.expenseSplitCustomValue} inputMode="decimal"
                      className="w-16 shrink-0 text-sm px-2 py-1.5 rounded-md bg-[var(--arvo-surface-2)] border border-[var(--arvo-border)] text-[var(--arvo-fg)] text-right"
                    />
                    <input
                      value={customPercents[p.user_id] ?? ''}
                      onChange={e => setCustomPercent(p.user_id, e.target.value)}
                      placeholder={t.finances.expenseSplitCustomPercent} inputMode="decimal"
                      className="w-14 shrink-0 text-sm px-2 py-1.5 rounded-md bg-[var(--arvo-surface-2)] border border-[var(--arvo-border)] text-[var(--arvo-fg)] text-right"
                    />
                  </>
                )}
              </div>
            ))}
          </div>

          {error && <p className="text-xs text-[var(--arvo-red)]">{error}</p>}

          <div className="flex gap-2">
            <button onClick={onClose} className="flex-1 text-sm py-3 rounded-lg border border-[var(--arvo-border)] text-[var(--arvo-fg-soft)]">
              {t.common.cancel}
            </button>
            <button onClick={submit} disabled={saving} className="flex-1 text-sm py-3 rounded-lg bg-[var(--arvo-fg)] text-[var(--arvo-bg)] disabled:opacity-60">
              {t.common.save}
            </button>
          </div>
        </>)}
      </div>
    </div>
  )
}
