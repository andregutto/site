import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { apiFetch } from '../../lib/api'
import { useI18n } from '../../contexts/I18nContext'
import { useAuth } from '../../contexts/AuthContext'
import { useCurrency } from '../../contexts/CurrencyContext'
import { Banner } from '../../components/ui'
import { Icon } from '../../components/icons'

interface Category {
  id: number
  name: string
  name_key?: string | null
  icon: string
  color: string
  budget_monthly: number | null
  envelope_id: number | null
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
  display: { name: string; email: string }
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


function EnvelopeBar({ env, expanded, onToggle, onEditCategory, onDeleteCategory, onAddCategory, onSaveDescription, onShareCategory, onSavePctTarget, actuals: _actuals, historicals, currency }:
  { env: Envelope; expanded: boolean; onToggle: () => void; onEditCategory: (c: Category) => void; onDeleteCategory: (id: number) => void; onAddCategory: (envId: number) => void; onSaveDescription: (id: number, desc: string) => void; onShareCategory: (c: Category) => void; onSavePctTarget: (id: number, pct: number) => void; actuals: Map<number, number>; historicals: Map<number, number>; currency: string }) {
  const { t } = useI18n()
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
  const [editingPct, setEditingPct]   = useState(false)
  const [pctInput,   setPctInput]     = useState(String(env.pct_target))

  const totalCategoryBudget = env.categories.reduce((s, c) => s + (c.budget_monthly ?? 0), 0)
  const allocated = totalCategoryBudget > 0 ? (totalCategoryBudget / env.budget_amount) * 100 : 0
  const isOver = allocated > 100
  const isInvestment = env.type === 'investment'

  const barColor = isOver
    ? 'var(--arvo-red)'
    : isInvestment && allocated >= 100
      ? 'var(--arvo-green)'
      : ENV_TYPE_COLOR[env.type] ?? 'var(--arvo-blue)'

  function saveDesc() {
    setEditingDesc(false)
    onSaveDescription(env.id, descInput)
  }

  function savePct() {
    setEditingPct(false)
    const v = parseFloat(pctInput)
    if (!isNaN(v) && v > 0 && v !== env.pct_target) onSavePctTarget(env.id, v)
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
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between mb-1.5">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-[var(--arvo-fg)] text-sm">{resolveEnvName(env.name, env.type, env.name_key, nameKeys)}</span>
              {editingPct ? (
                <span className="flex items-center gap-0.5" onClick={e => e.stopPropagation()}>
                  <input
                    autoFocus
                    type="number"
                    value={pctInput}
                    onChange={e => setPctInput(e.target.value)}
                    onBlur={savePct}
                    onKeyDown={e => { if (e.key === 'Enter') savePct(); if (e.key === 'Escape') setEditingPct(false) }}
                    className="w-12 text-xs text-[var(--arvo-fg-muted)] border border-[var(--arvo-border)] rounded px-1 py-0.5 text-center focus:outline-none focus:ring-1 focus:ring-[var(--arvo-fg)]/30"
                  />
                  <span className="text-xs text-[var(--arvo-fg-soft)]">%</span>
                </span>
              ) : (
                <button
                  onClick={e => { e.stopPropagation(); setPctInput(String(env.pct_target)); setEditingPct(true) }}
                  className="text-xs text-[var(--arvo-fg-soft)] font-medium hover:text-[var(--arvo-fg)] hover:underline transition-colors"
                  title={t.finances.editEnvelopeTitle}
                >{env.pct_target}% {t.finances.ofIncome}</button>
              )}
              {isOver && <span className="text-xs font-semibold px-1.5 py-0.5 rounded-full bg-[var(--arvo-red)]/10 text-[var(--arvo-red)]">{t.finances.overLimit}</span>}
              {isInvestment && allocated >= 100 && !isOver && <span className="text-xs font-semibold px-1.5 py-0.5 rounded-full bg-[var(--arvo-green)]/10 text-[var(--arvo-green)]">{t.finances.goalReached}</span>}
            </div>
            <div className="text-right shrink-0 ml-3">
              <span className="text-xs font-semibold text-[var(--arvo-fg)]">{fmt(totalCategoryBudget, currency)}</span>
              <span className="text-xs text-[var(--arvo-fg-soft)]"> / {fmt(env.budget_amount, currency)}</span>
            </div>
          </div>
          {/* Progress bar */}
          <div className="h-2 bg-[var(--arvo-track-bg)] rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{ width: `${Math.min(allocated, 100)}%`, backgroundColor: barColor }}
            />
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
                  <li key={cat.id} className="px-5 py-2.5 flex items-center gap-3 group">
                    <span className="text-base leading-none w-6 shrink-0">{cat.icon}</span>
                    <div className="flex-1 min-w-0 flex items-center justify-between gap-2">
                      <span className="text-sm text-[var(--arvo-fg)] truncate">{resolveKey(cat.name, cat.name_key, nameKeys)}</span>
                      <div className="flex flex-col items-end gap-0.5 shrink-0">
                        {hasBudget && (
                          <span className="text-sm font-medium text-[var(--arvo-fg)]">{fmt(cat.budget_monthly!, currency)}</span>
                        )}
                        {hist > 0 && (
                          <span className="text-xs text-[var(--arvo-fg-soft)]">{t.finances.avg3m}: {fmt(hist, currency)}</span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-1 [@media(hover:none)]:opacity-100 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={() => onShareCategory(cat)}
                        className="p-2 text-[var(--arvo-fg-soft)] hover:text-[var(--arvo-blue)] transition-colors rounded"
                        title={t.finances.shareCategory}
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-4 h-4">
                          <path d="M11.25 1.5a2.25 2.25 0 1 1 0 4.5 2.25 2.25 0 0 1 0-4.5ZM4.75 7.25a2.25 2.25 0 1 1 0 4.5 2.25 2.25 0 0 1 0-4.5ZM11.25 11a2.25 2.25 0 1 1 0 4.5 2.25 2.25 0 0 1 0-4.5ZM6.27 8.944l3.46-1.888.013.009-.013-.009-3.46 1.888Zm0-1.888 3.46 1.888-.013-.009.013.009-3.46-1.888Z" />
                        </svg>
                      </button>
                      <button
                        onClick={() => onEditCategory(cat)}
                        className="p-2 text-[var(--arvo-fg-soft)] hover:text-[var(--arvo-fg)] transition-colors rounded"
                        title={t.common.edit}
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-4 h-4">
                          <path d="M13.488 2.513a1.75 1.75 0 0 0-2.475 0L6.75 6.774a2.75 2.75 0 0 0-.596.892l-.848 2.047a.75.75 0 0 0 .98.98l2.047-.848a2.75 2.75 0 0 0 .892-.596l4.261-4.263a1.75 1.75 0 0 0 0-2.474ZM4.75 14a.75.75 0 0 0 0-1.5H3.5a.5.5 0 0 1-.5-.5V4a.5.5 0 0 1 .5-.5h8a.5.5 0 0 1 .5.5v1.25a.75.75 0 0 0 1.5 0V4a2 2 0 0 0-2-2h-8a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h1.25Z" />
                        </svg>
                      </button>
                      <button
                        onClick={() => onDeleteCategory(cat.id)}
                        className="p-2 text-[var(--arvo-fg-soft)] hover:text-[var(--arvo-red)] transition-colors rounded"
                        title={t.common.delete}
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-4 h-4">
                          <path fillRule="evenodd" d="M5 3.25V4H2.75a.75.75 0 0 0 0 1.5h.3l.815 8.15A1.5 1.5 0 0 0 5.357 15h5.285a1.5 1.5 0 0 0 1.493-1.35l.815-8.15h.3a.75.75 0 0 0 0-1.5H11v-.75A2.25 2.25 0 0 0 8.75 1h-1.5A2.25 2.25 0 0 0 5 3.25Zm2.25-.75a.75.75 0 0 0-.75.75V4h3v-.75a.75.75 0 0 0-.75-.75h-1.5ZM6.05 6a.75.75 0 0 1 .787.713l.275 5.5a.75.75 0 0 1-1.498.075l-.275-5.5A.75.75 0 0 1 6.05 6Zm3.9 0a.75.75 0 0 1 .712.787l-.275 5.5a.75.75 0 0 1-1.498-.075l.275-5.5a.75.75 0 0 1 .786-.712Z" clipRule="evenodd" />
                        </svg>
                      </button>
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

  const load = useCallback(async () => {
    setLoading(true)
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
      setExpandedIds(new Set(d.envelopes.filter(e => e.type !== 'income').map(e => e.id)))
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

      // Historical averages: last 3 complete months (excluding current)
      const pastMonths = spending.months.filter(m => m.month !== currentMonth).slice(0, 3)
      const histMap = new Map<number, number>()
      if (pastMonths.length > 0) {
        const catSums = new Map<number, number>()
        const catCounts = new Map<number, number>()
        for (const month of pastMonths) {
          for (const env of month.by_envelope) {
            for (const cat of env.categories) {
              if (cat.actual > 0) {
                catSums.set(cat.id, (catSums.get(cat.id) ?? 0) + cat.actual)
                catCounts.set(cat.id, (catCounts.get(cat.id) ?? 0) + 1)
              }
            }
          }
        }
        for (const [id, sum] of catSums) {
          histMap.set(id, Math.round(sum / (catCounts.get(id) ?? 1)))
        }
      }
      setCatHistoricals(histMap)
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

  async function saveDescription(envId: number, description: string) {
    await apiFetch(`/finances/envelopes/${envId}`, { method: 'PATCH', body: JSON.stringify({ description }) })
    await load()
  }

  async function savePctTarget(envId: number, pct: number) {
    await apiFetch(`/finances/envelopes/${envId}`, { method: 'PATCH', body: JSON.stringify({ pct_target: pct }) })
    await load()
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
    await load()
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
      await load()
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

  const totalBudget    = expenseEnvelopes.reduce((s, e) => s + e.budget_amount, 0)
  const totalCatBudget = expenseEnvelopes.reduce((s, e) => s + e.categories.reduce((cs, c) => cs + (c.budget_monthly ?? 0), 0), 0)
  const unallocated    = data.income.monthly_net - totalCatBudget
  const totalActual    = Array.from(catActuals.values()).reduce((s, v) => s + v, 0)

  return (
    <div className="space-y-5">
      {/* Page header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 style={{ fontFamily: "var(--arvo-font-body)", fontSize: 18, letterSpacing: '0.06em', color: 'var(--arvo-fg)' }}>{t.finances.budgetTitle}</h1>
          <p className="text-sm mt-0.5" style={{ color: 'var(--arvo-fg-muted)' }}>{t.finances.budgetSubtitle}</p>
        </div>
      </div>

      {/* Income card — unified with income envelope categories */}
      {incomeEnvelopes.length > 0 ? (
        <div className="space-y-3">
          <p className="text-xs text-[var(--arvo-fg-soft)] uppercase tracking-wide font-medium px-1">{t.finances.incomeLabel}</p>
          {incomeEnvelopes.map(env => {
            const envTotal = env.categories.reduce((s, c) => s + (c.budget_monthly ?? 0), 0)
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
            <span className="text-xs text-[var(--arvo-fg-muted)] uppercase tracking-wide font-medium">{t.finances.income}</span>
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

      {/* 50/30/10/10 summary — expense envelopes only */}
      {expenseEnvelopes.length > 0 && (
        <>
          <p className="text-xs text-[var(--arvo-fg-soft)] uppercase tracking-wide font-medium px-1">{t.finances.expenses}</p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {expenseEnvelopes.map(env => {
              const catTotal = env.categories.reduce((s, c) => s + (c.budget_monthly ?? 0), 0)
              const pctReal  = data.income.monthly_net > 0 ? (catTotal / data.income.monthly_net) * 100 : 0
              const over     = pctReal > env.pct_target
              const met      = env.type === 'investment' && pctReal >= env.pct_target
              return (
                <div key={env.id} className="bg-[var(--arvo-surface)] rounded-xl border border-[var(--arvo-border)] shadow-sm p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-xl leading-none">{env.icon}</span>
                    <span className="text-sm font-medium text-[var(--arvo-fg)] truncate">{resolveEnvName(env.name, env.type, env.name_key, nameKeys)}</span>
                  </div>
                  <div className="text-2xl font-bold" style={{ color: over ? 'var(--arvo-red)' : 'var(--arvo-fg)' }}>
                    {pctReal.toFixed(1)}%
                  </div>
                  <div className="text-xs text-[var(--arvo-fg-soft)] mt-0.5">{t.finances.target}: {env.pct_target}%</div>
                  <div className="mt-2 h-1 bg-[var(--arvo-track-bg)] rounded-full overflow-hidden">
                    <div className="h-full rounded-full" style={{ width: `${Math.min(pctReal / env.pct_target * 100, 100)}%`, backgroundColor: over ? 'var(--arvo-red)' : met ? 'var(--arvo-green)' : (ENV_TYPE_COLOR[env.type] ?? 'var(--arvo-blue)') }} />
                  </div>
                </div>
              )
            })}
          </div>
        </>
      )}

      {/* Unallocated banner */}
      {Math.abs(unallocated) > 0.5 && (
        <Banner variant={unallocated > 0 ? 'info' : 'alert'}>
          {unallocated > 0
            ? `${fmt(unallocated, data.income.currency)} ${t.finances.unallocatedBanner}`
            : `${t.finances.overspentBanner} ${fmt(Math.abs(unallocated), data.income.currency)}`}
        </Banner>
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
            onSaveDescription={saveDescription}
            onShareCategory={openShareModal}
            onSavePctTarget={savePctTarget}
            actuals={catActuals}
            historicals={catHistoricals}
            currency={data.income.currency}
          />
        ))}
      </div>

      {/* Total row */}
      <div className="bg-[var(--arvo-surface-2)] rounded-xl px-5 py-3 flex items-center justify-between gap-4">
        <span className="text-sm text-[var(--arvo-fg-muted)]">{t.finances.totalBudgeted}</span>
        <div className="flex items-center gap-4">
          {totalActual > 0 && (
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-[var(--arvo-fg-soft)]">{t.finances.totalConsumed}</span>
              <span className="text-sm font-semibold" style={{ color: totalActual > totalBudget ? 'var(--arvo-red)' : 'var(--arvo-fg)' }}>
                {fmt(totalActual, data.income.currency)}
              </span>
            </div>
          )}
          <span className="text-sm font-semibold text-[var(--arvo-fg)]">/ {fmt(totalBudget, data.income.currency)}</span>
        </div>
      </div>

      {/* Shared categories section */}
      {sharedGroups.some(g => g.categories.length > 0) && (
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
          {sharedGroups.filter(g => g.categories.length > 0).map(group => {
            const myMember = group.members.find(m => m.user_id === user?.id)
            const myPct = myMember?.share_pct ?? 50
            const activeMembers = group.members.filter(m => m.status === 'active')
            return (
              <div key={group.id} className="bg-[var(--arvo-surface)] rounded-2xl border border-[var(--arvo-border)] shadow-sm overflow-hidden">
                <div className="px-5 py-3 border-b border-[var(--arvo-border-soft)] flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-[var(--arvo-fg)]">{group.name}</span>
                    <span className="text-xs bg-[var(--arvo-surface-2)] text-[var(--arvo-fg-muted)] px-1.5 py-0.5 rounded-full font-medium flex items-center gap-1">
                      <Icon name="users" size={11} />
                      {activeMembers.length}
                    </span>
                  </div>
                  <span className="text-xs text-[var(--arvo-fg-soft)]">{activeMembers.map(m => m.display.name.split(' ')[0]).join(', ')}</span>
                </div>
                <ul className="divide-y divide-[var(--arvo-border-soft)]">
                  {group.categories.map(cat => {
                    const myGoal = Math.round(cat.total_goal * myPct / 100)
                    return (
                      <li key={cat.id} className="px-5 py-3 flex items-start gap-3">
                        <span className="text-base leading-none w-6 shrink-0 mt-0.5">{cat.icon}</span>
                        <div className="flex-1 min-w-0 space-y-1.5">
                          <div className="flex items-center gap-1.5">
                            <span className="text-sm text-[var(--arvo-fg)] truncate">{cat.name}</span>
                            <Icon name="users" size={12} style={{ color: 'var(--arvo-fg-soft)' }} />
                          </div>
                          <span className="text-xs text-[var(--arvo-fg-soft)]">{myPct}% · {t.finances.myGoal}: {fmt(myGoal, cat.currency)}</span>
                          <div className="relative">
                            <button
                              onClick={() => setOpenEnvPicker(openEnvPicker === cat.id ? null : cat.id)}
                              className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg border border-[var(--arvo-border)] hover:border-[var(--arvo-border)] bg-[var(--arvo-surface)] text-[var(--arvo-fg-muted)] transition-colors"
                            >
                              {cat.local_envelope_id
                                ? (() => { const e = expenseEnvelopes.find(e => e.id === cat.local_envelope_id); return e ? <>{e.icon} {resolveEnvName(e.name, e.type, e.name_key, nameKeys)}</> : t.finances.noEnvelope })()
                                : <span className="text-[var(--arvo-fg-soft)]">{t.finances.noEnvelope}</span>
                              }
                              <svg className={`w-3 h-3 text-[var(--arvo-fg-soft)] transition-transform ${openEnvPicker === cat.id ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7"/></svg>
                            </button>
                            {openEnvPicker === cat.id && (
                              <>
                              <div className="fixed inset-0 z-10" onClick={() => setOpenEnvPicker(null)} />
                              <div className="absolute left-0 top-full mt-1 z-20 bg-[var(--arvo-surface)] border border-[var(--arvo-border)] rounded-xl shadow-lg py-1 min-w-[180px]">
                                <button
                                  onClick={() => { setSharedEnvelope(cat.id, null); setOpenEnvPicker(null) }}
                                  className={`w-full flex items-center gap-2 px-3 py-2 text-xs text-left transition-colors hover:bg-[var(--arvo-surface-2)] ${!cat.local_envelope_id ? 'font-semibold text-[var(--arvo-fg)]' : 'text-[var(--arvo-fg-soft)]'}`}
                                >
                                  <span className="w-4 h-4 rounded-full border-2 border-[var(--arvo-border)] shrink-0" />
                                  {t.finances.noEnvelope}
                                </button>
                                {expenseEnvelopes.map(env => (
                                  <button
                                    key={env.id}
                                    onClick={() => { setSharedEnvelope(cat.id, env.id); setOpenEnvPicker(null) }}
                                    className={`w-full flex items-center gap-2 px-3 py-2 text-xs text-left transition-colors hover:bg-[var(--arvo-surface-2)] ${cat.local_envelope_id === env.id ? 'font-semibold text-[var(--arvo-fg)]' : 'text-[var(--arvo-fg-muted)]'}`}
                                  >
                                    <span className="text-sm leading-none">{env.icon}</span>
                                    <span className="flex-1 truncate">{resolveEnvName(env.name, env.type, env.name_key, nameKeys)}</span>
                                    {cat.local_envelope_id === env.id && <svg className="w-3.5 h-3.5 text-[var(--arvo-blue)] shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7"/></svg>}
                                  </button>
                                ))}
                              </div>
                              </>
                            )}
                          </div>
                        </div>
                        {cat.total_goal > 0 && (
                          <span className="text-xs text-[var(--arvo-fg-soft)] shrink-0 mt-0.5">/ {fmt(cat.total_goal, cat.currency)}</span>
                        )}
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
                      <span>{g.name}</span>
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
