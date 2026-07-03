import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { apiFetch } from '../../lib/api'
import { useI18n } from '../../contexts/I18nContext'
import { useAuth } from '../../contexts/AuthContext'
import { useCurrency } from '../../contexts/CurrencyContext'
import { Icon } from '../../components/icons'
import Avatar from '../voyage/_shared/Avatar'

interface Category {
  id: number
  name: string
  name_key?: string | null
  icon: string
  color: string
  budget_monthly: number | null
  envelope_id: number | null
}

interface EnvSharedCategory {
  id: number
  name: string
  icon: string
  color: string
  my_goal: number
  total_goal: number
  currency: string
  group_id: number
  group_name: string
}

interface Envelope {
  id: number
  name: string
  name_key?: string | null
  icon: string
  color: string
  pct_target: number
  type: string
  budget_amount: number
  description?: string | null
  categories: Category[]
  shared_categories: EnvSharedCategory[]
}

interface BudgetData {
  income: { monthly_net: number; currency: string; from_categories: boolean }
  envelopes: Envelope[]
}

interface SharedMember {
  id: number
  user_id: string | null
  invite_email: string | null
  status: string
  share_pct: number
  share_mode: 'salary_based' | 'manual'
  salary_authorized: boolean
  display: { name: string; email: string; avatar_url?: string }
}

interface SharedCategory {
  id: number
  group_id: number
  name: string
  icon: string
  color: string
  total_goal: number
  currency: string
  local_envelope_id: number | null
}

interface SharedGroup {
  id: number
  name: string
  members: SharedMember[]
  categories: SharedCategory[]
}

function _fmt(n: number, currency: string) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency, minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(n)
}

const ENV_TYPE_KEY: Record<string, string> = {
  essential: 'envelopeEssential',
  investment: 'envelopeInvestment',
  savings:    'envelopeSavings',
  income:     'envelopeIncome',
}

// Envelope colors stored in the DB (e.g. #3b82f6) are raw Tailwind swatches picked from
// the category color picker — too saturated against the brand's muted palette. Use the
// brand tokens for the summary bar instead (same mapping as Overview's envelope charts).
const ENV_TYPE_COLOR: Record<string, string> = {
  essential:  'var(--arvo-blue)',
  investment: 'var(--arvo-green)',
  savings:    'var(--arvo-ocre)',
  free:       'var(--arvo-gold)',
}

function resolveEnvName(name: string, type: string, nameKey: string | null | undefined, keys: Record<string, string>): string {
  const k = nameKey ?? ENV_TYPE_KEY[type] ?? null
  if (!k) return name
  return keys[k] ?? name
}

function resolveKey(name: string, nameKey: string | null | undefined, keys: Record<string, string>): string {
  if (!nameKey) return name
  return keys[nameKey] ?? name
}


function EnvelopeBar({ env, allEnvelopes, expanded, onToggle, onEditCategory, onDeleteCategory, onAddCategory, onSaveDescription, onShareCategory, onSaveCategoryBudget, onMoveCategory, actuals: _actuals, historicals, currency, incomeMonthly, sharedGroups, onSetSharedEnvelope, onSaveSharedGoal, onDeleteSharedCategory, onEditSplit }:
  { env: Envelope; allEnvelopes: Envelope[]; expanded: boolean; onToggle: () => void; onEditCategory: (c: Category) => void; onDeleteCategory: (id: number) => void; onAddCategory: (envId: number) => void; onSaveDescription: (id: number, desc: string) => void; onShareCategory: (c: Category) => void; onSaveCategoryBudget: (id: number, value: number | null) => void; onMoveCategory: (id: number, envId: number) => void; actuals: Map<number, number>; historicals: Map<number, number>; currency: string; incomeMonthly: number; sharedGroups: SharedGroup[]; onSetSharedEnvelope: (catId: number, envId: number | null) => void; onSaveSharedGoal: (catId: number, value: number) => void; onDeleteSharedCategory: (catId: number) => void; onEditSplit: (group: SharedGroup) => void }) {
  const { t } = useI18n()
  const { user } = useAuth()
  const { hideValues } = useCurrency()
  const fmt = (n: number, cur: string) => hideValues ? '•••' : _fmt(n, cur)
  const nameKeys: Record<string, string> = {
    envelopeEssential:     t.finances.envelopeEssential,
    envelopeInvestment:    t.finances.envelopeInvestment,
    envelopeSavings:       t.finances.envelopeSavings,
    envelopeFree:          t.finances.envelopeFree,
    envelopeIncome:        t.finances.envelopeIncome,
    envelopeNonEssential:  t.finances.envelopeNonEssential,
    envelopeTorrar:        t.finances.envelopeTorrar,
    categoryTransfer:      t.finances.categoryTransfer,
    categorySalary:        t.finances.categorySalary,
    categoryUncategorized: t.finances.categoryUncategorized,
    categoryGroceries:     t.finances.categoryGroceries,
    categoryRestaurant:    t.finances.categoryRestaurant,
    categoryTransport:     t.finances.categoryTransport,
    categoryHealth:        t.finances.categoryHealth,
    categoryEntertainment: t.finances.categoryEntertainment,
    categoryHousing:       t.finances.categoryHousing,
    categoryStreaming:      t.finances.categoryStreaming,
    categorySubscriptions: t.finances.categorySubscriptions,
    categoryPharmacy:      t.finances.categoryPharmacy,
    categoryClothing:      t.finances.categoryClothing,
    categoryTravel:        t.finances.categoryTravel,
    categoryCoffee:        t.finances.categoryCoffee,
    categoryUtilities:     t.finances.categoryUtilities,
    categoryEducation:     t.finances.categoryEducation,
    categoryPersonalCare:  t.finances.categoryPersonalCare,
    categoryElectronics:   t.finances.categoryElectronics,
    categoryAirbnb:          t.finances.categoryAirbnb,
    categoryOther:           t.finances.categoryOther,
    categoryGifts:           t.finances.categoryGifts,
    categoryShopping:        t.finances.categoryShopping,
    categoryTaxes:           t.finances.categoryTaxes,
    categoryFees:            t.finances.categoryFees,
    categoryBarsRestaurants: t.finances.categoryBarsRestaurants,
    categoryShowsParties:    t.finances.categoryShowsParties,
    categoryPhone:           t.finances.categoryPhone,
    categoryInvestment:      t.finances.categoryInvestment,
  }
  const descByType: Record<string, string> = {
    essential:  t.finances.descEssential,
    investment: t.finances.descInvestment,
    savings:    t.finances.descSavings,
    free:       t.finances.descFree,
  }
  const descByNameKey: Record<string, string> = {
    envelopeNonEssential: t.finances.descNonEssential,
    envelopeTorrar:       t.finances.descTorrar,
  }
  const defaultDesc = (env.name_key ? descByNameKey[env.name_key] : null) ?? descByType[env.type] ?? ''
  const [editingDesc, setEditingDesc] = useState(false)
  const [descInput,   setDescInput]   = useState(env.description ?? defaultDesc)
  const [editingCatId, setEditingCatId] = useState<number | null>(null)
  const [catBudgetInput, setCatBudgetInput] = useState('')
  const [envPickerCatId, setEnvPickerCatId] = useState<number | null>(null)

  // Envelope budget is now the sum of its categories (bottom-up), not an independent
  // pct-of-income target the user has to reconcile category totals against by hand.
  const totalCategoryBudget = env.categories.reduce((s, c) => s + (c.budget_monthly ?? 0), 0)
    + env.shared_categories.reduce((s, c) => s + c.my_goal, 0)
  const [sharedEnvPickerId, setSharedEnvPickerId] = useState<number | null>(null)
  const [editingSharedCatId, setEditingSharedCatId] = useState<number | null>(null)
  const [sharedGoalInput, setSharedGoalInput] = useState('')

  // O campo editável mostra "minha meta" (pra ficar alinhado com as categorias
  // normais), mas o backend só guarda a meta TOTAL do grupo — então convertemos
  // de volta usando o % de participação atual do usuário.
  function saveSharedGoal(catId: number, myPct: number) {
    setEditingSharedCatId(null)
    const v = parseFloat(sharedGoalInput)
    if (!isNaN(v) && v >= 0 && myPct > 0) onSaveSharedGoal(catId, Math.round((v / (myPct / 100)) * 100) / 100)
  }

  function saveDesc() {
    setEditingDesc(false)
    onSaveDescription(env.id, descInput)
  }

  function saveCatBudget(catId: number) {
    setEditingCatId(null)
    const v = catBudgetInput.trim() === '' ? null : parseFloat(catBudgetInput)
    if (v === null || (!isNaN(v) && v >= 0)) onSaveCategoryBudget(catId, v)
  }

  return (
    <div className="bg-[var(--arvo-surface)] rounded-2xl border border-[var(--arvo-border)] shadow-sm overflow-hidden">
      {/* Envelope header */}
      <div
        role="button"
        tabIndex={0}
        onClick={onToggle}
        onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onToggle() } }}
        className="w-full px-5 py-4 flex items-center gap-3 hover:bg-[var(--arvo-surface-2)] transition-colors text-left cursor-pointer"
      >
        <span className="text-2xl leading-none w-8 shrink-0">{env.icon}</span>
        <div className="flex-1 min-w-0 flex items-center justify-between">
          <span className="font-semibold text-[var(--arvo-fg)] text-sm">{resolveEnvName(env.name, env.type, env.name_key, nameKeys)}</span>
          <div className="flex items-baseline gap-1.5 shrink-0 ml-3">
            {incomeMonthly > 0 && (
              <span className="text-xs text-[var(--arvo-fg-soft)]">{Math.round(totalCategoryBudget / incomeMonthly * 100)}%{t.finances.ofIncomeSuffix}</span>
            )}
            <span className="text-sm font-semibold text-[var(--arvo-fg)]">{fmt(totalCategoryBudget, currency)}</span>
          </div>
        </div>
        <svg
          className={`w-4 h-4 text-[var(--arvo-fg-soft)] shrink-0 transition-transform ${expanded ? 'rotate-180' : ''}`}
          fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </div>
      {/* Description — editable inline */}
      <div className="px-5 pb-3 -mt-1 group flex items-start gap-1.5" onClick={e => e.stopPropagation()}>
        {editingDesc ? (
          <div className="flex-1 flex flex-col gap-1">
            <textarea
              autoFocus
              value={descInput}
              onChange={e => setDescInput(e.target.value)}
              onBlur={saveDesc}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); saveDesc() } if (e.key === 'Escape') setEditingDesc(false) }}
              rows={2}
              className="w-full text-xs text-[var(--arvo-fg-muted)] border border-[var(--arvo-border)] rounded-lg px-2 py-1 resize-none focus:outline-none focus:ring-1 focus:ring-[var(--arvo-fg)]/30"
              placeholder={t.finances.envelopeDescPlaceholder}
            />
          </div>
        ) : (
          <>
            <p
              className={`flex-1 text-xs italic leading-relaxed cursor-pointer ${(env.name_key ? defaultDesc : env.description) ? 'text-[var(--arvo-fg-muted)]' : 'text-[var(--arvo-fg-soft)]'}`}
              onClick={() => { setDescInput(env.name_key ? defaultDesc : (env.description ?? defaultDesc)); setEditingDesc(true) }}
            >
              {env.name_key ? (defaultDesc || t.finances.envelopeDescPlaceholder) : (env.description || defaultDesc || t.finances.envelopeDescPlaceholder)}
            </p>
            <button
              onClick={() => { setDescInput(env.name_key ? defaultDesc : (env.description ?? defaultDesc)); setEditingDesc(true) }}
              className="[@media(hover:none)]:opacity-100 opacity-0 group-hover:opacity-100 transition-opacity p-0.5 text-[var(--arvo-fg-soft)] hover:text-[var(--arvo-fg)] shrink-0 mt-0.5"
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-3 h-3">
                <path d="M13.488 2.513a1.75 1.75 0 0 0-2.475 0L6.75 6.774a2.75 2.75 0 0 0-.596.892l-.848 2.047a.75.75 0 0 0 .98.98l2.047-.848a2.75 2.75 0 0 0 .892-.596l4.261-4.263a1.75 1.75 0 0 0 0-2.474ZM4.75 14a.75.75 0 0 0 0-1.5H3.5a.5.5 0 0 1-.5-.5V4a.5.5 0 0 1 .5-.5h8a.5.5 0 0 1 .5.5v1.25a.75.75 0 0 0 1.5 0V4a2 2 0 0 0-2-2h-8a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h1.25Z" />
              </svg>
            </button>
          </>
        )}
      </div>

      {/* Categories */}
      {expanded && (
        <div className="border-t border-[var(--arvo-border-soft)]">
          {env.categories.length === 0 ? (
            <p className="px-5 py-3 text-xs text-[var(--arvo-fg-soft)]">{t.finances.noCategories}</p>
          ) : (
            <ul className="divide-y divide-[var(--arvo-border-soft)]">
              {env.categories.map(cat => {
                const hasBudget = cat.budget_monthly != null && cat.budget_monthly > 0
                const hist = historicals.get(cat.id) ?? 0
                return (
                  <li key={cat.id} className="px-5 py-2.5 flex flex-col gap-1">
                    <div className="flex items-center gap-3">
                      <span className="text-base leading-none w-6 shrink-0">{cat.icon}</span>
                      <span className="flex-1 min-w-0 text-sm text-[var(--arvo-fg)] truncate">{resolveKey(cat.name, cat.name_key, nameKeys)}</span>
                      {hist > 0 && (
                        <span className="text-xs text-[var(--arvo-fg-soft)] shrink-0">{t.finances.avg3m}: {fmt(hist, currency)}</span>
                      )}
                      {editingCatId === cat.id ? (
                        <input
                          autoFocus
                          type="number"
                          value={catBudgetInput}
                          onChange={e => setCatBudgetInput(e.target.value)}
                          onBlur={() => saveCatBudget(cat.id)}
                          onKeyDown={e => { if (e.key === 'Enter') saveCatBudget(cat.id); if (e.key === 'Escape') setEditingCatId(null) }}
                          onClick={e => e.stopPropagation()}
                          className="w-20 text-sm text-right text-[var(--arvo-fg)] border border-[var(--arvo-border)] rounded px-1.5 py-0.5 focus:outline-none focus:ring-1 focus:ring-[var(--arvo-fg)]/30 shrink-0"
                        />
                      ) : (
                        <button
                          onClick={() => { setCatBudgetInput(cat.budget_monthly != null ? String(cat.budget_monthly) : ''); setEditingCatId(cat.id) }}
                          className="text-sm font-medium text-[var(--arvo-fg)] underline decoration-dotted decoration-[var(--arvo-fg-soft)] underline-offset-2 shrink-0 hover:decoration-[var(--arvo-fg)]"
                          title={t.finances.clickToEditBudget}
                        >
                          {hasBudget ? fmt(cat.budget_monthly!, currency) : t.finances.setBudget}
                        </button>
                      )}
                    </div>
                    <div className="flex items-center justify-end gap-2 pl-9">
                      <div className="flex items-center gap-0.5 shrink-0">
                        <button
                          onClick={() => setEnvPickerCatId(cat.id)}
                          className="p-1.5 text-[var(--arvo-fg-soft)] hover:text-[var(--arvo-fg)] transition-colors rounded"
                          title={t.finances.moveCategoryTitle}
                        >
                          <span className="text-sm leading-none">{env.icon}</span>
                        </button>
                        {envPickerCatId === cat.id && (
                          <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 px-4" onClick={() => setEnvPickerCatId(null)}>
                            <div className="bg-[var(--arvo-surface)] rounded-t-2xl sm:rounded-2xl shadow-xl w-full sm:max-w-sm max-h-[70vh] overflow-y-auto py-2" onClick={e => e.stopPropagation()}>
                              <p className="px-4 py-2 text-xs text-[var(--arvo-fg-soft)] uppercase tracking-wide font-medium">{t.finances.moveCategoryTitle}</p>
                              {allEnvelopes.map(e => (
                                <button
                                  key={e.id}
                                  onClick={() => { onMoveCategory(cat.id, e.id); setEnvPickerCatId(null) }}
                                  className={`w-full flex items-center gap-2 px-4 py-3 text-sm text-left transition-colors hover:bg-[var(--arvo-surface-2)] ${e.id === env.id ? 'font-semibold text-[var(--arvo-fg)]' : 'text-[var(--arvo-fg-muted)]'}`}
                                >
                                  <span className="text-lg leading-none">{e.icon}</span>
                                  <span className="flex-1 truncate">{resolveEnvName(e.name, e.type, e.name_key, nameKeys)}</span>
                                  {e.id === env.id && (
                                    <svg className="w-4 h-4 text-[var(--arvo-blue)] shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7"/></svg>
                                  )}
                                </button>
                              ))}
                            </div>
                          </div>
                        )}
                        <button
                          onClick={() => onShareCategory(cat)}
                          className="p-1.5 text-[var(--arvo-fg-soft)] hover:text-[var(--arvo-blue)] transition-colors rounded"
                          title={t.finances.shareCategory}
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5">
                            <path d="M11.25 1.5a2.25 2.25 0 1 1 0 4.5 2.25 2.25 0 0 1 0-4.5ZM4.75 7.25a2.25 2.25 0 1 1 0 4.5 2.25 2.25 0 0 1 0-4.5ZM11.25 11a2.25 2.25 0 1 1 0 4.5 2.25 2.25 0 0 1 0-4.5ZM6.27 8.944l3.46-1.888.013.009-.013-.009-3.46 1.888Zm0-1.888 3.46 1.888-.013-.009.013.009-3.46-1.888Z" />
                          </svg>
                        </button>
                        <button
                          onClick={() => onEditCategory(cat)}
                          className="p-1.5 text-[var(--arvo-fg-soft)] hover:text-[var(--arvo-fg)] transition-colors rounded"
                          title={t.common.edit}
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5">
                            <path d="M13.488 2.513a1.75 1.75 0 0 0-2.475 0L6.75 6.774a2.75 2.75 0 0 0-.596.892l-.848 2.047a.75.75 0 0 0 .98.98l2.047-.848a2.75 2.75 0 0 0 .892-.596l4.261-4.263a1.75 1.75 0 0 0 0-2.474ZM4.75 14a.75.75 0 0 0 0-1.5H3.5a.5.5 0 0 1-.5-.5V4a.5.5 0 0 1 .5-.5h8a.5.5 0 0 1 .5.5v1.25a.75.75 0 0 0 1.5 0V4a2 2 0 0 0-2-2h-8a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h1.25Z" />
                          </svg>
                        </button>
                        <button
                          onClick={() => onDeleteCategory(cat.id)}
                          className="p-1.5 text-[var(--arvo-fg-soft)] hover:text-[var(--arvo-red)] transition-colors rounded"
                          title={t.common.delete}
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5">
                            <path fillRule="evenodd" d="M5 3.25V4H2.75a.75.75 0 0 0 0 1.5h.3l.815 8.15A1.5 1.5 0 0 0 5.357 15h5.285a1.5 1.5 0 0 0 1.493-1.35l.815-8.15h.3a.75.75 0 0 0 0-1.5H11v-.75A2.25 2.25 0 0 0 8.75 1h-1.5A2.25 2.25 0 0 0 5 3.25Zm2.25-.75a.75.75 0 0 0-.75.75V4h3v-.75a.75.75 0 0 0-.75-.75h-1.5ZM6.05 6a.75.75 0 0 1 .787.713l.275 5.5a.75.75 0 0 1-1.498.075l-.275-5.5A.75.75 0 0 1 6.05 6Zm3.9 0a.75.75 0 0 1 .712.787l-.275 5.5a.75.75 0 0 1-1.498-.075l.275-5.5a.75.75 0 0 1 .786-.712Z" clipRule="evenodd" />
                          </svg>
                        </button>
                      </div>
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
          {env.shared_categories.length > 0 && (
            <ul className="divide-y divide-[var(--arvo-border-soft)] border-t border-[var(--arvo-border-soft)]">
              {env.shared_categories.map(cat => {
                const group = sharedGroups.find(g => g.id === cat.group_id)
                const activeMembers = group?.members.filter(m => m.status === 'active') ?? []
                const myMember = activeMembers.find(m => m.user_id === user?.id)
                const myPct = myMember?.share_pct ?? 50
                return (
                  <li key={`shared-${cat.id}`} className="px-5 py-2.5 flex flex-col gap-1">
                    <div className="flex items-center gap-3">
                      <span className="text-base leading-none w-6 shrink-0">{cat.icon}</span>
                      <span className="flex-1 min-w-0 text-sm text-[var(--arvo-fg)] truncate">{cat.name}</span>
                      <div className="flex -space-x-1.5 shrink-0">
                        {activeMembers.slice(0, 3).map(m => (
                          <div key={m.id} style={{ border: '2px solid var(--arvo-surface)', borderRadius: '50%' }}>
                            <Avatar name={m.display.name} email={m.display.email} avatarUrl={m.display.avatar_url} size={18} />
                          </div>
                        ))}
                      </div>
                      {/* Alinhado com a meta das categorias normais: aqui mostra
                          MINHA meta (não o total do grupo, que fica na linha de baixo). */}
                      {editingSharedCatId === cat.id ? (
                        <input
                          autoFocus
                          type="number"
                          value={sharedGoalInput}
                          onChange={e => setSharedGoalInput(e.target.value)}
                          onBlur={() => saveSharedGoal(cat.id, myPct)}
                          onKeyDown={e => { if (e.key === 'Enter') saveSharedGoal(cat.id, myPct); if (e.key === 'Escape') setEditingSharedCatId(null) }}
                          onClick={e => e.stopPropagation()}
                          className="w-20 text-sm text-right text-[var(--arvo-fg)] border border-[var(--arvo-border)] rounded px-1.5 py-0.5 focus:outline-none focus:ring-1 focus:ring-[var(--arvo-fg)]/30 shrink-0"
                        />
                      ) : (
                        <button
                          onClick={() => { setSharedGoalInput(String(cat.my_goal)); setEditingSharedCatId(cat.id) }}
                          className="text-sm font-medium text-[var(--arvo-fg)] underline decoration-dotted decoration-[var(--arvo-fg-soft)] underline-offset-2 shrink-0 hover:decoration-[var(--arvo-fg)]"
                          title={t.finances.clickToEditBudget}
                        >
                          {fmt(cat.my_goal, cat.currency)}
                        </button>
                      )}
                    </div>
                    <div className="flex items-center justify-between gap-2 pl-9">
                      <span className="text-xs text-[var(--arvo-fg-soft)]">{cat.group_name} · {t.finances.groupGoal}: {fmt(cat.total_goal, cat.currency)}</span>
                      <div className="flex items-center gap-0.5 shrink-0">
                        {group && (
                          <button
                            onClick={() => onEditSplit(group)}
                            className="p-1.5 text-[var(--arvo-fg-soft)] hover:text-[var(--arvo-fg)] transition-colors rounded"
                            title={t.finances.editSplit}
                          >
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5">
                              <path d="M4.5 4a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3ZM11.5 9a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3Z" />
                              <path fillRule="evenodd" d="M11.53 3.97a.75.75 0 0 1 0 1.06l-7.5 7.5a.75.75 0 0 1-1.06-1.06l7.5-7.5a.75.75 0 0 1 1.06 0Z" clipRule="evenodd" />
                            </svg>
                          </button>
                        )}
                        <div className="relative">
                          <button
                            onClick={() => setSharedEnvPickerId(cat.id)}
                            className="p-1.5 text-[var(--arvo-fg-soft)] hover:text-[var(--arvo-fg)] transition-colors rounded"
                            title={t.finances.moveCategoryTitle}
                          >
                            <span className="text-sm leading-none">{env.icon}</span>
                          </button>
                          {sharedEnvPickerId === cat.id && (
                            <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 px-4" onClick={() => setSharedEnvPickerId(null)}>
                              <div className="bg-[var(--arvo-surface)] rounded-t-2xl sm:rounded-2xl shadow-xl w-full sm:max-w-sm max-h-[70vh] overflow-y-auto py-2" onClick={e => e.stopPropagation()}>
                                <p className="px-4 py-2 text-xs text-[var(--arvo-fg-soft)] uppercase tracking-wide font-medium">{t.finances.moveCategoryTitle}</p>
                                <button
                                  onClick={() => { onSetSharedEnvelope(cat.id, null); setSharedEnvPickerId(null) }}
                                  className="w-full flex items-center gap-2 px-4 py-3 text-sm text-left transition-colors hover:bg-[var(--arvo-surface-2)] text-[var(--arvo-fg-soft)]"
                                >
                                  <span className="w-4 h-4 rounded-full border-2 border-[var(--arvo-border)] shrink-0" />
                                  {t.finances.noEnvelope}
                                </button>
                                {allEnvelopes.map(e => (
                                  <button
                                    key={e.id}
                                    onClick={() => { onSetSharedEnvelope(cat.id, e.id); setSharedEnvPickerId(null) }}
                                    className={`w-full flex items-center gap-2 px-4 py-3 text-sm text-left transition-colors hover:bg-[var(--arvo-surface-2)] ${e.id === env.id ? 'font-semibold text-[var(--arvo-fg)]' : 'text-[var(--arvo-fg-muted)]'}`}
                                  >
                                    <span className="text-lg leading-none">{e.icon}</span>
                                    <span className="flex-1 truncate">{resolveEnvName(e.name, e.type, e.name_key, nameKeys)}</span>
                                    {e.id === env.id && <svg className="w-4 h-4 text-[var(--arvo-blue)] shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7"/></svg>}
                                  </button>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                        <button
                          onClick={() => onDeleteSharedCategory(cat.id)}
                          className="p-1.5 text-[var(--arvo-fg-soft)] hover:text-[var(--arvo-red)] transition-colors rounded"
                          title={t.common.delete}
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5">
                            <path fillRule="evenodd" d="M5 3.25V4H2.75a.75.75 0 0 0 0 1.5h.3l.815 8.15A1.5 1.5 0 0 0 5.357 15h5.285a1.5 1.5 0 0 0 1.493-1.35l.815-8.15h.3a.75.75 0 0 0 0-1.5H11v-.75A2.25 2.25 0 0 0 8.75 1h-1.5A2.25 2.25 0 0 0 5 3.25Zm2.25-.75a.75.75 0 0 0-.75.75V4h3v-.75a.75.75 0 0 0-.75-.75h-1.5ZM6.05 6a.75.75 0 0 1 .787.713l.275 5.5a.75.75 0 0 1-1.498.075l-.275-5.5A.75.75 0 0 1 6.05 6Zm3.9 0a.75.75 0 0 1 .712.787l-.275 5.5a.75.75 0 0 1-1.498-.075l.275-5.5a.75.75 0 0 1 .786-.712Z" clipRule="evenodd" />
                          </svg>
                        </button>
                      </div>
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
          <div className="px-5 py-2.5">
            <button
              onClick={() => onAddCategory(env.id)}
              className="flex items-center gap-1.5 text-xs text-[var(--arvo-fg)] hover:opacity-70 transition-opacity font-medium"
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

interface SpendingCat { id: number; actual: number }
interface SpendingEnv { envelope_id: number; categories: SpendingCat[] }
interface SpendingMonth { month: string; by_envelope: SpendingEnv[] }
interface SpendingSummary { months: SpendingMonth[] }

// Divisão de contribuição por membro do grupo — reaproveita o mesmo endpoint
// (PATCH /shared/groups/:groupId/members/:memberId) que a antiga página de
// Compartilhado usava, só que embutido no Planejamento pra não exigir navegar
// pra outra tela pra ajustar % ou ativar o modo "baseado no salário".
function SplitModal({ group, userId, onClose, onSaved }: { group: SharedGroup; userId: string; onClose: () => void; onSaved: () => void }) {
  const { t } = useI18n()
  const activeMembers = group.members.filter(m => m.status === 'active')
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
      // O backend força share_mode='manual' pra qualquer membro cuja % é editada
      // diretamente (evita que o próximo recálculo salarial sobrescreva o valor).
      await apiFetch(`/shared/groups/${group.id}/members/${memberId}`, {
        method: 'PATCH', body: JSON.stringify({ share_pct: pct }),
      })
      // Com só 2 pessoas ativas a divisão é sempre complementar — sem isso, editar
      // sua % deixava a soma diferente de 100% até a outra pessoa entrar e ajustar
      // a dela manualmente, o que na prática nunca acontecia. O backend agora
      // permite qualquer membro ativo ajustar a % de outro membro do mesmo grupo.
      const other = activeMembers.find(m => m.id !== memberId)
      if (activeMembers.length === 2 && other) {
        await apiFetch(`/shared/groups/${group.id}/members/${other.id}`, {
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
      await apiFetch(`/shared/groups/${group.id}/members/${memberId}`, {
        method: 'PATCH', body: JSON.stringify({ salary_authorized: !current, share_mode: !current ? 'salary_based' : 'manual' }),
      })
      onSaved()
    } finally {
      setTogglingSalary(null)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4" onClick={onClose}>
      <div className="bg-[var(--arvo-surface)] rounded-2xl shadow-xl w-full max-w-sm p-6" onClick={e => e.stopPropagation()}>
        <h3 className="font-semibold text-[var(--arvo-fg)] mb-1">{t.finances.editSplitTitle.replace('{name}', group.name)}</h3>
        <p className="text-xs text-[var(--arvo-fg-muted)] mb-1">{t.finances.editSplitHint}</p>
        <p className="text-xs mb-4 px-2.5 py-2 rounded-lg" style={{ background: 'var(--arvo-hover-bg)', color: 'var(--arvo-fg-soft)' }}>
          {t.finances.editSplitScopeWarning}
        </p>
        <div className="flex flex-col gap-3">
          {activeMembers.map(m => {
            const isMe = m.user_id === userId
            return (
              <div key={m.id} className="flex items-start gap-3">
                <Avatar name={m.display.name} email={m.display.email} avatarUrl={m.display.avatar_url} size={28} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-[var(--arvo-fg)] truncate">{m.display.name}</p>
                  {m.share_mode === 'salary_based' && (
                    <p className="text-xs text-[var(--arvo-fg-soft)]">{t.finances.splitSalaryBased}</p>
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
                    className="w-16 text-sm text-right border border-[var(--arvo-border)] rounded px-1.5 py-0.5 focus:outline-none focus:ring-1 focus:ring-[var(--arvo-fg)]/30"
                  />
                ) : (
                  <button
                    onClick={() => isMe && (setEditingId(m.id), setPctInput(String(m.share_pct)))}
                    className={`text-sm font-medium shrink-0 ${isMe ? 'text-[var(--arvo-fg)] underline decoration-dotted decoration-[var(--arvo-fg-soft)] underline-offset-2' : 'text-[var(--arvo-fg-soft)]'}`}
                    disabled={!isMe || saving}
                    title={isMe ? t.finances.clickToEditBudget : undefined}
                  >
                    {m.share_pct}%
                  </button>
                )}
              </div>
            )
          })}
        </div>
        <div className="flex gap-2 mt-5">
          <button onClick={onClose} className="flex-1 bg-[var(--arvo-fg)] text-[var(--arvo-pill-active-fg)] text-sm py-2 rounded-xl hover:opacity-80 transition-opacity">
            {t.common.close}
          </button>
        </div>
      </div>
    </div>
  )
}

export default function FinancesBudgetPage() {
  const { t } = useI18n()
  const { user } = useAuth()
  const { hideValues } = useCurrency()
  const fmt = (n: number, currency: string) => hideValues ? '•••' : _fmt(n, currency)
  const navigate = useNavigate()
  const nameKeys: Record<string, string> = {
    envelopeEssential:     t.finances.envelopeEssential,
    envelopeInvestment:    t.finances.envelopeInvestment,
    envelopeSavings:       t.finances.envelopeSavings,
    envelopeFree:          t.finances.envelopeFree,
    envelopeIncome:        t.finances.envelopeIncome,
    envelopeNonEssential:  t.finances.envelopeNonEssential,
    envelopeTorrar:        t.finances.envelopeTorrar,
    categoryTransfer:      t.finances.categoryTransfer,
    categorySalary:        t.finances.categorySalary,
    categoryUncategorized: t.finances.categoryUncategorized,
    categoryGroceries:     t.finances.categoryGroceries,
    categoryRestaurant:    t.finances.categoryRestaurant,
    categoryTransport:     t.finances.categoryTransport,
    categoryHealth:        t.finances.categoryHealth,
    categoryEntertainment: t.finances.categoryEntertainment,
    categoryHousing:       t.finances.categoryHousing,
    categoryStreaming:      t.finances.categoryStreaming,
    categorySubscriptions: t.finances.categorySubscriptions,
    categoryPharmacy:      t.finances.categoryPharmacy,
    categoryClothing:      t.finances.categoryClothing,
    categoryTravel:        t.finances.categoryTravel,
    categoryCoffee:        t.finances.categoryCoffee,
    categoryUtilities:     t.finances.categoryUtilities,
    categoryEducation:     t.finances.categoryEducation,
    categoryPersonalCare:  t.finances.categoryPersonalCare,
    categoryElectronics:   t.finances.categoryElectronics,
    categoryAirbnb:        t.finances.categoryAirbnb,
    categoryOther:         t.finances.categoryOther,
    categoryPhone:         t.finances.categoryPhone,
    categoryInvestment:    t.finances.categoryInvestment,
  }

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
  const [catEnvelopeId, setCatEnvelopeId] = useState<number>(0)
  const [catActuals, setCatActuals]       = useState<Map<number, number>>(new Map())
  const [catHistoricals, setCatHistoricals] = useState<Map<number, number>>(new Map())
  const [sharedGroups, setSharedGroups] = useState<SharedGroup[]>([])
  const [shareModal, setShareModal]   = useState<Category | null>(null)
  const [sharingGroupId, setSharingGroupId] = useState<number | null>(null)
  const [sharingSaving, setSharingSaving]   = useState(false)
  const [openEnvPicker, setOpenEnvPicker] = useState<number | null>(null)
  const [editingUnassignedSharedId, setEditingUnassignedSharedId] = useState<number | null>(null)
  const [unassignedGoalInput, setUnassignedGoalInput] = useState('')
  const [showRefInfo, setShowRefInfo] = useState(false)
  // Guarda só o ID, não o objeto — assim, depois de salvar % ou alternar o modo
  // salário (que dispara load(true) e atualiza sharedGroups), o modal reflete o
  // dado fresco na hora em vez de continuar mostrando o valor antigo que tinha
  // quando foi aberto.
  const [splitGroupId, setSplitGroupId] = useState<number | null>(null)
  const splitGroup = sharedGroups.find(g => g.id === splitGroupId) ?? null

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true)
    try {
      const today = new Date()
      const _cycleDay: number = (user?.user_metadata?.month_cycle_day as number) || 1
      const currentMonth = (() => {
        if (_cycleDay > 1 && today.getDate() >= _cycleDay) {
          const next = new Date(today.getFullYear(), today.getMonth() + 1, 1)
          return `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}`
        }
        return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`
      })()
      const [d, spending, groups] = await Promise.all([
        apiFetch<BudgetData>('/finances/budget'),
        apiFetch<SpendingSummary>('/finances/spending-summary?months=4'),
        apiFetch<SharedGroup[]>('/shared/groups').catch(() => [] as SharedGroup[]),
      ])
      setData(d)
      setIncomeVal(String(d.income.monthly_net))
      setIncomeCur(d.income.currency)
      setSharedGroups(groups)

      // Current month actuals (for total-consumed row at bottom)
      const monthData = spending.months.find(m => m.month === currentMonth)
      const actMap = new Map<number, number>()
      if (monthData) {
        for (const env of monthData.by_envelope) {
          for (const cat of env.categories) actMap.set(cat.id, cat.actual)
        }
      }
      setCatActuals(actMap)

      // Historical averages: last 3 complete months (excluding current). The API only lists a
      // category under a month's by_envelope.categories when it had actual spend > 0 that month
      // (see finances.ts spending-summary), so dividing by "months the category appeared in"
      // (instead of the fixed window size) silently degenerates into "last active month" for any
      // category that isn't spent on every single month — dividing by pastMonths.length instead
      // treats months with no spend as 0, giving a true 3-month average.
      const pastMonths = spending.months.filter(m => m.month !== currentMonth).slice(0, 3)
      const histMap = new Map<number, number>()
      if (pastMonths.length > 0) {
        const catSums = new Map<number, number>()
        for (const month of pastMonths) {
          for (const env of month.by_envelope) {
            for (const cat of env.categories) {
              if (cat.actual > 0) {
                catSums.set(cat.id, (catSums.get(cat.id) ?? 0) + cat.actual)
              }
            }
          }
        }
        for (const [id, sum] of catSums) {
          histMap.set(id, Math.round(sum / pastMonths.length))
        }
      }
      setCatHistoricals(histMap)
    } finally {
      if (!silent) setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  async function saveIncome() {
    if (!data) return
    setSaving(true)
    try {
      await apiFetch('/finances/income', { method: 'PATCH', body: JSON.stringify({ monthly_net: parseFloat(incomeVal), currency: incomeCur }) })
      await load(true)
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
    setCatEnvelopeId(envId)
    setModal({ mode: 'add', envelopeId: envId })
  }

  function openEditCategory(cat: Category) {
    setCatName(resolveKey(cat.name, cat.name_key, nameKeys))
    setCatIcon(cat.icon)
    setCatBudget(cat.budget_monthly != null ? String(cat.budget_monthly) : '')
    setCatEnvelopeId(cat.envelope_id ?? 0)
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
        envelope_id: catEnvelopeId || modal.envelopeId,
      }
      if (modal.mode === 'add') {
        await apiFetch('/finances/categories', { method: 'POST', body: JSON.stringify(payload) })
      } else {
        await apiFetch(`/finances/categories/${modal.category!.id}`, { method: 'PATCH', body: JSON.stringify(payload) })
      }
      await load(true)
      setModal(null)
    } finally {
      setSaving(false)
    }
  }

  async function deleteCategory(id: number) {
    if (!confirm(t.finances.confirmDeleteCategory)) return
    await apiFetch(`/finances/categories/${id}`, { method: 'DELETE' })
    await load(true)
  }

  async function saveDescription(envId: number, description: string) {
    await apiFetch(`/finances/envelopes/${envId}`, { method: 'PATCH', body: JSON.stringify({ description }) })
    await load(true)
  }

  async function saveCategoryBudget(catId: number, value: number | null) {
    await apiFetch(`/finances/categories/${catId}`, { method: 'PATCH', body: JSON.stringify({ budget_monthly: value }) })
    await load(true)
  }

  async function moveCategory(catId: number, envelopeId: number) {
    await apiFetch(`/finances/categories/${catId}`, { method: 'PATCH', body: JSON.stringify({ envelope_id: envelopeId }) })
    await load(true)
  }

  function openShareModal(cat: Category) {
    setSharingGroupId(sharedGroups.length > 0 ? sharedGroups[0].id : null)
    setShareModal(cat)
  }

  async function setSharedEnvelope(catId: number, envId: number | null) {
    await apiFetch(`/shared/categories/${catId}/envelope`, {
      method: 'PATCH',
      body: JSON.stringify({ envelope_id: envId }),
    })
    await load(true)
  }

  async function saveSharedGoal(catId: number, totalGoal: number) {
    await apiFetch(`/shared/categories/${catId}`, {
      method: 'PATCH',
      body: JSON.stringify({ total_goal: totalGoal }),
    })
    await load(true)
  }

  async function deleteSharedCategory(catId: number) {
    if (!confirm(t.finances.confirmDeleteCategory)) return
    await apiFetch(`/shared/categories/${catId}`, { method: 'DELETE' })
    await load(true)
  }

  async function confirmShare() {
    if (!shareModal || !sharingGroupId) return
    setSharingSaving(true)
    try {
      await apiFetch('/shared/categories', {
        method: 'POST',
        body: JSON.stringify({
          group_id: sharingGroupId,
          name: shareModal.name,
          icon: shareModal.icon,
          color: shareModal.color ?? '#1B4FD8',
          total_goal: shareModal.budget_monthly ?? 0,
          currency: data?.income.currency ?? 'EUR',
        }),
      })
      setShareModal(null)
      await load(true)
    } finally {
      setSharingSaving(false)
    }
  }

  if (loading) return (
    <div className="bg-[var(--arvo-surface)] rounded-2xl border border-[var(--arvo-border)] shadow-sm p-12 text-center text-[var(--arvo-fg-soft)] text-sm">
      {t.common.loading}
    </div>
  )
  if (!data) return null

  const incomeEnvelopes  = data.envelopes.filter(e => e.type === 'income')
  const expenseEnvelopes = data.envelopes.filter(e => e.type !== 'income')

  // Envelope budget is the sum of its categories (bottom-up) plus any shared-category goals
  // assigned to it — matching the Overview page's total so the two pages don't disagree.
  const envBudgetTotal = (e: Envelope) => e.categories.reduce((cs, c) => cs + (c.budget_monthly ?? 0), 0) + e.shared_categories.reduce((cs, c) => cs + c.my_goal, 0)
  const totalCatBudget = expenseEnvelopes.reduce((s, e) => s + envBudgetTotal(e), 0)
  const totalBudget    = totalCatBudget
  const unallocated    = data.income.monthly_net - totalCatBudget

  return (
    <div className="space-y-5">
      {/* Page header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 style={{ fontFamily: "var(--arvo-font-body)", fontSize: 18, letterSpacing: '0.06em', color: 'var(--arvo-fg)' }}>{t.finances.budgetTitle}</h1>
          <p className="text-sm mt-0.5" style={{ color: 'var(--arvo-fg-muted)' }}>{t.finances.budgetSubtitle}</p>
        </div>
      </div>

      {/* Unified summary card — renda / orçado / a alocar, replaces the separate
          bottom total row and unallocated banner so it's all in one glance. */}
      <div className="bg-[var(--arvo-surface)] rounded-2xl border border-[var(--arvo-border)] shadow-sm p-5">
        <div className="grid grid-cols-3 gap-4">
          <div>
            <p className="text-xs text-[var(--arvo-fg-soft)] uppercase tracking-wide font-medium mb-1">{t.finances.incomeLabel}</p>
            <p className="text-xl font-semibold text-[var(--arvo-fg)]">{fmt(data.income.monthly_net, data.income.currency)}</p>
          </div>
          <div>
            <p className="text-xs text-[var(--arvo-fg-soft)] uppercase tracking-wide font-medium mb-1">{t.finances.totalBudgeted}</p>
            <p className="text-xl font-semibold text-[var(--arvo-fg)]">{fmt(totalBudget, data.income.currency)}</p>
          </div>
          <div>
            {Math.round(unallocated) === 0 ? (
              <>
                <p className="text-xs text-[var(--arvo-fg-soft)] uppercase tracking-wide font-medium mb-1">{t.finances.unallocated}</p>
                <span
                  className="inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-full"
                  style={{ background: 'rgba(31,138,91,0.10)', color: 'var(--arvo-green)', border: '1px solid rgba(31,138,91,0.25)' }}
                >
                  <Icon name="check" size={11} />
                  {t.finances.budgetFullyAllocated}
                </span>
              </>
            ) : (
              <>
                <p className="text-xs text-[var(--arvo-fg-soft)] uppercase tracking-wide font-medium mb-1">
                  {unallocated < 0 ? t.finances.overspent : t.finances.unallocated}
                </p>
                <p className="text-xl font-semibold" style={{ color: unallocated < 0 ? 'var(--arvo-red)' : 'var(--arvo-fg)' }}>
                  {unallocated < 0 ? '−' : ''}{fmt(Math.abs(unallocated), data.income.currency)}
                </p>
              </>
            )}
          </div>
        </div>
        {data.income.monthly_net > 0 && (
          <>
            <div className="h-1.5 rounded-full bg-[var(--arvo-track-bg)] overflow-hidden mt-4 flex">
              {expenseEnvelopes.map(env => {
                const envTotal = envBudgetTotal(env)
                const pct = Math.max(0, Math.min(100, (envTotal / data.income.monthly_net) * 100))
                return pct > 0 ? <div key={env.id} style={{ width: `${pct}%`, backgroundColor: ENV_TYPE_COLOR[env.type] ?? env.color }} /> : null
              })}
            </div>
            {/* Legend — the bar's colored segments were unreadable without a key, especially
                since envelope colors here are the muted brand tokens, not the raw category color. */}
            <div className="flex flex-wrap gap-x-3 gap-y-1 mt-2">
              {expenseEnvelopes.map(env => {
                const envTotal = envBudgetTotal(env)
                if (envTotal <= 0) return null
                return (
                  <span key={env.id} className="inline-flex items-center gap-1.5 text-xs text-[var(--arvo-fg-soft)]">
                    <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: ENV_TYPE_COLOR[env.type] ?? env.color }} />
                    {resolveEnvName(env.name, env.type, env.name_key, nameKeys)}
                  </span>
                )
              })}
            </div>
          </>
        )}
      </div>

      {/* Income card — unified with income envelope categories */}
      {incomeEnvelopes.length > 0 ? (
        <div className="space-y-3">
          <p className="text-xs text-[var(--arvo-fg-soft)] uppercase tracking-wide font-medium px-1">{t.finances.incomeLabel}</p>
          {incomeEnvelopes.map(env => {
            const envTotal = envBudgetTotal(env)
            return (
              <div key={env.id} className="bg-[var(--arvo-surface)] rounded-2xl border border-[var(--arvo-border)] shadow-sm overflow-hidden">
                {/* Header: envelope name + total */}
                <button
                  onClick={() => toggleEnvelope(env.id)}
                  className="w-full px-5 py-4 flex items-center gap-3 hover:bg-[var(--arvo-surface-2)] transition-colors text-left"
                >
                  <span className="text-2xl leading-none w-8 shrink-0">{env.icon}</span>
                  <div className="flex-1 min-w-0">
                    <span className="font-semibold text-[var(--arvo-fg)] text-sm">{resolveEnvName(env.name, env.type, env.name_key, nameKeys)}</span>
                  </div>
                  <div className="text-right shrink-0 ml-3">
                    <span className="text-sm font-semibold text-[var(--arvo-green)]">{fmt(envTotal, data.income.currency)}</span>
                    <span className="text-xs text-[var(--arvo-fg-soft)] ml-1">{t.finances.perMonth}</span>
                  </div>
                  <svg
                    className={`w-4 h-4 text-[var(--arvo-fg-soft)] shrink-0 transition-transform ${expandedIds.has(env.id) ? 'rotate-180' : ''}`}
                    fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                  </svg>
                </button>

                {/* Categories with budget amounts */}
                {expandedIds.has(env.id) && (
                  <div className="border-t border-[var(--arvo-border-soft)]">
                    {env.categories.length === 0 ? (
                      <p className="px-5 py-3 text-xs text-[var(--arvo-fg-soft)]">{t.finances.noCategories}</p>
                    ) : (
                      <ul className="divide-y divide-[var(--arvo-border-soft)]">
                        {env.categories.map(cat => (
                          <li key={cat.id} className="px-5 py-2.5 flex items-center gap-3 group">
                            <span className="text-base leading-none w-6 shrink-0">{cat.icon}</span>
                            <span className="flex-1 text-sm text-[var(--arvo-fg)]">{resolveKey(cat.name, cat.name_key, nameKeys)}</span>
                            {cat.budget_monthly != null && (
                              <span className="text-sm font-medium text-[var(--arvo-fg-muted)]">{fmt(cat.budget_monthly, data.income.currency)}</span>
                            )}
                            <div className="flex items-center gap-1.5 [@media(hover:none)]:opacity-100 opacity-0 group-hover:opacity-100 transition-opacity">
                              <button onClick={() => openEditCategory(cat)} title={t.common.edit} className="p-2 text-[var(--arvo-fg-soft)] hover:text-[var(--arvo-fg)] transition-colors rounded-lg hover:bg-[var(--arvo-track-bg)]">
                                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-4 h-4">
                                  <path d="M13.488 2.513a1.75 1.75 0 0 0-2.475 0L6.75 6.774a2.75 2.75 0 0 0-.596.892l-.848 2.047a.75.75 0 0 0 .98.98l2.047-.848a2.75 2.75 0 0 0 .892-.596l4.261-4.263a1.75 1.75 0 0 0 0-2.474ZM4.75 14a.75.75 0 0 0 0-1.5H3.5a.5.5 0 0 1-.5-.5V4a.5.5 0 0 1 .5-.5h8a.5.5 0 0 1 .5.5v1.25a.75.75 0 0 0 1.5 0V4a2 2 0 0 0-2-2h-8a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h1.25Z" />
                                </svg>
                              </button>
                              <button onClick={() => deleteCategory(cat.id)} title={t.common.delete} className="p-2 text-[var(--arvo-fg-soft)] hover:text-[var(--arvo-red)] transition-colors rounded-lg hover:bg-[var(--arvo-red)]/10">
                                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-4 h-4">
                                  <path fillRule="evenodd" d="M5 3.25V4H2.75a.75.75 0 0 0 0 1.5h.3l.815 8.15A1.5 1.5 0 0 0 5.357 15h5.285a1.5 1.5 0 0 0 1.493-1.35l.815-8.15h.3a.75.75 0 0 0 0-1.5H11v-.75A2.25 2.25 0 0 0 8.75 1h-1.5A2.25 2.25 0 0 0 5 3.25Zm2.25-.75a.75.75 0 0 0-.75.75V4h3v-.75a.75.75 0 0 0-.75-.75h-1.5ZM6.05 6a.75.75 0 0 1 .787.713l.275 5.5a.75.75 0 0 1-1.498.075l-.275-5.5A.75.75 0 0 1 6.05 6Zm3.9 0a.75.75 0 0 1 .712.787l-.275 5.5a.75.75 0 0 1-1.498-.075l.275-5.5a.75.75 0 0 1 .786-.712Z" clipRule="evenodd" />
                                </svg>
                              </button>
                            </div>
                          </li>
                        ))}
                      </ul>
                    )}
                    <div className="px-5 py-2.5">
                      <button onClick={() => openAddCategory(env.id)} className="flex items-center gap-1.5 text-xs text-[var(--arvo-fg)] hover:opacity-70 transition-opacity font-medium">
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
        <div className="bg-[var(--arvo-surface)] rounded-2xl border border-[var(--arvo-border)] shadow-sm p-5">
          <div className="flex items-center justify-between mb-1">
            <span className="text-sm text-[var(--arvo-fg-muted)] uppercase tracking-wide font-semibold">{t.finances.income}</span>
            {!incomeEdit && (
              <button onClick={() => setIncomeEdit(true)} className="text-xs text-[var(--arvo-fg)] hover:opacity-70 transition-opacity">{t.common.edit}</button>
            )}
          </div>
          {incomeEdit ? (
            <div className="flex items-center gap-2 mt-2">
              <select value={incomeCur} onChange={e => setIncomeCur(e.target.value)} className="border border-[var(--arvo-border)] rounded-lg px-2 py-1.5 text-sm">
                {['EUR','BRL','USD'].map(c => <option key={c}>{c}</option>)}
              </select>
              <input
                type="number"
                value={incomeVal}
                onChange={e => setIncomeVal(e.target.value)}
                className="flex-1 border border-[var(--arvo-border)] rounded-lg px-3 py-1.5 text-sm"
                placeholder="3500"
              />
              <button onClick={saveIncome} disabled={saving} className="px-3 py-1.5 bg-[var(--arvo-fg)] text-[var(--arvo-pill-active-fg)] text-xs rounded-lg hover:opacity-80 transition-opacity disabled:opacity-50">
                {saving ? '…' : t.common.save}
              </button>
              <button onClick={() => setIncomeEdit(false)} className="px-3 py-1.5 text-[var(--arvo-fg-muted)] text-xs hover:text-[var(--arvo-fg)] transition-colors">{t.common.cancel}</button>
            </div>
          ) : (
            <p className="text-2xl font-bold text-[var(--arvo-fg)] mt-1">
              {fmt(data.income.monthly_net, data.income.currency)}
              <span className="text-sm font-normal text-[var(--arvo-fg-soft)] ml-1">{t.finances.perMonth}</span>
            </p>
          )}
        </div>
      )}

      {/* Expenses section header — the 50/30/10/10 reference is opt-in via the info icon,
          not shown ambient next to each envelope's real numbers (that reads as a judgment
          even without computing any delta, especially for envelopes far from the reference). */}
      {expenseEnvelopes.length > 0 && (
        <div className="flex items-center gap-1.5 px-1">
          <p className="text-sm text-[var(--arvo-fg-muted)] uppercase tracking-wide font-semibold">{t.finances.expenses}</p>
          <button
            onClick={() => setShowRefInfo(true)}
            className="w-4 h-4 rounded-full border border-[var(--arvo-fg-soft)] text-[var(--arvo-fg-soft)] text-[10px] leading-none flex items-center justify-center hover:border-[var(--arvo-fg)] hover:text-[var(--arvo-fg)] transition-colors"
            title={t.finances.referenceSplitTitle}
          >?</button>
        </div>
      )}

      {/* Reference-split info modal — a fuller, structured overlay instead of a tiny
          popover, built entirely from existing translated envelope name/description keys
          so it stays translatable across pt/en/fr. */}
      {showRefInfo && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4" onClick={() => setShowRefInfo(false)}>
          <div className="bg-[var(--arvo-surface)] rounded-2xl shadow-xl w-full max-w-md max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="p-6 pb-4">
              <h3 className="font-semibold text-[var(--arvo-fg)] text-base mb-1.5">{t.finances.referenceSplitTitle}</h3>
              <p className="text-sm text-[var(--arvo-fg-muted)] leading-relaxed">{t.finances.referenceSplitBody}</p>
            </div>
            <div className="px-6 pb-2 space-y-1">
              {[
                { pct: 50, icon: '🏠', name: t.finances.envelopeEssential,  desc: t.finances.descEssential,  color: 'var(--arvo-blue)' },
                { pct: 30, icon: '📈', name: t.finances.envelopeInvestment, desc: t.finances.descInvestment, color: 'var(--arvo-green)' },
                { pct: 10, icon: '🏦', name: t.finances.envelopeSavings,    desc: t.finances.descSavings,    color: 'var(--arvo-ocre)' },
                { pct: 10, icon: '✨', name: t.finances.envelopeFree,       desc: t.finances.descFree,       color: 'var(--arvo-gold)' },
              ].map(row => (
                <div key={row.name} className="flex items-start gap-3 py-3 border-t border-[var(--arvo-border-soft)]">
                  <div className="w-9 h-9 rounded-full flex items-center justify-center text-base shrink-0" style={{ background: 'var(--arvo-surface-2)' }}>{row.icon}</div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2 mb-0.5">
                      <span className="text-sm font-semibold text-[var(--arvo-fg)]">{row.name}</span>
                      <span className="text-sm font-semibold shrink-0" style={{ color: row.color }}>{row.pct}%</span>
                    </div>
                    <p className="text-xs text-[var(--arvo-fg-soft)] leading-relaxed">{row.desc}</p>
                  </div>
                </div>
              ))}
            </div>
            <div className="px-6 pt-3 pb-6">
              <p className="text-xs text-[var(--arvo-fg-soft)] italic leading-relaxed">{t.finances.referenceSplitFooter}</p>
              <button
                onClick={() => setShowRefInfo(false)}
                className="w-full mt-4 bg-[var(--arvo-fg)] text-[var(--arvo-pill-active-fg)] text-sm py-2 rounded-xl hover:opacity-80 transition-opacity"
              >
                {t.common.close}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Expense envelopes */}
      <div className="space-y-3">
        {expenseEnvelopes.map(env => (
          <EnvelopeBar
            key={env.id}
            env={env}
            allEnvelopes={expenseEnvelopes}
            expanded={expandedIds.has(env.id)}
            onToggle={() => toggleEnvelope(env.id)}
            onEditCategory={openEditCategory}
            onDeleteCategory={deleteCategory}
            onAddCategory={openAddCategory}
            onSaveDescription={saveDescription}
            onShareCategory={openShareModal}
            onSaveCategoryBudget={saveCategoryBudget}
            onMoveCategory={moveCategory}
            actuals={catActuals}
            historicals={catHistoricals}
            currency={data.income.currency}
            incomeMonthly={data.income.monthly_net}
            sharedGroups={sharedGroups}
            onSetSharedEnvelope={setSharedEnvelope}
            onSaveSharedGoal={saveSharedGoal}
            onDeleteSharedCategory={deleteSharedCategory}
            onEditSplit={group => setSplitGroupId(group.id)}
          />
        ))}
      </div>

      {splitGroup && (
        <SplitModal
          group={splitGroup}
          userId={user?.id ?? ''}
          onClose={() => setSplitGroupId(null)}
          onSaved={() => load(true)}
        />
      )}

      {/* Shared categories section — once a shared category is assigned to an envelope
          (local_envelope_id), it now renders nested inside that envelope instead of here,
          so its goal is counted once. This section is only the "inbox" for categories not
          yet assigned anywhere, still grouped by SharedGroup (e.g. "Família 💕", a group of
          people, not itself a category — the avatar stack makes that distinction clear). */}
      {sharedGroups.some(g => g.categories.some(c => c.local_envelope_id == null)) && (
        <div className="space-y-3">
          <div className="flex items-center justify-between px-1">
            <div>
              <p className="text-xs text-[var(--arvo-fg-soft)] uppercase tracking-wide font-medium">{t.finances.sharedSection}</p>
            </div>
            <button
              onClick={() => navigate('/finances/shared')}
              className="text-xs text-[var(--arvo-fg)] hover:opacity-70 transition-opacity font-medium"
            >
              {t.finances.viewShared} →
            </button>
          </div>
          {sharedGroups.filter(g => g.categories.some(c => c.local_envelope_id == null)).map(group => {
            const myMember = group.members.find(m => m.user_id === user?.id)
            const myPct = myMember?.share_pct ?? 50
            const activeMembers = group.members.filter(m => m.status === 'active')
            return (
              <div key={group.id} className="bg-[var(--arvo-surface)] rounded-2xl border border-[var(--arvo-border)] shadow-sm overflow-hidden">
                <div className="px-5 py-3 border-b border-[var(--arvo-border-soft)] flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className="flex -space-x-2 shrink-0">
                      {activeMembers.slice(0, 4).map(m => (
                        <div key={m.id} style={{ border: '2px solid var(--arvo-surface)', borderRadius: '50%' }}>
                          <Avatar name={m.display.name} email={m.display.email} avatarUrl={m.display.avatar_url} size={24} />
                        </div>
                      ))}
                    </div>
                    <div>
                      <span className="text-sm font-semibold text-[var(--arvo-fg)] block leading-tight">{group.name}</span>
                      <span className="text-[10px] text-[var(--arvo-fg-soft)] uppercase tracking-wide">{t.finances.sharedGroupLabel}</span>
                    </div>
                  </div>
                  <span className="text-xs bg-[var(--arvo-surface-2)] text-[var(--arvo-fg-muted)] px-1.5 py-0.5 rounded-full font-medium flex items-center gap-1 shrink-0">
                    <Icon name="users" size={11} />
                    {activeMembers.length}
                  </span>
                </div>
                <ul className="divide-y divide-[var(--arvo-border-soft)]">
                  {group.categories.filter(c => c.local_envelope_id == null).map(cat => {
                    const myGoal = Math.round(cat.total_goal * myPct / 100)
                    return (
                      <li key={cat.id} className="px-5 py-3 flex items-start gap-3">
                        <span className="text-base leading-none w-6 shrink-0 mt-0.5">{cat.icon}</span>
                        <div className="flex-1 min-w-0 space-y-1.5">
                          <span className="text-sm text-[var(--arvo-fg)] truncate block">{cat.name}</span>
                          <span className="text-xs text-[var(--arvo-fg-soft)]">{myPct}% · {t.finances.myGoal}: {fmt(myGoal, cat.currency)}</span>
                          <div>
                            <button
                              onClick={() => setOpenEnvPicker(cat.id)}
                              className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg border border-[var(--arvo-border)] hover:border-[var(--arvo-border)] bg-[var(--arvo-surface)] text-[var(--arvo-fg-muted)] transition-colors"
                            >
                              {cat.local_envelope_id
                                ? (() => { const e = expenseEnvelopes.find(e => e.id === cat.local_envelope_id); return e ? <>{e.icon} {resolveEnvName(e.name, e.type, e.name_key, nameKeys)}</> : t.finances.noEnvelope })()
                                : <span className="text-[var(--arvo-fg-soft)]">{t.finances.noEnvelope}</span>
                              }
                              <svg className={`w-3 h-3 text-[var(--arvo-fg-soft)] transition-transform ${openEnvPicker === cat.id ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7"/></svg>
                            </button>
                            {openEnvPicker === cat.id && (
                              <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 px-4" onClick={() => setOpenEnvPicker(null)}>
                                <div className="bg-[var(--arvo-surface)] rounded-t-2xl sm:rounded-2xl shadow-xl w-full sm:max-w-sm max-h-[70vh] overflow-y-auto py-2" onClick={e => e.stopPropagation()}>
                                  <p className="px-4 py-2 text-xs text-[var(--arvo-fg-soft)] uppercase tracking-wide font-medium">{t.finances.moveCategoryTitle}</p>
                                  <button
                                    onClick={() => { setSharedEnvelope(cat.id, null); setOpenEnvPicker(null) }}
                                    className={`w-full flex items-center gap-2 px-4 py-3 text-sm text-left transition-colors hover:bg-[var(--arvo-surface-2)] ${!cat.local_envelope_id ? 'font-semibold text-[var(--arvo-fg)]' : 'text-[var(--arvo-fg-soft)]'}`}
                                  >
                                    <span className="w-4 h-4 rounded-full border-2 border-[var(--arvo-border)] shrink-0" />
                                    {t.finances.noEnvelope}
                                  </button>
                                  {expenseEnvelopes.map(env => (
                                    <button
                                      key={env.id}
                                      onClick={() => { setSharedEnvelope(cat.id, env.id); setOpenEnvPicker(null) }}
                                      className={`w-full flex items-center gap-2 px-4 py-3 text-sm text-left transition-colors hover:bg-[var(--arvo-surface-2)] ${cat.local_envelope_id === env.id ? 'font-semibold text-[var(--arvo-fg)]' : 'text-[var(--arvo-fg-muted)]'}`}
                                    >
                                      <span className="text-lg leading-none">{env.icon}</span>
                                      <span className="flex-1 truncate">{resolveEnvName(env.name, env.type, env.name_key, nameKeys)}</span>
                                      {cat.local_envelope_id === env.id && <svg className="w-4 h-4 text-[var(--arvo-blue)] shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7"/></svg>}
                                    </button>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          {editingUnassignedSharedId === cat.id ? (
                            <input
                              autoFocus
                              type="number"
                              value={unassignedGoalInput}
                              onChange={e => setUnassignedGoalInput(e.target.value)}
                              onBlur={() => { const v = parseFloat(unassignedGoalInput); setEditingUnassignedSharedId(null); if (!isNaN(v) && v >= 0) saveSharedGoal(cat.id, v) }}
                              onKeyDown={e => {
                                if (e.key === 'Enter') { const v = parseFloat(unassignedGoalInput); setEditingUnassignedSharedId(null); if (!isNaN(v) && v >= 0) saveSharedGoal(cat.id, v) }
                                if (e.key === 'Escape') setEditingUnassignedSharedId(null)
                              }}
                              className="w-20 text-xs text-right text-[var(--arvo-fg)] border border-[var(--arvo-border)] rounded px-1.5 py-0.5 focus:outline-none focus:ring-1 focus:ring-[var(--arvo-fg)]/30"
                            />
                          ) : (
                            <button
                              onClick={() => { setUnassignedGoalInput(String(cat.total_goal)); setEditingUnassignedSharedId(cat.id) }}
                              className="text-xs text-[var(--arvo-fg-soft)] underline decoration-dotted underline-offset-2 hover:decoration-[var(--arvo-fg)]"
                              title={t.finances.clickToEditBudget}
                            >
                              / {fmt(cat.total_goal, cat.currency)}
                            </button>
                          )}
                          <button
                            onClick={() => deleteSharedCategory(cat.id)}
                            className="p-1 text-[var(--arvo-fg-soft)] hover:text-[var(--arvo-red)] transition-colors rounded"
                            title={t.common.delete}
                          >
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5">
                              <path fillRule="evenodd" d="M5 3.25V4H2.75a.75.75 0 0 0 0 1.5h.3l.815 8.15A1.5 1.5 0 0 0 5.357 15h5.285a1.5 1.5 0 0 0 1.493-1.35l.815-8.15h.3a.75.75 0 0 0 0-1.5H11v-.75A2.25 2.25 0 0 0 8.75 1h-1.5A2.25 2.25 0 0 0 5 3.25Zm2.25-.75a.75.75 0 0 0-.75.75V4h3v-.75a.75.75 0 0 0-.75-.75h-1.5ZM6.05 6a.75.75 0 0 1 .787.713l.275 5.5a.75.75 0 0 1-1.498.075l-.275-5.5A.75.75 0 0 1 6.05 6Zm3.9 0a.75.75 0 0 1 .712.787l-.275 5.5a.75.75 0 0 1-1.498-.075l.275-5.5a.75.75 0 0 1 .786-.712Z" clipRule="evenodd" />
                            </svg>
                          </button>
                        </div>
                      </li>
                    )
                  })}
                </ul>
              </div>
            )
          })}
        </div>
      )}

      {/* Category modal */}
      {modal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4" onClick={() => setModal(null)}>
          <div className="bg-[var(--arvo-surface)] rounded-2xl shadow-xl w-full max-w-sm p-6" onClick={e => e.stopPropagation()}>
            <h3 className="font-semibold text-[var(--arvo-fg)] mb-4">
              {modal.mode === 'add' ? t.finances.newCategory : t.finances.editCategory}
            </h3>
            <div className="space-y-3">
              {modal.mode === 'edit' && data && (
                <div>
                  <label className="block text-xs text-[var(--arvo-fg-muted)] mb-1">{t.finances.budgetEnvelopeLabel}</label>
                  <select
                    value={catEnvelopeId}
                    onChange={e => setCatEnvelopeId(Number(e.target.value))}
                    className="w-full border border-[var(--arvo-border)] rounded-lg px-3 py-2 text-sm text-[var(--arvo-fg)] focus:outline-none focus:ring-2 focus:ring-[var(--arvo-fg)]/20"
                  >
                    {data.envelopes.map(env => (
                      <option key={env.id} value={env.id}>{env.icon} {resolveEnvName(env.name, env.type, env.name_key, nameKeys)}</option>
                    ))}
                  </select>
                </div>
              )}
              <div>
                <label className="block text-xs text-[var(--arvo-fg-muted)] mb-1">{t.finances.categoryName}</label>
                <input
                  autoFocus
                  value={catName}
                  onChange={e => setCatName(e.target.value)}
                  className="w-full border border-[var(--arvo-border)] rounded-lg px-3 py-2 text-sm text-[var(--arvo-fg)] focus:outline-none focus:ring-2 focus:ring-[var(--arvo-fg)]/20"
                  placeholder={t.finances.categoryNamePlaceholder}
                />
              </div>
              <div>
                <label className="block text-xs text-[var(--arvo-fg-muted)] mb-1">{t.finances.categoryIcon}</label>
                <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto">
                  {EMOJI_OPTIONS.map(e => (
                    <button
                      key={e}
                      onClick={() => setCatIcon(e)}
                      className={`text-xl p-1 rounded-lg transition-colors ${catIcon === e ? 'bg-[var(--arvo-fg)]/10 ring-1 ring-[var(--arvo-fg)]/30' : 'hover:bg-[var(--arvo-track-bg)]'}`}
                    >{e}</button>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-xs text-[var(--arvo-fg-muted)] mb-1">{t.finances.monthlyBudget}</label>
                <div className="flex items-center gap-2">
                  <span className="text-sm text-[var(--arvo-fg-muted)]">{data.income.currency}</span>
                  <input
                    type="number"
                    value={catBudget}
                    onChange={e => setCatBudget(e.target.value)}
                    className="flex-1 border border-[var(--arvo-border)] rounded-lg px-3 py-2 text-sm text-[var(--arvo-fg)] focus:outline-none focus:ring-2 focus:ring-[var(--arvo-fg)]/20"
                    placeholder="0"
                  />
                </div>
              </div>
            </div>
            <div className="flex gap-2 mt-5">
              <button
                onClick={saveCategory}
                disabled={saving || !catName.trim()}
                className="flex-1 bg-[var(--arvo-fg)] text-[var(--arvo-pill-active-fg)] text-sm py-2 rounded-xl hover:opacity-80 transition-opacity disabled:opacity-40"
              >
                {saving ? '…' : t.common.save}
              </button>
              <button onClick={() => setModal(null)} className="px-4 text-sm text-[var(--arvo-fg-muted)] hover:text-[var(--arvo-fg)] transition-colors">{t.common.cancel}</button>
            </div>
          </div>
        </div>
      )}

      {/* Share-to-group modal */}
      {shareModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4" onClick={() => setShareModal(null)}>
          <div className="bg-[var(--arvo-surface)] rounded-2xl shadow-xl w-full max-w-sm p-6" onClick={e => e.stopPropagation()}>
            <h3 className="font-semibold text-[var(--arvo-fg)] mb-1">{t.finances.shareCategory}</h3>
            <p className="text-xs text-[var(--arvo-fg-muted)] mb-4">{t.finances.pickGroupHint}</p>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xl">{shareModal.icon}</span>
              <span className="text-sm font-medium text-[var(--arvo-fg)]">{shareModal.name}</span>
            </div>
            {sharedGroups.length === 0 ? (
              <p className="text-sm text-[var(--arvo-fg-muted)] mt-3 mb-4">{t.shared.noGroups}</p>
            ) : (
              <div className="mt-3 space-y-2 mb-4">
                <label className="block text-xs text-[var(--arvo-fg-muted)] mb-1">{t.finances.pickGroup}</label>
                {sharedGroups.map(g => (
                  <button
                    key={g.id}
                    onClick={() => setSharingGroupId(g.id)}
                    className={`w-full text-left px-3 py-2.5 rounded-xl border text-sm transition-colors ${sharingGroupId === g.id ? 'border-[var(--arvo-fg)] bg-[var(--arvo-fg)]/5 font-medium' : 'border-[var(--arvo-border)] hover:border-[var(--arvo-border)]'}`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-[var(--arvo-fg)]">{g.name}</span>
                      <span className="text-xs text-[var(--arvo-fg-soft)] flex items-center gap-1">
                        <Icon name="users" size={11} />
                        {g.members.filter(m => m.status === 'active').length}
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            )}
            <div className="flex gap-2 mt-2">
              <button
                onClick={confirmShare}
                disabled={sharingSaving || !sharingGroupId}
                className="flex-1 bg-[var(--arvo-fg)] text-[var(--arvo-pill-active-fg)] text-sm py-2 rounded-xl hover:opacity-80 transition-opacity disabled:opacity-40"
              >
                {sharingSaving ? '…' : t.finances.shareCategory}
              </button>
              <button onClick={() => setShareModal(null)} className="px-4 text-sm text-[var(--arvo-fg-muted)] hover:text-[var(--arvo-fg)] transition-colors">{t.common.cancel}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
