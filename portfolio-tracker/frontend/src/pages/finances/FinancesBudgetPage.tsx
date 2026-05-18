import { useState, useEffect, useCallback } from 'react'
import { apiFetch } from '../../lib/api'
import { useI18n } from '../../contexts/I18nContext'
import { useCurrency } from '../../contexts/CurrencyContext'

interface Category {
  id: number
  name: string
  icon: string
  color: string
  budget_monthly: number | null
  envelope_id: number | null
}

interface Envelope {
  id: number
  name: string
  icon: string
  color: string
  pct_target: number
  type: string
  budget_amount: number
  categories: Category[]
}

interface BudgetData {
  income: { monthly_net: number; currency: string; from_categories: boolean }
  envelopes: Envelope[]
}

function fmt(n: number, currency: string) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency, minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(n)
}

function EnvelopeBar({ env, expanded, onToggle, onEditCategory, onDeleteCategory, onAddCategory }:
  { env: Envelope; expanded: boolean; onToggle: () => void; onEditCategory: (c: Category) => void; onDeleteCategory: (id: number) => void; onAddCategory: (envId: number) => void }) {
  const { t } = useI18n()

  const totalCategoryBudget = env.categories.reduce((s, c) => s + (c.budget_monthly ?? 0), 0)
  const allocated = totalCategoryBudget > 0 ? (totalCategoryBudget / env.budget_amount) * 100 : 0
  const isOver = allocated > 100
  const isInvestment = env.type === 'investment'

  const barColor = isOver
    ? '#ef4444'
    : isInvestment && allocated >= 100
      ? '#10b981'
      : env.color

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
      {/* Envelope header */}
      <button
        onClick={onToggle}
        className="w-full px-5 py-4 flex items-center gap-3 hover:bg-gray-50 transition-colors text-left"
      >
        <span className="text-2xl leading-none w-8 shrink-0">{env.icon}</span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between mb-1.5">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-gray-900 text-sm">{env.name}</span>
              <span className="text-xs text-gray-400 font-medium">{env.pct_target}%</span>
              {isOver && <span className="text-xs bg-red-100 text-red-600 font-semibold px-1.5 py-0.5 rounded-full">{t.finances.overLimit}</span>}
              {isInvestment && allocated >= 100 && !isOver && <span className="text-xs bg-green-100 text-green-600 font-semibold px-1.5 py-0.5 rounded-full">{t.finances.goalReached}</span>}
            </div>
            <div className="text-right shrink-0 ml-3">
              <span className="text-xs font-semibold text-gray-700">{fmt(totalCategoryBudget, 'EUR')}</span>
              <span className="text-xs text-gray-400"> / {fmt(env.budget_amount, 'EUR')}</span>
            </div>
          </div>
          {/* Progress bar */}
          <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{ width: `${Math.min(allocated, 100)}%`, backgroundColor: barColor }}
            />
          </div>
        </div>
        <svg
          className={`w-4 h-4 text-gray-400 shrink-0 transition-transform ${expanded ? 'rotate-180' : ''}`}
          fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* Categories */}
      {expanded && (
        <div className="border-t border-gray-50">
          {env.categories.length === 0 ? (
            <p className="px-5 py-3 text-xs text-gray-400">{t.finances.noCategories}</p>
          ) : (
            <ul className="divide-y divide-gray-50">
              {env.categories.map(cat => (
                <li key={cat.id} className="px-5 py-2.5 flex items-center gap-3 group">
                  <span className="text-base leading-none w-6 shrink-0">{cat.icon}</span>
                  <span className="flex-1 text-sm text-gray-700">{cat.name}</span>
                  {cat.budget_monthly != null && (
                    <span className="text-sm font-medium text-gray-600">{fmt(cat.budget_monthly, 'EUR')}</span>
                  )}
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={() => onEditCategory(cat)}
                      className="p-1 text-gray-400 hover:text-[#001A70] transition-colors rounded"
                      title="Editar"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5">
                        <path d="M13.488 2.513a1.75 1.75 0 0 0-2.475 0L6.75 6.774a2.75 2.75 0 0 0-.596.892l-.848 2.047a.75.75 0 0 0 .98.98l2.047-.848a2.75 2.75 0 0 0 .892-.596l4.261-4.263a1.75 1.75 0 0 0 0-2.474ZM4.75 14a.75.75 0 0 0 0-1.5H3.5a.5.5 0 0 1-.5-.5V4a.5.5 0 0 1 .5-.5h8a.5.5 0 0 1 .5.5v1.25a.75.75 0 0 0 1.5 0V4a2 2 0 0 0-2-2h-8a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h1.25Z" />
                      </svg>
                    </button>
                    <button
                      onClick={() => onDeleteCategory(cat.id)}
                      className="p-1 text-gray-400 hover:text-red-500 transition-colors rounded"
                      title="Remover"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5">
                        <path fillRule="evenodd" d="M5 3.25V4H2.75a.75.75 0 0 0 0 1.5h.3l.815 8.15A1.5 1.5 0 0 0 5.357 15h5.285a1.5 1.5 0 0 0 1.493-1.35l.815-8.15h.3a.75.75 0 0 0 0-1.5H11v-.75A2.25 2.25 0 0 0 8.75 1h-1.5A2.25 2.25 0 0 0 5 3.25Zm2.25-.75a.75.75 0 0 0-.75.75V4h3v-.75a.75.75 0 0 0-.75-.75h-1.5ZM6.05 6a.75.75 0 0 1 .787.713l.275 5.5a.75.75 0 0 1-1.498.075l-.275-5.5A.75.75 0 0 1 6.05 6Zm3.9 0a.75.75 0 0 1 .712.787l-.275 5.5a.75.75 0 0 1-1.498-.075l.275-5.5a.75.75 0 0 1 .786-.712Z" clipRule="evenodd" />
                      </svg>
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
          <div className="px-5 py-2.5">
            <button
              onClick={() => onAddCategory(env.id)}
              className="flex items-center gap-1.5 text-xs text-[#001A70] hover:opacity-70 transition-opacity font-medium"
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5">
                <path d="M8.75 3.75a.75.75 0 0 0-1.5 0v3.5h-3.5a.75.75 0 0 0 0 1.5h3.5v3.5a.75.75 0 0 0 1.5 0v-3.5h3.5a.75.75 0 0 0 0-1.5h-3.5v-3.5Z" />
              </svg>
              {t.finances.addCategory}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

interface CategoryModal {
  mode: 'add' | 'edit'
  envelopeId: number
  category?: Category
}

const EMOJI_OPTIONS = ['🏠','🛒','💊','🚇','📱','📈','🏦','🍽️','🎶','✈️','🛍️','🎭','🎁','🎬','💆','📚','💡','🎮','🐾','🌿','🍔','☕','🚗','⚽','🎓','🏋️','💰','🎪']

export default function FinancesBudgetPage() {
  const { t } = useI18n()
  const { currency } = useCurrency()
  void currency

  const [data, setData]               = useState<BudgetData | null>(null)
  const [loading, setLoading]         = useState(true)
  const [expandedIds, setExpandedIds] = useState<Set<number>>(new Set())
  const [incomeEdit, setIncomeEdit]   = useState(false)
  const [incomeVal, setIncomeVal]     = useState('')
  const [incomeCur, setIncomeCur]     = useState('EUR')
  const [saving, setSaving]           = useState(false)
  const [modal, setModal]             = useState<CategoryModal | null>(null)
  const [catName, setCatName]         = useState('')
  const [catIcon, setCatIcon]         = useState('🏷️')
  const [catBudget, setCatBudget]     = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const d = await apiFetch<BudgetData>('/finances/budget')
      setData(d)
      setIncomeVal(String(d.income.monthly_net))
      setIncomeCur(d.income.currency)
      // Start all expanded
      setExpandedIds(new Set(d.envelopes.map(e => e.id)))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  async function saveIncome() {
    if (!data) return
    setSaving(true)
    try {
      await apiFetch('/finances/income', { method: 'PATCH', body: JSON.stringify({ monthly_net: parseFloat(incomeVal), currency: incomeCur }) })
      await load()
      setIncomeEdit(false)
    } finally {
      setSaving(false)
    }
  }

  function toggleEnvelope(id: number) {
    setExpandedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function openAddCategory(envId: number) {
    setCatName(''); setCatIcon('🏷️'); setCatBudget('')
    setModal({ mode: 'add', envelopeId: envId })
  }

  function openEditCategory(cat: Category) {
    setCatName(cat.name)
    setCatIcon(cat.icon)
    setCatBudget(cat.budget_monthly != null ? String(cat.budget_monthly) : '')
    setModal({ mode: 'edit', envelopeId: cat.envelope_id ?? 0, category: cat })
  }

  async function saveCategory() {
    if (!modal || !catName.trim()) return
    setSaving(true)
    try {
      const payload = {
        name: catName.trim(),
        icon: catIcon,
        budget_monthly: catBudget ? parseFloat(catBudget) : null,
        envelope_id: modal.envelopeId,
      }
      if (modal.mode === 'add') {
        await apiFetch('/finances/categories', { method: 'POST', body: JSON.stringify(payload) })
      } else {
        await apiFetch(`/finances/categories/${modal.category!.id}`, { method: 'PATCH', body: JSON.stringify(payload) })
      }
      await load()
      setModal(null)
    } finally {
      setSaving(false)
    }
  }

  async function deleteCategory(id: number) {
    if (!confirm(t.finances.confirmDeleteCategory)) return
    await apiFetch(`/finances/categories/${id}`, { method: 'DELETE' })
    await load()
  }

  if (loading) return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-12 text-center text-gray-400 text-sm">
      {t.common.loading}
    </div>
  )
  if (!data) return null

  const incomeEnvelopes  = data.envelopes.filter(e => e.type === 'income')
  const expenseEnvelopes = data.envelopes.filter(e => e.type !== 'income')

  const totalBudget    = expenseEnvelopes.reduce((s, e) => s + e.budget_amount, 0)
  const totalCatBudget = expenseEnvelopes.reduce((s, e) => s + e.categories.reduce((cs, c) => cs + (c.budget_monthly ?? 0), 0), 0)
  const unallocated    = data.income.monthly_net - totalCatBudget

  return (
    <div className="space-y-5">
      {/* Page header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">{t.finances.budgetTitle}</h1>
          <p className="text-sm text-gray-400 mt-0.5">{t.finances.budgetSubtitle}</p>
        </div>
      </div>

      {/* Income card — unified with income envelope categories */}
      {incomeEnvelopes.length > 0 ? (
        <div className="space-y-3">
          <p className="text-xs text-gray-400 uppercase tracking-wide font-medium px-1">{t.finances.incomeLabel}</p>
          {incomeEnvelopes.map(env => {
            const envTotal = env.categories.reduce((s, c) => s + (c.budget_monthly ?? 0), 0)
            return (
              <div key={env.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                {/* Header: envelope name + total */}
                <button
                  onClick={() => toggleEnvelope(env.id)}
                  className="w-full px-5 py-4 flex items-center gap-3 hover:bg-gray-50 transition-colors text-left"
                >
                  <span className="text-2xl leading-none w-8 shrink-0">{env.icon}</span>
                  <div className="flex-1 min-w-0">
                    <span className="font-semibold text-gray-900 text-sm">{env.name}</span>
                  </div>
                  <div className="text-right shrink-0 ml-3">
                    <span className="text-sm font-semibold text-emerald-600">{fmt(envTotal, data.income.currency)}</span>
                    <span className="text-xs text-gray-400 ml-1">{t.finances.perMonth}</span>
                  </div>
                  <svg
                    className={`w-4 h-4 text-gray-400 shrink-0 transition-transform ${expandedIds.has(env.id) ? 'rotate-180' : ''}`}
                    fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                  </svg>
                </button>

                {/* Categories with budget amounts */}
                {expandedIds.has(env.id) && (
                  <div className="border-t border-gray-50">
                    {env.categories.length === 0 ? (
                      <p className="px-5 py-3 text-xs text-gray-400">{t.finances.noCategories}</p>
                    ) : (
                      <ul className="divide-y divide-gray-50">
                        {env.categories.map(cat => (
                          <li key={cat.id} className="px-5 py-2.5 flex items-center gap-3 group">
                            <span className="text-base leading-none w-6 shrink-0">{cat.icon}</span>
                            <span className="flex-1 text-sm text-gray-700">{cat.name}</span>
                            {cat.budget_monthly != null && (
                              <span className="text-sm font-medium text-gray-600">{fmt(cat.budget_monthly, data.income.currency)}</span>
                            )}
                            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                              <button onClick={() => openEditCategory(cat)} className="p-1 text-gray-400 hover:text-[#001A70] transition-colors rounded">
                                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5">
                                  <path d="M13.488 2.513a1.75 1.75 0 0 0-2.475 0L6.75 6.774a2.75 2.75 0 0 0-.596.892l-.848 2.047a.75.75 0 0 0 .98.98l2.047-.848a2.75 2.75 0 0 0 .892-.596l4.261-4.263a1.75 1.75 0 0 0 0-2.474ZM4.75 14a.75.75 0 0 0 0-1.5H3.5a.5.5 0 0 1-.5-.5V4a.5.5 0 0 1 .5-.5h8a.5.5 0 0 1 .5.5v1.25a.75.75 0 0 0 1.5 0V4a2 2 0 0 0-2-2h-8a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h1.25Z" />
                                </svg>
                              </button>
                              <button onClick={() => deleteCategory(cat.id)} className="p-1 text-gray-400 hover:text-red-500 transition-colors rounded">
                                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5">
                                  <path fillRule="evenodd" d="M5 3.25V4H2.75a.75.75 0 0 0 0 1.5h.3l.815 8.15A1.5 1.5 0 0 0 5.357 15h5.285a1.5 1.5 0 0 0 1.493-1.35l.815-8.15h.3a.75.75 0 0 0 0-1.5H11v-.75A2.25 2.25 0 0 0 8.75 1h-1.5A2.25 2.25 0 0 0 5 3.25Zm2.25-.75a.75.75 0 0 0-.75.75V4h3v-.75a.75.75 0 0 0-.75-.75h-1.5ZM6.05 6a.75.75 0 0 1 .787.713l.275 5.5a.75.75 0 0 1-1.498.075l-.275-5.5A.75.75 0 0 1 6.05 6Zm3.9 0a.75.75 0 0 1 .712.787l-.275 5.5a.75.75 0 0 1-1.498-.075l.275-5.5a.75.75 0 0 1 .786-.712Z" clipRule="evenodd" />
                                </svg>
                              </button>
                            </div>
                          </li>
                        ))}
                      </ul>
                    )}
                    <div className="px-5 py-2.5">
                      <button onClick={() => openAddCategory(env.id)} className="flex items-center gap-1.5 text-xs text-[#001A70] hover:opacity-70 transition-opacity font-medium">
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5">
                          <path d="M8.75 3.75a.75.75 0 0 0-1.5 0v3.5h-3.5a.75.75 0 0 0 0 1.5h3.5v3.5a.75.75 0 0 0 1.5 0v-3.5h3.5a.75.75 0 0 0 0-1.5h-3.5v-3.5Z" />
                        </svg>
                        {t.finances.addCategory}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      ) : (
        /* Fallback: manual income input when no income envelope exists yet */
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs text-gray-500 uppercase tracking-wide font-medium">{t.finances.income}</span>
            {!incomeEdit && (
              <button onClick={() => setIncomeEdit(true)} className="text-xs text-[#001A70] hover:opacity-70 transition-opacity">{t.common.edit}</button>
            )}
          </div>
          {incomeEdit ? (
            <div className="flex items-center gap-2 mt-2">
              <select value={incomeCur} onChange={e => setIncomeCur(e.target.value)} className="border border-gray-200 rounded-lg px-2 py-1.5 text-sm">
                {['EUR','BRL','USD'].map(c => <option key={c}>{c}</option>)}
              </select>
              <input
                type="number"
                value={incomeVal}
                onChange={e => setIncomeVal(e.target.value)}
                className="flex-1 border border-gray-200 rounded-lg px-3 py-1.5 text-sm"
                placeholder="3500"
              />
              <button onClick={saveIncome} disabled={saving} className="px-3 py-1.5 bg-[#001A70] text-white text-xs rounded-lg hover:opacity-80 transition-opacity disabled:opacity-50">
                {saving ? '…' : t.common.save}
              </button>
              <button onClick={() => setIncomeEdit(false)} className="px-3 py-1.5 text-gray-500 text-xs hover:text-gray-700 transition-colors">{t.common.cancel}</button>
            </div>
          ) : (
            <p className="text-2xl font-bold text-gray-900 mt-1">
              {fmt(data.income.monthly_net, data.income.currency)}
              <span className="text-sm font-normal text-gray-400 ml-1">{t.finances.perMonth}</span>
            </p>
          )}
        </div>
      )}

      {/* 50/30/10/10 summary — expense envelopes only */}
      {expenseEnvelopes.length > 0 && (
        <>
          <p className="text-xs text-gray-400 uppercase tracking-wide font-medium px-1">{t.finances.expenses}</p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {expenseEnvelopes.map(env => {
              const catTotal = env.categories.reduce((s, c) => s + (c.budget_monthly ?? 0), 0)
              const pctReal  = data.income.monthly_net > 0 ? (catTotal / data.income.monthly_net) * 100 : 0
              const over     = pctReal > env.pct_target
              const met      = env.type === 'investment' && pctReal >= env.pct_target
              return (
                <div key={env.id} className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-lg leading-none">{env.icon}</span>
                    <span className="text-xs font-medium text-gray-600 truncate">{env.name}</span>
                  </div>
                  <div className="text-lg font-bold" style={{ color: over ? '#ef4444' : met ? '#10b981' : env.color }}>
                    {pctReal.toFixed(1)}%
                  </div>
                  <div className="text-xs text-gray-400">{t.finances.target}: {env.pct_target}%</div>
                  <div className="mt-2 h-1 bg-gray-100 rounded-full overflow-hidden">
                    <div className="h-full rounded-full" style={{ width: `${Math.min(pctReal / env.pct_target * 100, 100)}%`, backgroundColor: over ? '#ef4444' : met ? '#10b981' : env.color }} />
                  </div>
                </div>
              )
            })}
          </div>
        </>
      )}

      {/* Unallocated banner */}
      {Math.abs(unallocated) > 0.5 && (
        <div className={`rounded-xl px-4 py-3 text-sm flex items-center gap-2 ${unallocated > 0 ? 'bg-amber-50 text-amber-700 border border-amber-100' : 'bg-red-50 text-red-600 border border-red-100'}`}>
          <span>{unallocated > 0 ? '⚠️' : '🚨'}</span>
          {unallocated > 0
            ? `${fmt(unallocated, data.income.currency)} ${t.finances.unallocatedBanner}`
            : `${t.finances.overspentBanner} ${fmt(Math.abs(unallocated), data.income.currency)}`}
        </div>
      )}

      {/* Expense envelopes */}
      <div className="space-y-3">
        {expenseEnvelopes.map(env => (
          <EnvelopeBar
            key={env.id}
            env={env}
            expanded={expandedIds.has(env.id)}
            onToggle={() => toggleEnvelope(env.id)}
            onEditCategory={openEditCategory}
            onDeleteCategory={deleteCategory}
            onAddCategory={openAddCategory}
          />
        ))}
      </div>

      {/* Total row */}
      <div className="bg-gray-50 rounded-xl px-5 py-3 flex items-center justify-between">
        <span className="text-sm text-gray-500">{t.finances.totalBudgeted}</span>
        <span className="text-sm font-semibold text-gray-900">{fmt(totalBudget, data.income.currency)}</span>
      </div>

      {/* Category modal */}
      {modal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4" onClick={() => setModal(null)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6" onClick={e => e.stopPropagation()}>
            <h3 className="font-semibold text-gray-900 mb-4">
              {modal.mode === 'add' ? t.finances.newCategory : t.finances.editCategory}
            </h3>
            <div className="space-y-3">
              <div>
                <label className="block text-xs text-gray-500 mb-1">{t.finances.categoryName}</label>
                <input
                  autoFocus
                  value={catName}
                  onChange={e => setCatName(e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#001A70]/20"
                  placeholder="Ex: Moradia"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">{t.finances.categoryIcon}</label>
                <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto">
                  {EMOJI_OPTIONS.map(e => (
                    <button
                      key={e}
                      onClick={() => setCatIcon(e)}
                      className={`text-xl p-1 rounded-lg transition-colors ${catIcon === e ? 'bg-[#001A70]/10 ring-1 ring-[#001A70]/30' : 'hover:bg-gray-100'}`}
                    >{e}</button>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">{t.finances.monthlyBudget}</label>
                <div className="flex items-center gap-2">
                  <span className="text-sm text-gray-500">{data.income.currency}</span>
                  <input
                    type="number"
                    value={catBudget}
                    onChange={e => setCatBudget(e.target.value)}
                    className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#001A70]/20"
                    placeholder="0"
                  />
                </div>
              </div>
            </div>
            <div className="flex gap-2 mt-5">
              <button
                onClick={saveCategory}
                disabled={saving || !catName.trim()}
                className="flex-1 bg-[#001A70] text-white text-sm py-2 rounded-xl hover:opacity-80 transition-opacity disabled:opacity-40"
              >
                {saving ? '…' : t.common.save}
              </button>
              <button onClick={() => setModal(null)} className="px-4 text-sm text-gray-500 hover:text-gray-700 transition-colors">{t.common.cancel}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
