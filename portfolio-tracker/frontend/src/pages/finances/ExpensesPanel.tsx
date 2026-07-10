import { useState, useEffect, useCallback } from 'react'
import { apiFetch } from '../../lib/api'
import { useAuth } from '../../contexts/AuthContext'
import { useI18n } from '../../contexts/I18nContext'
import { useCurrency } from '../../contexts/CurrencyContext'
import { useUpgrade } from '../../contexts/UpgradeContext'
import Avatar from '../voyage/_shared/Avatar'
import ArvoLoader from '../../components/ArvoLoader'
import { MembersPanel, PersonPicker, type MomentMember, type PickedPerson } from './FinancesMomentsPage'
import { useActiveFriends } from '../../hooks/useActiveFriends'

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

export interface MomentParticipantDisplay { user_id: string; name?: string; email?: string; avatar_url?: string }
export interface MomentMeta {
  owner_id: string
  name: string
  is_pair_default: boolean
  shared_group_id: number | null
  // Participantes ativos (com display) — o modal que embrulha o painel usa pra
  // mostrar os avatares no header (1 avatar no 1:1, pilha nos Momentos com mais gente).
  participants?: MomentParticipantDisplay[]
}

export default function ExpensesPanel({ momentId, currency, fmt, onPromoted, onMetaChange }: { momentId: number; currency: string; fmt: (n: number, c: string) => string; onPromoted?: () => void; onMetaChange?: (meta: MomentMeta) => void }) {
  const { t } = useI18n()
  const { user } = useAuth()
  const { currency: displayCurrency, fxRates } = useCurrency()
  const { handleUpgradeError } = useUpgrade()
  const [expenses, setExpenses] = useState<MomentExpense[]>([])
  const [participants, setParticipants] = useState<Participant[]>([])
  const [myCategories, setMyCategories] = useState<ExpenseCategory[]>([])
  const [meta, setMeta] = useState<MomentMeta | null>(null)
  const [addPerson, setAddPerson] = useState(false)
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
  const [pendingMembers, setPendingMembers] = useState<MomentMember[]>([])
  const [promoNotice, setPromoNotice] = useState<string | null>(null)
  const [categoryTouched, setCategoryTouched] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [expensesRes, membersRes] = await Promise.all([
        apiFetch<{ expenses: MomentExpense[] }>(`/finances/moments/${momentId}/expenses`),
        apiFetch<{ members: MomentMember[]; moment_owner_id: string; moment_name: string; is_pair_default: boolean; shared_group_id: number | null }>(`/finances/moments/${momentId}/members`),
        apiFetch<ExpenseCategory[]>('/finances/categories').then(setMyCategories).catch(() => {}),
      ])
      setExpenses(expensesRes.expenses)
      const activeDisplays = membersRes.members
        .filter(m => m.status === 'active' && m.user_id)
        .map(m => ({ user_id: m.user_id as string, ...m.display }))
      const newMeta = { owner_id: membersRes.moment_owner_id, name: membersRes.moment_name, is_pair_default: membersRes.is_pair_default, shared_group_id: membersRes.shared_group_id, participants: activeDisplays }
      setMeta(newMeta)
      // O modal que embrulha este painel precisa saber quando o par oculto virou
      // Momento nomeado (troca o título "Despesas com X" pelo nome do momento).
      onMetaChange?.(newMeta)
      // Convidados pendentes ficam visíveis (sem isso a 3ª pessoa recém-convidada
      // era invisível e o fluxo parecia não ter feito nada).
      setPendingMembers(membersRes.members.filter(m => m.status === 'pending'))
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
      // Cota diária de despesas de divisão (free = 5/dia) → 403 upgrade_required
      // com used/limit. Abre o modal em vez de mostrar erro genérico.
      if (handleUpgradeError(e)) { setShowForm(false); return }
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

  if (loading) return <div className="flex justify-center py-5"><ArvoLoader size={26} style={{ color: 'var(--arvo-gold)' }} /></div>

  const fieldCls = 'text-sm px-3 py-2 rounded-lg bg-[var(--arvo-surface-2)] border border-[var(--arvo-border)] text-[var(--arvo-fg)]'
  // No par 1:1 oculto o usuário nunca viu o conceito de Momento (ele só "divide
  // despesas com alguém") — a copy não pode citar um Momento que ele não sabe que existe.
  const isHiddenPair = !!meta?.is_pair_default && meta?.shared_group_id == null

  return (
    <div className="space-y-3">
      {historyOpen ? (
        <>
          <p className="text-[12.5px] italic text-[var(--arvo-fg-soft)]">{isHiddenPair ? ((t as any).finances?.expenseSectionHintPair ?? t.finances.expenseSectionHint) : t.finances.expenseSectionHint}</p>

          {/* Saldos vivos deste Momento — inclui quem deve o quê pra mim, com acerto direto,
              sem precisar sair pra página Pessoas (que só mostra o agregado entre TODOS os Momentos). */}
          <div className="p-3.5 rounded-xl border border-[var(--arvo-border)] bg-[var(--arvo-surface-2)] space-y-2">
            <p className="text-[11px] uppercase tracking-wide text-[var(--arvo-fg-soft)]">{isHiddenPair ? ((t as any).finances?.expenseBalancesPair ?? t.finances.expenseBalances) : t.finances.expenseBalances}</p>
            {balances.length === 0 ? (
              <p className="text-[13.5px] text-[var(--arvo-fg-soft)]">{t.finances.expenseBalancesSettled}</p>
            ) : balances.map(b => {
              const name = b.display?.name ?? b.display?.email ?? b.user_id
              return (
                <div key={b.user_id} className="flex items-center gap-2">
                  <Avatar name={b.display?.name} email={b.display?.email} avatarUrl={b.display?.avatar_url} size={22} />
                  <span className="text-[14px] text-[var(--arvo-fg)] flex-1 truncate">{name}</span>
                  {Object.entries(b.perCurrency).map(([cur, amt]) => (
                    <span key={cur} className="text-[14px] font-semibold" style={{ color: amt > 0 ? '#1F8A5B' : '#D63B2F' }}>
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
                  <div key={e.id} className={`flex items-center gap-2.5 px-4 py-3 text-sm ${i > 0 ? 'border-t border-[var(--arvo-border-soft)]' : ''}`}>
                    <Avatar name={e.paid_by_display?.name} email={e.paid_by_display?.email} avatarUrl={e.paid_by_display?.avatar_url} size={26} />
                    <div className="flex-1 min-w-0">
                      <span className="text-[var(--arvo-fg)] truncate text-[14px] flex items-center gap-1.5">
                        {e.description}
                        {e.category && (
                          <span className="inline-flex items-center gap-1 text-[10.5px] px-1.5 py-0.5 rounded-full font-medium shrink-0" style={{ background: e.category.color + '22', color: e.category.color }}>
                            {e.category.icon} {e.category.name}
                          </span>
                        )}
                      </span>
                      <span className="text-[11.5px] text-[var(--arvo-fg-soft)] block truncate">
                        {t.finances.expensePaidBy}: {e.paid_by_display?.name} · {e.shares.length} {t.finances.expenseParticipants.toLowerCase()}
                      </span>
                    </div>
                    <div className="text-right shrink-0">
                      <span className="text-[14px] font-semibold block text-[var(--arvo-fg)]">{fmt(e.amount, e.currency)}</span>
                      {converted != null && (
                        <span className="text-[11px] block text-[var(--arvo-fg-soft)]">≈ {fmt(converted, displayCurrency)}</span>
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
            <p className="text-[13.5px] text-[var(--arvo-fg-soft)] text-center py-4">{t.finances.expenseNoEntries}</p>
          )}
        </>
      ) : (
        <button
          type="button"
          onClick={() => setHistoryOpen(true)}
          className="w-full flex items-center justify-between px-3.5 py-2.5 rounded-lg border border-[var(--arvo-border)] text-[13.5px] text-[var(--arvo-fg-soft)] hover:text-[var(--arvo-fg)] transition-colors"
        >
          <span>{(t.finances.expenseHistorySummary ?? '{count} despesas · ver saldos').replace('{count}', String(expenses.length))}</span>
          <svg className="w-3 h-3 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 9l6 6 6-6" />
          </svg>
        </button>
      )}

      {promoNotice && (
        <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', padding: '11px 14px', borderRadius: 12, background: 'var(--arvo-gold-tint)', border: '1px solid var(--arvo-gold-line)' }}>
          <p style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 14, color: 'var(--arvo-gold-text)', lineHeight: 1.5, flex: 1 }}>{promoNotice}</p>
          <button onClick={() => setPromoNotice(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--arvo-gold-text)', fontSize: 15, lineHeight: 1 }}>✕</button>
        </div>
      )}
      {pendingMembers.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
          {pendingMembers.map(m => (
            <span key={m.id ?? m.invite_email} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '5px 12px', borderRadius: 999, border: '1px dashed var(--arvo-border)', fontFamily: 'var(--arvo-font-body)', fontSize: 13.5, color: 'var(--arvo-fg-soft)' }}>
              {(m.display?.name ?? m.invite_email ?? '')} · {(t as any).finances?.splitPendingBadge ?? 'aguardando aceite'}
            </span>
          ))}
        </div>
      )}
      {!showForm && historyOpen && (
        <button
          onClick={() => setAddPerson(true)}
          className="arvo-pill-btn arvo-pill-btn--ghost w-full"
        >
          + {meta?.is_pair_default && !meta?.shared_group_id ? ((t as any).finances?.splitWithMore ?? 'Dividir com mais pessoas') : t.finances.expenseAddPerson}
        </button>
      )}

      {!showForm ? (
        <button
          onClick={() => setShowForm(true)}
          className="arvo-pill-btn arvo-pill-btn--primary w-full"
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

          <div className="flex gap-2.5">
            <button
              onClick={() => { setShowForm(false); resetForm() }}
              className="arvo-pill-btn arvo-pill-btn--ghost flex-1"
            >
              {t.common.cancel}
            </button>
            <button
              onClick={submit} disabled={saving}
              className="arvo-pill-btn arvo-pill-btn--primary flex-1"
            >
              {t.common.save}
            </button>
          </div>
        </div>
      )}

      {addPerson && meta && (
        <AddPersonFlow
          momentId={momentId}
          meta={meta}
          pairFriend={participants.find(p => p.user_id !== user?.id)}
          onClose={() => setAddPerson(false)}
          onDone={async () => {
            setAddPerson(false)
            await load()
            // Promover o par oculto o transforma num Momento nomeado visível — a lista de
            // Momentos (e o modal que embrulha este painel) precisa recarregar pra refletir.
            onPromoted?.()
            setPromoNotice((t as any).finances?.splitNewMomentNotice ?? 'Momento criado. Sua divisão 1:1 continua aqui, intocada; a nova divisão vive no Momento, que aparece na sua lista assim que os convites forem aceitos.')
          }}
        />
      )}
    </div>
  )
}

// Junta primeiros nomes em lista falada ("André, Charles e Marina") — sugestão
// de nome pro Momento novo do split. O conector final vem do i18n.
function joinFirstNames(names: string[], lastJoin: string): string {
  const firsts = names.map(n => n.trim().split(/\s+/)[0]).filter(Boolean)
  if (firsts.length === 0) return ''
  if (firsts.length === 1) return firsts[0]
  return `${firsts.slice(0, -1).join(', ')}${lastJoin}${firsts[firsts.length - 1]}`
}

// "Dividir com mais pessoas" (modelo B, ordem invertida 2026-07-10): primeiro
// QUEM participa, depois o NOME — só assim a sugestão de nome pode incluir todo
// mundo (antes ela nascia só com os dois do 1:1, porque a 3ª pessoa ainda não
// existia). Criação + convites acontecem juntos no final: nasce um Momento novo
// e vazio (POST /moments/split-group; o histórico do par fica privado) e cada
// escolhido recebe convite nele — aceite explícito, regra da casa, inclusive
// pro amigo do 1:1. Em Momento já nomeado, vai direto pro convite (MembersPanel).
function AddPersonFlow({ momentId, meta, pairFriend, onClose, onDone }: {
  momentId: number
  meta: MomentMeta
  pairFriend?: Participant
  onClose: () => void
  onDone: () => void
}) {
  const { t } = useI18n()
  const { user } = useAuth()
  const friends = useActiveFriends()
  const needsPromote = meta.is_pair_default && meta.shared_group_id == null

  // Amigo do 1:1 já entra selecionado (dá pra remover) — o e-mail pro convite
  // vem da lista de amigos ativos quando o display do membro não traz.
  const [picked, setPicked] = useState<PickedPerson[]>(() => {
    if (!needsPromote || !pairFriend) return []
    const friend = friends.find(f => f.user_id === pairFriend.user_id)
    const email = pairFriend.display?.email ?? friend?.email
    if (!email) return []
    return [{ user_id: pairFriend.user_id, email, name: pairFriend.display?.name ?? friend?.name, avatar_url: pairFriend.display?.avatar_url ?? friend?.avatar_url }]
  })
  const [step, setStep] = useState<'people' | 'name'>('people')
  const [name, setName] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  // Se um convite falhar depois do Momento já criado, guardamos o id pra não
  // criar um segundo Momento quando o usuário tentar de novo.
  const [createdId, setCreatedId] = useState<number | null>(null)

  const myName = (user?.user_metadata?.first_name as string | undefined) || ''
  const lastJoin = (t as any).finances?.splitNameJoinLast ?? ' e '
  const suggestions: string[] = (t as any).finances?.splitNameSuggestions ?? []

  function goToName() {
    if (picked.length === 0) return
    setName(prev => prev || joinFirstNames([myName, ...picked.map(p => p.name || p.email || `@${p.username}` || '')], lastJoin))
    setStep('name')
    setError('')
  }

  async function createAndInvite() {
    if (!name.trim()) { setError(t.finances.splitPromoteNameRequired); return }
    setSaving(true)
    setError('')
    try {
      let momentIdNew = createdId
      if (momentIdNew == null) {
        const res = await apiFetch<{ moment_id: number }>(`/finances/moments/split-group`, { method: 'POST', body: JSON.stringify({ name: name.trim(), from_moment_id: momentId }) })
        momentIdNew = res.moment_id
        setCreatedId(momentIdNew)
      }
      const failed: string[] = []
      for (const p of picked) {
        try {
          await apiFetch(`/finances/moments/${momentIdNew}/invite`, { method: 'POST', body: JSON.stringify(p.email ? { email: p.email } : { username: p.username }) })
        } catch (ex) {
          // 409 = já é colaborador (retry depois de falha parcial) — não é erro real.
          if ((ex as { status?: number }).status !== 409) failed.push(p.name || p.email || `@${p.username}`)
        }
      }
      if (failed.length > 0) {
        setError(((t as any).finances?.splitInviteFailed ?? 'Não foi possível convidar: {names}. Tente de novo.').replace('{names}', failed.join(', ')))
        setPicked(prev => prev.filter(p => failed.includes(p.name || p.email || `@${p.username}`)))
        return
      }
      onDone()
    } catch (e) {
      setError(e instanceof Error ? e.message : t.finances.splitPromoteNameRequired)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center sm:p-4" style={{ background: 'rgba(0,0,0,0.45)' }} onClick={onClose}>
      <div
        className="w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl max-h-[92vh] sm:max-h-[90vh] overflow-y-auto"
        style={{ background: 'var(--arvo-surface)', boxShadow: 'var(--arvo-shadow-lg)', padding: '20px 22px calc(20px + env(safe-area-inset-bottom, 0px))' }}
        onClick={e => e.stopPropagation()}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
          <h3 className="flex-1" style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 17, fontWeight: 600, color: 'var(--arvo-fg)' }}>{needsPromote ? ((t as any).finances?.splitWithMore ?? 'Dividir com mais pessoas') : t.finances.expenseAddPerson}</h3>
          <button type="button" onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--arvo-fg-soft)' }}>
            <svg width="15" height="15" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.6"><path strokeLinecap="round" d="M1.5 1.5l11 11M12.5 1.5l-11 11" /></svg>
          </button>
        </div>

        {!needsPromote ? (
          // Momento já nomeado: convite direto, sem passo de nome.
          <div className="space-y-3.5">
            <p style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 14.5, color: 'var(--arvo-fg-soft)', lineHeight: 1.55 }}>
              {t.finances.splitInviteHint}
            </p>
            <MembersPanel momentId={momentId} ownerId={meta.owner_id} />
            <button onClick={onDone} className="arvo-pill-btn arvo-pill-btn--primary w-full">
              {t.common.done}
            </button>
          </div>
        ) : step === 'people' ? (
          <div className="space-y-3.5">
            <p style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 14.5, color: 'var(--arvo-fg-soft)', lineHeight: 1.55 }}>
              {((t as any).finances?.splitPeopleHint ?? t.finances.splitPromoteHint).replace('{name}', pairFriend?.display?.name ?? '')}
            </p>
            {picked.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {picked.map((p, i) => (
                  <div key={p.user_id ?? p.email ?? p.username} style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                    <Avatar name={p.name} email={p.email} avatarUrl={p.avatar_url} size={28} />
                    <span style={{ flex: 1, fontFamily: 'var(--arvo-font-body)', fontSize: 14.5, color: 'var(--arvo-fg)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {p.name || p.email || `@${p.username}`}
                    </span>
                    <button
                      type="button"
                      onClick={() => setPicked(prev => prev.filter((_, j) => j !== i))}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--arvo-fg-soft)', padding: 4 }}
                      title={t.common.remove}
                    >
                      <svg width="12" height="12" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.6"><path strokeLinecap="round" d="M1.5 1.5l11 11M12.5 1.5l-11 11" /></svg>
                    </button>
                  </div>
                ))}
              </div>
            )}
            <PersonPicker
              excludePerson={p => (p.user_id != null && p.user_id === user?.id) || picked.some(x => (p.user_id != null && x.user_id === p.user_id) || (!!p.email && x.email === p.email))}
              onSelect={p => setPicked(prev => [...prev, p])}
              actionLabel={(t as any).finances?.splitPickAdd ?? 'Adicionar'}
            />
            {error && <p className="text-[13px] text-[var(--arvo-red)]">{error}</p>}
            <div className="flex gap-2.5">
              <button onClick={onClose} className="arvo-pill-btn arvo-pill-btn--ghost flex-1">{t.common.cancel}</button>
              <button onClick={goToName} disabled={picked.length === 0} className="arvo-pill-btn arvo-pill-btn--primary flex-1">
                {t.common.continue}
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-3.5">
            <p style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 14.5, color: 'var(--arvo-fg-soft)', lineHeight: 1.55 }}>
              {(t as any).finances?.splitNameHint ?? t.finances.splitPromoteHint}
            </p>
            <input
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder={t.finances.splitPromoteNamePlaceholder}
              autoFocus
              className="w-full text-base px-3.5 py-3 rounded-lg bg-[var(--arvo-surface-2)] border border-[var(--arvo-border)] text-[var(--arvo-fg)]"
              onKeyDown={e => { if (e.key === 'Enter') createAndInvite() }}
            />
            {suggestions.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {suggestions.map(s => (
                  <button
                    key={s} type="button" onClick={() => setName(s)}
                    style={{
                      padding: '6px 14px', borderRadius: 999, cursor: 'pointer',
                      border: `1px solid ${name === s ? 'var(--arvo-gold-line)' : 'var(--arvo-border)'}`,
                      background: name === s ? 'var(--arvo-gold-tint)' : 'var(--arvo-hover-bg)',
                      fontFamily: 'var(--arvo-font-body)', fontSize: 13.5,
                      color: name === s ? 'var(--arvo-gold-text)' : 'var(--arvo-fg-soft)',
                    }}
                  >
                    {s}
                  </button>
                ))}
              </div>
            )}
            {error && <p className="text-[13px] text-[var(--arvo-red)]">{error}</p>}
            <div className="flex gap-2.5">
              <button onClick={() => { setStep('people'); setError('') }} disabled={saving} className="arvo-pill-btn arvo-pill-btn--ghost flex-1">
                {(t as any).common?.back ?? 'Voltar'}
              </button>
              <button onClick={createAndInvite} disabled={saving} className="arvo-pill-btn arvo-pill-btn--primary flex-1">
                {saving ? '…' : ((t as any).finances?.splitCreateCta ?? 'Criar e convidar')}
              </button>
            </div>
          </div>
        )}
      </div>
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
          <h3 className="font-semibold text-[var(--arvo-fg)] text-[16px]">{t.finances.expenseSplitTransactionTitle}</h3>
          <p className="text-[13px] text-[var(--arvo-fg-soft)] truncate">{transaction.description} · {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: transaction.currency }).format(Math.abs(transaction.amount))}</p>
        </div>

        {loading ? <div className="flex justify-center py-4"><ArvoLoader size={24} style={{ color: 'var(--arvo-gold)' }} /></div> : (<>
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

          {error && <p className="text-[13px] text-[var(--arvo-red)]">{error}</p>}

          <div className="flex gap-2.5">
            <button onClick={onClose} className="arvo-pill-btn arvo-pill-btn--ghost flex-1">
              {t.common.cancel}
            </button>
            <button onClick={submit} disabled={saving} className="arvo-pill-btn arvo-pill-btn--primary flex-1">
              {t.common.save}
            </button>
          </div>
        </>)}
      </div>
    </div>
  )
}
