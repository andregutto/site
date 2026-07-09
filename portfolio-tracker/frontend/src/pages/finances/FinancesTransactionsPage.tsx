import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import * as XLSX from 'xlsx'
import { apiFetch } from '../../lib/api'
import { useAuth } from '../../contexts/AuthContext'
import { useI18n } from '../../contexts/I18nContext'
import { useCurrency } from '../../contexts/CurrencyContext'
import { useUpgrade } from '../../contexts/UpgradeContext'
import { Icon } from '../../components/icons'
import { DatePicker, DateRangePicker } from '../../components/ui'
import { resolveMomentIcon } from '../../lib/momentIcons'
import { useActiveFriends } from '../../hooks/useActiveFriends'
import { SplitTransactionModal } from './ExpensesPanel'
import Avatar from '../voyage/_shared/Avatar'

interface Category { id: number; name: string; name_key?: string | null; icon: string; color: string }

function resolveKey(name: string, nameKey: string | null | undefined, keys: Record<string, string>): string {
  if (!nameKey) return name
  return keys[nameKey] ?? name
}
interface MomentRef  { id: number; name: string; icon: string; color: string }
interface FinanceAccount { id: number; name: string; icon: string; currency: string; transaction_count?: number }
interface Transaction {
  id: number
  date: string
  description: string
  amount: number
  currency: string
  category_id: number | null
  shared_category_id: number | null
  account_id: number | null
  moment_id: number | null
  finance_categories: Category | null
  moments: MomentRef[]
  is_internal_transfer: boolean
  linked_transfer_id: number | null
  exclude_from_stats: boolean
  reimbursement_group_id: string | null
  source: string
  notes: string | null
}

interface ReimbursementGroup {
  id: string
  name: string
  transactions: { id: number; date: string; description: string; amount: number; currency: string }[]
  net: number
}
interface ParsedRow {
  date: string
  description: string
  amount: number
  currency: string
  suggested_category: Category | null
  suggested_by: 'keyword' | 'ai' | 'transfer' | null
  is_broker_transfer: boolean
  is_internal_transfer: boolean
  broker_name: string | null
  category_id?: number | null
  suggested_category_id?: number | null
  shared_category_id?: number | null
  source?: string
  is_duplicate?: boolean
  manual_match?: { transaction_id: number; description: string; amount: number; date: string; moment_id: number | null; moment_name: string } | null
}

interface AiDebug { ran: boolean; assigned: number; unmatched: number; error: string | null }

function _fmt(n: number, currency = 'EUR') {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency, minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n)
}
function fmtDate(d: string) {
  const dt = new Date(d + 'T12:00:00')
  return `${String(dt.getDate()).padStart(2, '0')}/${String(dt.getMonth() + 1).padStart(2, '0')}`
}

const LOCALE_MAP: Record<string, string> = { pt: 'pt-BR', en: 'en-GB', fr: 'fr-FR' }

const menuItemStyle: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 10, width: '100%',
  padding: '9px 16px', fontSize: 14, fontFamily: 'var(--arvo-font-body)',
  color: 'var(--arvo-fg)', background: 'none', border: 'none',
  cursor: 'pointer', textAlign: 'left', whiteSpace: 'nowrap',
}
const chipStyle: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 5,
  padding: '4px 10px', borderRadius: 999,
  background: 'var(--arvo-border-soft)', border: '1px solid var(--arvo-border)',
  fontSize: 13, fontFamily: 'var(--arvo-font-body)', color: 'var(--arvo-fg)',
}
const chipXStyle: React.CSSProperties = {
  background: 'none', border: 'none', cursor: 'pointer',
  padding: 0, fontSize: 12, color: 'var(--arvo-fg-soft)', lineHeight: 1,
}


export default function FinancesTransactionsPage() {
  const { t, locale } = useI18n()
  const { user } = useAuth()
  const { hideValues } = useCurrency()
  const { handleUpgradeError } = useUpgrade()
  const fmt = (n: number, currency = 'EUR') => hideValues ? '•••' : _fmt(n, currency)
  const [searchParams] = useSearchParams()
  const today = new Date()
  const cycleDay: number = (user?.user_metadata?.month_cycle_day as number) || 1
  const defaultMonth = (() => {
    if (cycleDay > 1 && today.getDate() >= cycleDay) {
      const next = new Date(today.getFullYear(), today.getMonth() + 1, 1)
      return `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}`
    }
    return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`
  })()

  const [month, setMonth]               = useState(defaultMonth)
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [incomeCategories, setIncomeCategories]   = useState<Category[]>([])
  const [expenseCategories, setExpenseCategories] = useState<Category[]>([])
  const [allCategories, setAllCategories]         = useState<Category[]>([])
  const [moments, setMoments]           = useState<MomentRef[]>([])
  const [loading, setLoading]           = useState(true)
  const [showAdd, setShowAdd]           = useState(false)
  const [csvStep, setCsvStep]           = useState<'idle' | 'preview' | 'importing' | 'parsing'>('idle')
  const [csvRows, setCsvRows]           = useState<ParsedRow[]>([])
  const [csvDuplicateCount, setCsvDuplicateCount] = useState(0)
  const [csvAiDebug, setCsvAiDebug]     = useState<AiDebug | null>(null)
  const [csvAiLoading, setCsvAiLoading] = useState(false)
  const [csvError, setCsvError]         = useState('')
  const [csvFilterUncategorized, setCsvFilterUncategorized] = useState(false)
  const [csvCurrency, setCsvCurrency]   = useState('EUR')
  const [csvAccountId, setCsvAccountId]   = useState<number | null>(null)
  const [accounts, setAccounts]           = useState<FinanceAccount[]>([])
  const [accountsLoaded, setAccountsLoaded] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  // Detect transfers
  const [detecting, setDetecting]           = useState(false)
  const [detectResult, setDetectResult]     = useState<string | null>(null)

  // Detect reimbursements
  const [detectingReimb, setDetectingReimb]         = useState(false)
  const [detectReimbResult, setDetectReimbResult]   = useState<string | null>(null)

  // Group editing
  const [editingGroupId, setEditingGroupId]         = useState<string | null>(null)
  const [editingGroupNameInput, setEditingGroupNameInput] = useState('')
  const [showAutoGroups, setShowAutoGroups]         = useState(false)
  const [showOlderGroups, setShowOlderGroups]       = useState(false)

  // Reimbursement groups
  const [groups, setGroups]                 = useState<ReimbursementGroup[]>([])
  const [showGroupModal, setShowGroupModal] = useState(false)
  const [showGroupHelp, setShowGroupHelp]   = useState(false)
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set())
  const [groupName, setGroupName]           = useState('')
  const [savingGroup, setSavingGroup]       = useState(false)

  function toggleExpandGroup(id: string) {
    setExpandedGroups(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  // Multi-select
  const [selected, setSelected]             = useState<Set<number>>(new Set())
  const [showMomentDropdown, setShowMomentDropdown] = useState(false)
  const [assigning, setAssigning]           = useState(false)
  const momentDropdownRef                   = useRef<HTMLDivElement>(null)
  const [showGroupPicker, setShowGroupPicker] = useState(false)
  const [addingToGroup, setAddingToGroup]     = useState(false)
  const groupPickerRef                        = useRef<HTMLDivElement>(null)

  // Add form state
  const [addDate, setAddDate]           = useState(today.toISOString().split('T')[0])
  const [addDesc, setAddDesc]           = useState('')
  const [addAmt, setAddAmt]             = useState('')
  const [addSign, setAddSign]           = useState<'-' | '+'>('-')
  const [addCat, setAddCat]             = useState<number | ''>('')
  const [addCur, setAddCur]             = useState('EUR')
  const [addAccountId, setAddAccountId] = useState<number | null>(null)
  const [addSharedCat, setAddSharedCat] = useState<number | ''>('')
  const [sharedCats, setSharedCats]     = useState<{ id: number; name: string; icon: string; group_id: number }[]>([])
  const [saving, setSaving]             = useState(false)

  // Inline category edit
  const [editingId, setEditingId]   = useState<number | null>(null)
  // Inline notes edit
  const [editingNotesId, setEditingNotesId] = useState<number | null>(null)
  const [notesInput, setNotesInput]         = useState('')
  // Mobile bottom sheet for category edit
  const [editSheetTx, setEditSheetTx] = useState<Transaction | null>(null)
  // Dividir uma transação avulsa (sem Momento) direto com um amigo — sem
  // exigir que o usuário crie um Momento antes. Resolve/cria o momento 1:1
  // oculto (POST /finances/moments/default-with/:id) e abre o mesmo
  // SplitTransactionModal já usado dentro de um Momento normal.
  const [splitPickerTx, setSplitPickerTx] = useState<Transaction | null>(null)
  const [splitMoment, setSplitMoment] = useState<{ tx: Transaction; momentId: number } | null>(null)
  const activeFriends = useActiveFriends()
  const [splitGroups, setSplitGroups] = useState<{ id: number; name: string }[]>([])
  useEffect(() => {
    apiFetch<{ id: number; name: string }[]>('/shared/groups').then(setSplitGroups).catch(() => {})
  }, [])
  const [sheetCatId, setSheetCatId]   = useState<number | null>(null)
  const [sheetSharedCatId, setSheetSharedCatId] = useState<number | null>(null)

  // Date range mode
  const [dateMode, setDateMode]   = useState<'month' | 'last30' | 'range'>('month')
  const [dateFrom, setDateFrom]   = useState(`${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-01`)
  const [dateTo, setDateTo]       = useState(today.toISOString().split('T')[0])
  // Filters
  const [filterCatId, setFilterCatId]         = useState<number | ''>(() => {
    const p = searchParams.get('category_id')
    return p ? Number(p) : ''
  })
  const [filterMomentId, setFilterMomentId]   = useState<number | ''>('')
  const [filterAccountId, setFilterAccountId] = useState<number | 'unassigned' | ''>('')

  // Bulk assign account
  const [showAccountAssign, setShowAccountAssign] = useState(false)
  const [assigningAccount, setAssigningAccount]   = useState(false)

  // Import modal — abre já ao carregar quando vem do atalho da Hoje (?import=1)
  const [showImportModal, setShowImportModal] = useState(() => searchParams.get('import') === '1')
  // Search
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<Array<{id: number; date: string; description: string; amount: number; currency: string; finance_categories: {name: string; icon: string; color: string} | null}>>([])
  const [searchLoading, setSearchLoading] = useState(false)
  const [showSearchDrop, setShowSearchDrop] = useState(false)
  const searchDropRef = useRef<HTMLDivElement>(null)

  // Overflow menu + filter panel
  const [showOverflowMenu, setShowOverflowMenu] = useState(false)
  const [showFilterPanel, setShowFilterPanel]   = useState(false)
  const overflowMenuRef = useRef<HTMLDivElement>(null)
  const filterPanelRef  = useRef<HTMLDivElement>(null)

  // Mobile per-row action menu (notes / exclude / transfer / delete)
  const [mobileActionsTxId, setMobileActionsTxId] = useState<number | null>(null)
  const mobileActionsRef = useRef<HTMLDivElement>(null)

  // Global search debounce
  useEffect(() => {
    if (searchQuery.trim().length < 2) { setSearchResults([]); setShowSearchDrop(false); return }
    setSearchLoading(true)
    setShowSearchDrop(true)
    const timer = setTimeout(async () => {
      try {
        const data = await apiFetch<typeof searchResults>(`/finances/transactions/search?q=${encodeURIComponent(searchQuery.trim())}&limit=15`)
        setSearchResults(data)
      } catch { setSearchResults([]) }
      finally { setSearchLoading(false) }
    }, 300)
    return () => clearTimeout(timer)
  }, [searchQuery])

  // Close dropdown on outside click
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (searchDropRef.current && !searchDropRef.current.contains(e.target as Node)) setShowSearchDrop(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const loadTransactions = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (dateMode === 'month') {
        params.set('month', month)
      } else {
        if (dateFrom) params.set('date_from', dateFrom)
        if (dateTo)   params.set('date_to', dateTo)
      }
      if (filterCatId)                      params.set('category_id', String(filterCatId))
      if (filterMomentId)                   params.set('moment_id', String(filterMomentId))
      if (filterAccountId !== '')           params.set('account_id', String(filterAccountId))
      const data = await apiFetch<Transaction[]>(`/finances/transactions?${params}`)
      setTransactions(data)
    } finally {
      setLoading(false)
    }
  }, [month, dateMode, dateFrom, dateTo, filterCatId, filterMomentId, filterAccountId])

  useEffect(() => {
    apiFetch<{ envelopes: { type: string; categories: Category[] }[] }>('/finances/budget')
      .then(d => {
        setIncomeCategories(d.envelopes.filter(e => e.type === 'income').flatMap(e => e.categories))
        setExpenseCategories(d.envelopes.filter(e => e.type !== 'income').flatMap(e => e.categories))
      })
      .catch(() => {})
    apiFetch<Category[]>('/finances/categories')
      .then(setAllCategories)
      .catch(() => {})
    apiFetch<MomentRef[]>('/finances/moments-for-picker')
      .then(setMoments)
      .catch(() => {})
    apiFetch<ReimbursementGroup[]>('/finances/reimbursement-groups')
      .then(setGroups)
      .catch(() => {})
    apiFetch<FinanceAccount[]>('/finances/accounts')
      .then(data => {
        setAccounts(data)
        // Default the import selectors to the account with the most transactions
        // (or the only one, if there's just one) instead of leaving them unselected.
        if (data.length === 1) {
          setCsvAccountId(data[0].id)
          setAddAccountId(data[0].id)
        } else if (data.length > 1) {
          const mostUsed = data.reduce((best, a) => (a.transaction_count ?? 0) > (best.transaction_count ?? 0) ? a : best)
          if ((mostUsed.transaction_count ?? 0) > 0) {
            setCsvAccountId(mostUsed.id)
            setAddAccountId(mostUsed.id)
          }
        }
        setAccountsLoaded(true)
      })
      .catch(() => setAccountsLoaded(true))
  }, [])

  useEffect(() => { loadTransactions() }, [loadTransactions])
  useEffect(() => {
    apiFetch<{ id: number; name: string; icon: string; group_id: number }[]>('/shared/categories')
      .then(setSharedCats).catch(() => {})
  }, [])

  // On mount: fetch all months with data and jump to most recent if current is empty
  useEffect(() => {
    apiFetch<string[]>('/finances/transactions/months')
      .then(months => {
        if (months.length > 0 && !months.includes(defaultMonth)) {
          setMonth(months[0])
        }
      })
      .catch(() => {})
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Close moment dropdown on outside click
  useEffect(() => {
    if (!showMomentDropdown) return
    function handler(e: MouseEvent) {
      if (momentDropdownRef.current && !momentDropdownRef.current.contains(e.target as Node)) {
        setShowMomentDropdown(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [showMomentDropdown])

  // Close group picker on outside click
  useEffect(() => {
    if (!showGroupPicker) return
    function handler(e: MouseEvent) {
      if (groupPickerRef.current && !groupPickerRef.current.contains(e.target as Node)) {
        setShowGroupPicker(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [showGroupPicker])

  // Clear selection on date/filter change
  useEffect(() => { setSelected(new Set()) }, [month, dateMode, dateFrom, dateTo, filterCatId, filterMomentId, filterAccountId])

  function toggleSelect(id: number) {
    setSelected(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  function toggleSelectAll() {
    if (selected.size === transactions.length) {
      setSelected(new Set())
    } else {
      setSelected(new Set(transactions.map(tx => tx.id)))
    }
  }

  async function bulkToggleMoment(momentId: number | null) {
    setAssigning(true)
    setShowMomentDropdown(false)
    try {
      const allHaveIt = momentId !== null && Array.from(selected).every(id => {
        const tx = transactions.find(t => t.id === id)
        return tx?.moments.some(m => m.id === momentId)
      })
      await Promise.all(
        Array.from(selected).map(id => {
          const tx = transactions.find(t => t.id === id)
          let newIds: number[]
          if (momentId === null) {
            newIds = []
          } else {
            const cur = tx?.moments.map(m => m.id) ?? []
            newIds = allHaveIt ? cur.filter(mid => mid !== momentId) : [...new Set([...cur, momentId])]
          }
          return apiFetch(`/finances/transactions/${id}`, { method: 'PATCH', body: JSON.stringify({ moment_ids: newIds }) })
        })
      )
      setSelected(new Set())
      await loadTransactions()
    } finally {
      setAssigning(false)
    }
  }

  async function addTransaction() {
    if (!addDesc.trim() || !addAmt || !addDate) return
    setSaving(true)
    try {
      const amount = parseFloat(addAmt) * (addSign === '-' ? -1 : 1)
      await apiFetch('/finances/transactions', {
        method: 'POST',
        body: JSON.stringify({ date: addDate, description: addDesc.trim(), amount, currency: addCur, category_id: addCat || null, account_id: addAccountId, shared_category_id: addSharedCat || null }),
      })
      setShowAdd(false)
      setAddDesc(''); setAddAmt(''); setAddCat(''); setAddAccountId(null)
      await loadTransactions()
    } finally {
      setSaving(false)
    }
  }

  async function pickSplitFriend(tx: Transaction, friendUserId: string) {
    const res = await apiFetch<{ moment_id: number }>(`/finances/moments/default-with/${friendUserId}`, { method: 'POST' })
    setSplitPickerTx(null)
    setSplitMoment({ tx, momentId: res.moment_id })
  }

  async function pickSplitGroup(tx: Transaction, groupId: number) {
    const res = await apiFetch<{ moment_id: number }>(`/shared/groups/${groupId}/default-moment`, { method: 'POST' })
    setSplitPickerTx(null)
    setSplitMoment({ tx, momentId: res.moment_id })
  }

  async function deleteTransaction(id: number) {
    if (!confirm(t.finances.confirmDeleteTransaction)) return
    await apiFetch(`/finances/transactions/${id}`, { method: 'DELETE' })
    loadTransactions()
  }

  async function updateCategory(id: number, categoryId: number | null) {
    const tx = transactions.find(t => t.id === id)
    await apiFetch(`/finances/transactions/${id}`, { method: 'PATCH', body: JSON.stringify({ category_id: categoryId }) })

    if (tx) {
      const msg = t.finances.updateCategoryConfirm.replace('{desc}', tx.description ?? '')
      const applyAll = window.confirm(msg)
      if (applyAll) {
        await apiFetch('/finances/transactions/bulk-category', {
          method: 'PATCH',
          body: JSON.stringify({ description: tx.description, category_id: categoryId }),
        })
      }
    }

    setEditingId(null)
    loadTransactions()
  }

  async function toggleInternal(id: number, current: boolean) {
    await apiFetch(`/finances/transactions/${id}`, { method: 'PATCH', body: JSON.stringify({ is_internal_transfer: !current }) })
    const tx = transactions.find(tx2 => tx2.id === id)
    if (tx?.description) {
      const key = current ? t.finances.unmarkInternalAll : t.finances.markInternalAll
      const applyAll = window.confirm(key.replace('{desc}', tx.description))
      if (applyAll) {
        await apiFetch('/finances/transactions/bulk-transfer', {
          method: 'PATCH',
          body: JSON.stringify({ description: tx.description, is_internal_transfer: !current }),
        })
      }
    }
    loadTransactions()
  }

  async function bulkAssignAccount(accountId: number | null) {
    setAssigningAccount(true)
    setShowAccountAssign(false)
    try {
      const ids = Array.from(selected)
      await apiFetch('/finances/transactions/bulk-assign-account', {
        method: 'PATCH',
        body: JSON.stringify({ transaction_ids: ids, account_id: accountId }),
      })
      setSelected(new Set())
      loadTransactions()
    } finally {
      setAssigningAccount(false)
    }
  }

  async function toggleExclude(id: number, current: boolean) {
    setTransactions(prev => prev.map(tx => tx.id === id ? { ...tx, exclude_from_stats: !current } : tx))
    await apiFetch(`/finances/transactions/${id}`, { method: 'PATCH', body: JSON.stringify({ exclude_from_stats: !current }) })
    loadTransactions()
  }

  async function unlinkTransfer(id: number) {
    await apiFetch(`/finances/transactions/${id}/unlink-transfer`, { method: 'POST' })
    loadTransactions()
  }

  const activeFilterCount = (filterCatId !== '' ? 1 : 0) + (filterMomentId !== '' ? 1 : 0) + (filterAccountId !== '' ? 1 : 0)
  const fmtLocale = LOCALE_MAP[locale] ?? 'pt-BR'

  function fmtMonthFull(m: string) {
    const [y, mo] = m.split('-')
    return new Date(Number(y), Number(mo) - 1).toLocaleDateString(fmtLocale, { month: 'long', year: 'numeric' })
  }

  function prevMonth() {
    const [y, mo] = month.split('-').map(Number)
    const d = new Date(y, mo - 2, 1)
    setMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
  }

  function nextMonth() {
    if (month >= defaultMonth) return
    const [y, mo] = month.split('-').map(Number)
    const d = new Date(y, mo, 1)
    setMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
  }

  useEffect(() => {
    if (!showOverflowMenu) return
    function handler(e: MouseEvent) {
      if (overflowMenuRef.current && !overflowMenuRef.current.contains(e.target as Node)) setShowOverflowMenu(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [showOverflowMenu])

  useEffect(() => {
    if (!showFilterPanel) return
    function handler(e: MouseEvent) {
      if (filterPanelRef.current && !filterPanelRef.current.contains(e.target as Node)) setShowFilterPanel(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [showFilterPanel])

  useEffect(() => {
    if (mobileActionsTxId === null) return
    function handler(e: MouseEvent) {
      if (mobileActionsRef.current && !mobileActionsRef.current.contains(e.target as Node)) setMobileActionsTxId(null)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [mobileActionsTxId])

  function setLast30Days() {
    const d = new Date()
    const from = new Date(d)
    from.setDate(from.getDate() - 29)
    setDateFrom(from.toISOString().split('T')[0])
    setDateTo(d.toISOString().split('T')[0])
    setDateMode('last30')
  }

  async function addToGroup(groupId: string) {
    setAddingToGroup(true)
    setShowGroupPicker(false)
    try {
      await apiFetch(`/finances/reimbursement-groups/${groupId}`, {
        method: 'PATCH',
        body: JSON.stringify({ add_ids: Array.from(selected) }),
      })
      setSelected(new Set())
      await reloadGroups()
      await loadTransactions()
    } finally {
      setAddingToGroup(false)
    }
  }

  async function detectTransfers() {
    setDetecting(true)
    setDetectResult(null)
    try {
      const r = await apiFetch<{ linked: number }>('/finances/detect-transfers', { method: 'POST' })
      setDetectResult(t.finances.detectTransfersResult.replace('{n}', String(r.linked)))
      loadTransactions()
    } finally {
      setDetecting(false)
    }
  }

  async function createReimbursementGroup() {
    if (!groupName.trim() || selected.size === 0) return
    setSavingGroup(true)
    try {
      const group = await apiFetch<ReimbursementGroup>('/finances/reimbursement-groups', {
        method: 'POST',
        body: JSON.stringify({ name: groupName.trim(), transaction_ids: Array.from(selected) }),
      })
      setGroups(prev => [{ ...group, transactions: [], net: 0 }, ...prev])
      setShowGroupModal(false)
      setGroupName('')
      setSelected(new Set())
      loadTransactions()
    } finally {
      setSavingGroup(false)
    }
  }

  async function deleteGroup(id: string) {
    if (!confirm(t.finances.reimbursementGroupDeleteConfirm)) return
    await apiFetch(`/finances/reimbursement-groups/${id}`, { method: 'DELETE' })
    setGroups(prev => prev.filter(g => g.id !== id))
    loadTransactions()
  }

  async function reloadGroups() {
    const data = await apiFetch<ReimbursementGroup[]>('/finances/reimbursement-groups')
    setGroups(data)
  }

  async function detectReimbursements() {
    setDetectingReimb(true)
    setDetectReimbResult(null)
    try {
      const r = await apiFetch<{ created: number }>('/finances/detect-reimbursements', { method: 'POST' })
      setDetectReimbResult(r.created > 0 ? t.finances.detectRefundsResult.replace('{n}', String(r.created)) : t.finances.detectRefundsNone)
      if (r.created > 0) { await reloadGroups(); loadTransactions() }
    } finally {
      setDetectingReimb(false)
    }
  }

  async function renameGroup(id: string, name: string) {
    if (!name.trim()) return
    await apiFetch(`/finances/reimbursement-groups/${id}`, { method: 'PATCH', body: JSON.stringify({ name: name.trim() }) })
    setGroups(prev => prev.map(g => g.id === id ? { ...g, name: name.trim() } : g))
    setEditingGroupId(null)
  }

  async function removeFromGroup(groupId: string, txId: number) {
    await apiFetch(`/finances/reimbursement-groups/${groupId}`, { method: 'PATCH', body: JSON.stringify({ remove_ids: [txId] }) })
    await reloadGroups()
    loadTransactions()
  }

  async function saveNotes(id: number, notes: string) {
    const value = notes.trim() || null
    await apiFetch(`/finances/transactions/${id}`, { method: 'PATCH', body: JSON.stringify({ notes: value }) })
    setTransactions(prev => prev.map(tx => tx.id === id ? { ...tx, notes: value } : tx))
    setEditingNotesId(null)
  }

  async function handleCSVFile(file: File) {
    setCsvError('')
    setCsvAiDebug(null)
    setCsvDuplicateCount(0)
    setCsvStep('parsing')

    let text: string
    const isXLS = /\.(xlsx?|ods)$/i.test(file.name)
    if (isXLS) {
      const buf = await file.arrayBuffer()
      const wb  = XLSX.read(buf, { type: 'array' })
      const ws  = wb.Sheets[wb.SheetNames[0]]
      // SheetJS csv_to_sheet: use FS='\t' so commas in cell values don't break parsing
      text = XLSX.utils.sheet_to_csv(ws, { FS: '\t' })
      // Re-join as tab-separated so the server parseCSV sees clean columns
    } else {
      text = await file.text()
    }
    try {
      const result = await apiFetch<{ transactions: ParsedRow[]; total: number; duplicate_count?: number; error?: string; ai_debug?: AiDebug }>(
        '/finances/transactions/csv-parse',
        { method: 'POST', body: JSON.stringify({ csv: text, currency: csvCurrency }) }
      )
      if (result.error) { setCsvError(result.error); setCsvStep('idle'); return }
      setCsvFilterUncategorized(false)
      setCsvDuplicateCount(result.duplicate_count ?? 0)

      const rows = [...result.transactions]
        .filter(r => !r.is_duplicate)
        .sort((a, b) => b.date.localeCompare(a.date))
        .map(r => ({
          ...r,
          category_id: r.suggested_category?.id ?? null,
          suggested_category_id: r.suggested_category?.id ?? null,
        }))
      setCsvRows(rows)
      setCsvStep('preview')

      // AI categorization: runs in chunks of 90 after preview loads so each chunk
      // gets its own fresh 25s Cloudflare budget — covers all unique descriptions
      const unmatched = result.transactions.filter(r => !r.suggested_category && !r.is_broker_transfer && !r.is_internal_transfer)
      if (unmatched.length > 0) {
        // Build unique list sorted by frequency (most common merchants first)
        const freqMap = new Map<string, number>()
        const signMap = new Map<string, '+' | '-'>()
        for (const r of unmatched) {
          freqMap.set(r.description, (freqMap.get(r.description) ?? 0) + 1)
          if (!signMap.has(r.description)) signMap.set(r.description, r.amount >= 0 ? '+' : '-')
        }
        const uniqueItems = Array.from(signMap.entries())
          .map(([description, sign]) => ({ description, sign }))
          .sort((a, b) => (freqMap.get(b.description) ?? 0) - (freqMap.get(a.description) ?? 0))

        const AI_CHUNK = 90 // 3 batches × 30 items — fits comfortably in 25s even if API is slow
        const descToCatId = new Map<string, number | null>()
        const catById = Object.fromEntries([...incomeCategories, ...expenseCategories].map(c => [c.id, c]))
        let totalAssigned = 0
        let lastError: string | null = null

        setCsvAiLoading(true)
        try {
          for (let start = 0; start < uniqueItems.length; start += AI_CHUNK) {
            const chunk = uniqueItems.slice(start, start + AI_CHUNK)
            try {
              const aiResult = await apiFetch<{ map: Record<string, number | null>; error: string | null }>(
                '/finances/transactions/ai-categorize',
                { method: 'POST', body: JSON.stringify({ items: chunk }) }
              )
              if (aiResult.error) lastError = aiResult.error
              chunk.forEach((item, idx) => {
                const catId = aiResult.map[String(idx)]
                if (catId !== undefined) descToCatId.set(item.description, catId)
              })
            } catch (e) {
              // Categorização IA é gated (ai_categorize + quota ai_categorize_month).
              if (handleUpgradeError(e)) { setCsvAiLoading(false); return }
              lastError = 'Erro ao contactar IA'
              break
            }
          }

          setCsvRows(prev => prev.map(r => {
            if (r.suggested_category || r.is_broker_transfer || r.is_internal_transfer) return r
            if (!descToCatId.has(r.description)) return r
            const catId = descToCatId.get(r.description)
            if (catId != null && catById[catId]) {
              totalAssigned++
              return { ...r, suggested_category: catById[catId], suggested_by: 'ai' as const, category_id: catId, suggested_category_id: catId }
            }
            return r
          }))
          setCsvAiDebug({ ran: true, assigned: totalAssigned, unmatched: uniqueItems.length, error: lastError })
        } finally {
          setCsvAiLoading(false)
        }
      } else {
        setCsvAiDebug({ ran: false, assigned: 0, unmatched: 0, error: null })
      }
    } catch (e: unknown) {
      // Import CSV é gated (csv_import + quota import_accounts). O 403 abre o modal.
      if (handleUpgradeError(e)) { setCsvStep('idle'); return }
      setCsvError(e instanceof Error ? e.message : t.finances.csvAiError.replace('{msg}', 'CSV'))
      setCsvStep('idle')
    }
  }

  // O usuário confirmou que essa linha do CSV é a mesma despesa que ele já lançou manualmente
  // numa divisão (moment_match). Em vez de importar como transação nova (duplicando), atualiza
  // a transação manual existente com os dados "oficiais" do banco e tira a linha do preview.
  async function linkManualMatch(row: ParsedRow) {
    if (!row.manual_match) return
    await apiFetch(`/finances/transactions/${row.manual_match.transaction_id}/adopt-import`, {
      method: 'POST',
      body: JSON.stringify({
        date: row.date, description: row.description, amount: row.amount, currency: row.currency,
        category_id: row.category_id ?? null, account_id: csvAccountId, is_internal_transfer: row.is_internal_transfer,
      }),
    })
    setCsvRows(prev => prev.filter(r => r !== row))
  }

  async function importCSV() {
    setCsvStep('importing')
    setCsvError('')
    try {
      const toImport = csvRows.filter(r => !r.is_broker_transfer || r.category_id)
      // Save keyword rules for: (a) manually changed categories, (b) accepted AI suggestions (so next import skips the API call)
      const learn_rules = toImport
        .filter(r => r.category_id != null && (r.category_id !== r.suggested_category_id || r.suggested_by === 'ai'))
        .map(r => ({ category_id: r.category_id as number, keyword: r.description.toLowerCase().trim() }))

      const CHUNK = 300
      let totalImported = 0, totalSkipped = 0
      for (let start = 0; start < toImport.length; start += CHUNK) {
        const chunk = toImport.slice(start, start + CHUNK)
        const result = await apiFetch<{ imported: number; skipped: number; total: number }>('/finances/transactions/csv-import', {
          method: 'POST',
          body: JSON.stringify({
            transactions: chunk.map(r => ({
              date: r.date, description: r.description, amount: r.amount, currency: r.currency,
              category_id: r.category_id ?? null, shared_category_id: r.shared_category_id ?? null,
              account_id: csvAccountId, is_internal_transfer: r.is_internal_transfer,
              source: r.source,
            })),
            learn_rules: start === 0 ? learn_rules : [],
          }),
        })
        totalImported += result.imported
        totalSkipped += result.skipped
      }
      const result = { imported: totalImported, skipped: totalSkipped }

      // After import, jump to the most recent month present in the imported data
      const mostRecentDate = toImport.reduce((max, r) => r.date > max ? r.date : max, toImport[0]?.date ?? '')
      if (mostRecentDate) setMonth(mostRecentDate.slice(0, 7))

      setCsvStep('idle'); setCsvRows([]); setCsvDuplicateCount(0)
      const msg = result.skipped > 0
        ? t.finances.csvImportedSkipped.replace('{imported}', String(result.imported)).replace('{skipped}', String(result.skipped))
        : t.finances.csvImportedOk.replace('{imported}', String(result.imported))
      alert(msg)
      loadTransactions()
      detectReimbursements()
    } catch (e) {
      setCsvError(e instanceof Error ? e.message : t.finances.csvAiError.replace('{msg}', 'import'))
      setCsvStep('preview')
    }
  }

  const nameKeys: Record<string, string> = {
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
    categorySubscriptions:  t.finances.categorySubscriptions,
    categoryPharmacy:       t.finances.categoryPharmacy,
    categoryClothing:       t.finances.categoryClothing,
    categoryTravel:         t.finances.categoryTravel,
    categoryCoffee:         t.finances.categoryCoffee,
    categoryUtilities:      t.finances.categoryUtilities,
    categoryEducation:      t.finances.categoryEducation,
    categoryPersonalCare:   t.finances.categoryPersonalCare,
    categoryElectronics:    t.finances.categoryElectronics,
    categoryAirbnb:         t.finances.categoryAirbnb,
    categoryOther:          t.finances.categoryOther,
    categoryGifts:          t.finances.categoryGifts,
    categoryShopping:       t.finances.categoryShopping,
    categoryTaxes:          t.finances.categoryTaxes,
    categoryFees:           t.finances.categoryFees,
    categoryBarsRestaurants: t.finances.categoryBarsRestaurants,
    categoryShowsParties:    t.finances.categoryShowsParties,
    categoryPhone:           t.finances.categoryPhone,
    categoryInvestment:      t.finances.categoryInvestment,
  }

  const isHidden = (tx: Transaction) => tx.is_internal_transfer || tx.exclude_from_stats
  const expenses = transactions.filter(tx => tx.amount < 0 && !isHidden(tx)).reduce((s, tx) => s + tx.amount, 0)
  const income   = transactions.filter(tx => tx.amount > 0 && !isHidden(tx)).reduce((s, tx) => s + tx.amount, 0)
  const allSelected = transactions.length > 0 && selected.size === transactions.length
  const someSelected = selected.size > 0 && !allSelected

  type DisplayItem =
    | { kind: 'tx'; tx: Transaction }
    | { kind: 'group'; groupId: string; name: string; txs: Transaction[]; net: number }

  const filteredTransactions = useMemo(() => {
    if (!searchQuery.trim()) return transactions
    const q = searchQuery.trim().toLowerCase()
    return transactions.filter(tx => tx.description?.toLowerCase().includes(q) || tx.notes?.toLowerCase().includes(q))
  }, [transactions, searchQuery])

  const displayItems = useMemo((): DisplayItem[] => {
    const items: DisplayItem[] = []
    const seenGroups = new Set<string>()
    for (const tx of filteredTransactions) {
      if (tx.reimbursement_group_id) {
        if (!seenGroups.has(tx.reimbursement_group_id)) {
          seenGroups.add(tx.reimbursement_group_id)
          const groupTxs = transactions.filter(t => t.reimbursement_group_id === tx.reimbursement_group_id)
          const net = groupTxs.reduce((s, t) => s + t.amount, 0)
          const rawName = groups.find(g => g.id === tx.reimbursement_group_id)?.name ?? t.finances.reimbursementGroup
          const name = rawName.startsWith('auto: ') ? rawName.slice(6) : rawName
          items.push({ kind: 'group', groupId: tx.reimbursement_group_id, name, txs: groupTxs, net })
        }
      } else {
        items.push({ kind: 'tx', tx })
      }
    }
    return items
  }, [filteredTransactions, groups, t])

  return (
    <div className="space-y-5">
      {/* No-account banner */}
      {accountsLoaded && accounts.length === 0 && (
        <div className="flex items-center justify-between gap-3 bg-indigo-50 border border-indigo-100 rounded-xl px-4 py-3">
          <p className="text-sm text-indigo-700">{t.finances.noAccountBanner}</p>
          <Link to="/finances/accounts" className="shrink-0 text-sm font-medium text-indigo-600 hover:text-indigo-800 transition-colors whitespace-nowrap">
            {t.finances.noAccountCta}
          </Link>
        </div>
      )}

      {/* Header + month nav */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {/* Row 1 */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
          <div style={{ minWidth: 0, flex: 1, overflow: 'hidden' }}>
            <h1 style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 18, letterSpacing: '0.06em', color: 'var(--arvo-fg)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.finances.transactionsTitle}</h1>
            <p className="text-sm mt-0.5 hidden sm:block" style={{ color: 'var(--arvo-fg-muted)' }}>{t.finances.transactionsSubtitle}</p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
            {/* Period tabs + nav: visible on sm+, hidden on mobile */}
            {csvStep === 'idle' && (
              <div className="hidden sm:flex items-center gap-2">
                {/* Segmented period tabs */}
                <div style={{ display: 'flex', gap: 2, background: 'var(--arvo-track-bg)', borderRadius: 8, padding: 2 }}>
                  {([
                    { mode: 'month' as const, label: t.performance.month, icon: <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor"><path d="M4.75 2a.75.75 0 0 1 .75.75V4h5V2.75a.75.75 0 0 1 1.5 0V4h.25A2.75 2.75 0 0 1 15 6.75v6.5A2.75 2.75 0 0 1 12.25 16H3.75A2.75 2.75 0 0 1 1 13.25v-6.5A2.75 2.75 0 0 1 3.75 4H4V2.75A.75.75 0 0 1 4.75 2ZM2.5 7.5v5.75c0 .69.56 1.25 1.25 1.25h8.5c.69 0 1.25-.56 1.25-1.25V7.5h-11Z"/></svg>, onClick: () => setDateMode('month') },
                    { mode: 'last30' as const, label: t.performance.last30d, icon: null, onClick: setLast30Days },
                    { mode: 'range' as const, label: t.archived.period, icon: <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor"><path d="M5.75 7.5a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5ZM8 7.5a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5Zm2.25 0a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5ZM5.75 10a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5ZM8 10a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5Zm2.25 0a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5ZM4.75 2a.75.75 0 0 1 .75.75V4h5V2.75a.75.75 0 0 1 1.5 0V4h.25A2.75 2.75 0 0 1 15 6.75v6.5A2.75 2.75 0 0 1 12.25 16H3.75A2.75 2.75 0 0 1 1 13.25v-6.5A2.75 2.75 0 0 1 3.75 4H4V2.75A.75.75 0 0 1 4.75 2ZM2.5 7.5v5.75c0 .69.56 1.25 1.25 1.25h8.5c.69 0 1.25-.56 1.25-1.25V7.5h-11Z"/></svg>, onClick: () => setDateMode('range') },
                  ] as const).map(tab => (
                    <button key={tab.mode} onClick={tab.onClick} style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '4px 9px', borderRadius: 6, border: 'none', cursor: 'pointer', fontSize: 13, fontFamily: 'var(--arvo-font-body)', fontWeight: dateMode === tab.mode ? 600 : 400, background: dateMode === tab.mode ? 'var(--arvo-surface)' : 'transparent', color: dateMode === tab.mode ? 'var(--arvo-fg)' : 'var(--arvo-fg-soft)', boxShadow: dateMode === tab.mode ? '0 1px 3px rgba(0,0,0,0.10)' : 'none', transition: 'all 0.12s', whiteSpace: 'nowrap' }}>
                      {tab.icon}
                      <span>{tab.label}</span>
                    </button>
                  ))}
                </div>
                {/* Month nav or date inputs */}
                {dateMode === 'month' && (
                  <div style={{ display: 'flex', alignItems: 'center' }}>
                    <button onClick={prevMonth} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 28, height: 28, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--arvo-fg-soft)', borderRadius: 6 }}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6"/></svg>
                    </button>
                    <span style={{ fontSize: 14, fontFamily: 'var(--arvo-font-body)', fontWeight: 600, color: 'var(--arvo-fg)', minWidth: 110, textAlign: 'center', letterSpacing: '0.01em' }}>{fmtMonthFull(month)}</span>
                    <button onClick={nextMonth} disabled={month >= defaultMonth} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 28, height: 28, background: 'none', border: 'none', cursor: 'pointer', color: month >= defaultMonth ? 'var(--arvo-fg-faint)' : 'var(--arvo-fg-soft)', borderRadius: 6 }}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 18l6-6-6-6"/></svg>
                    </button>
                  </div>
                )}
                {dateMode === 'range' && (
                  <DateRangePicker
                    layout="inline"
                    startValue={dateFrom} endValue={dateTo}
                    onChangeStart={setDateFrom} onChangeEnd={setDateTo}
                    style={{ width: 'auto', padding: '6px 8px', fontSize: 13, borderRadius: 8 }}
                  />
                )}
              </div>
            )}
          {/* Filter icon with active-count badge */}
          {csvStep === 'idle' && (allCategories.length > 0 || moments.length > 0 || accounts.length > 0) && (
            <div style={{ position: 'relative' }} ref={filterPanelRef}>
              <button
                onClick={() => { setShowFilterPanel(p => !p); setShowOverflowMenu(false) }}
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 36, height: 36, border: '1px solid var(--arvo-border)', borderRadius: 10, background: activeFilterCount > 0 ? 'var(--arvo-fg)' : 'var(--arvo-surface)', color: activeFilterCount > 0 ? 'var(--arvo-pill-active-fg)' : 'var(--arvo-fg-muted)', cursor: 'pointer' }}
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="4" y1="6" x2="20" y2="6"/><line x1="8" y1="12" x2="16" y2="12"/><line x1="11" y1="18" x2="13" y2="18"/>
                </svg>
                {activeFilterCount > 0 && (
                  <span style={{ position: 'absolute', top: -5, right: -5, width: 16, height: 16, borderRadius: '50%', background: '#1B4FD8', color: '#fff', fontSize: 10, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--arvo-font-body)' }}>
                    {activeFilterCount}
                  </span>
                )}
              </button>
              {showFilterPanel && (
                <div style={{ position: 'absolute', right: 0, top: 44, zIndex: 50, background: 'var(--arvo-surface)', border: '1px solid var(--arvo-border)', borderRadius: 14, boxShadow: '0 8px 32px rgba(0,0,0,0.10)', padding: 16, minWidth: 240, display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {accounts.length > 0 && (
                    <select value={filterAccountId === '' ? '' : String(filterAccountId)} onChange={e => { const v = e.target.value; setFilterAccountId(v === '' ? '' : v === 'unassigned' ? 'unassigned' : Number(v)) }} style={{ border: '1px solid var(--arvo-border)', borderRadius: 8, padding: '8px 12px', fontSize: 14, fontFamily: 'var(--arvo-font-body)', background: 'var(--arvo-surface)', width: '100%' }}>
                      <option value="">{t.finances.allAccounts}</option>
                      <option value="unassigned">{t.finances.csvAccountNone}</option>
                      {accounts.map(a => <option key={a.id} value={a.id}>{a.icon} {a.name}</option>)}
                    </select>
                  )}
                  {allCategories.length > 0 && (
                    <select value={filterCatId} onChange={e => setFilterCatId(e.target.value === '' ? '' : Number(e.target.value))} style={{ border: '1px solid var(--arvo-border)', borderRadius: 8, padding: '8px 12px', fontSize: 14, fontFamily: 'var(--arvo-font-body)', background: 'var(--arvo-surface)', width: '100%' }}>
                      <option value="">{t.finances.allCategories}</option>
                      {allCategories.map(c => <option key={c.id} value={c.id}>{c.icon} {c.name}</option>)}
                    </select>
                  )}
                  {moments.length > 0 && (
                    <select value={filterMomentId} onChange={e => setFilterMomentId(e.target.value === '' ? '' : Number(e.target.value))} style={{ border: '1px solid var(--arvo-border)', borderRadius: 8, padding: '8px 12px', fontSize: 14, fontFamily: 'var(--arvo-font-body)', background: 'var(--arvo-surface)', width: '100%' }}>
                      <option value="">{t.finances.allMoments}</option>
                      {moments.map(m => <option key={m.id} value={m.id}>{m.icon} {m.name}</option>)}
                    </select>
                  )}
                  {activeFilterCount > 0 && (
                    <button onClick={() => { setFilterCatId(''); setFilterMomentId(''); setFilterAccountId('') }} style={{ fontSize: 13, color: 'var(--arvo-fg-soft)', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left', padding: '4px 0', fontFamily: 'var(--arvo-font-body)' }}>
                      {t.finances.clearFilters}
                    </button>
                  )}
                </div>
              )}
            </div>
          )}

          {/* CSV import — direct button */}
          {accountsLoaded && accounts.length > 0 && (
            <button
              onClick={() => { setCsvStep('idle'); setCsvRows([]); setCsvDuplicateCount(0); setCsvError(''); setCsvAiDebug(null); setShowImportModal(true) }}
              disabled={csvStep === 'parsing'}
              title={t.finances.importCSV}
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 36, height: 36, border: '1px solid var(--arvo-border)', borderRadius: 10, background: 'var(--arvo-surface)', color: 'var(--arvo-fg-muted)', cursor: 'pointer', flexShrink: 0 }}
            >
              <svg width="15" height="15" viewBox="0 0 16 16" fill="currentColor"><path d="M8.75 2.75a.75.75 0 0 0-1.5 0v5.69L5.03 6.22a.75.75 0 0 0-1.06 1.06l3.5 3.5a.75.75 0 0 0 1.06 0l3.5-3.5a.75.75 0 0 0-1.06-1.06L8.75 8.44V2.75Z"/><path d="M3.5 9.75a.75.75 0 0 0-1.5 0v1.5A2.75 2.75 0 0 0 4.75 14h6.5A2.75 2.75 0 0 0 14 11.25v-1.5a.75.75 0 0 0-1.5 0v1.5c0 .69-.56 1.25-1.25 1.25h-6.5c-.69 0-1.25-.56-1.25-1.25v-1.5Z"/></svg>
            </button>
          )}

          {/* Overflow menu — utility actions */}
          {accountsLoaded && accounts.length > 0 && (
            <div style={{ position: 'relative' }} ref={overflowMenuRef}>
              <button
                onClick={() => { setShowOverflowMenu(p => !p); setShowFilterPanel(false) }}
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 36, height: 36, border: '1px solid var(--arvo-border)', borderRadius: 10, background: 'var(--arvo-surface)', color: 'var(--arvo-fg-muted)', cursor: 'pointer' }}
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><circle cx="5" cy="12" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="19" cy="12" r="1.5"/></svg>
              </button>
              {showOverflowMenu && (
                <div style={{ position: 'absolute', right: 0, top: 44, zIndex: 50, background: 'var(--arvo-surface)', border: '1px solid var(--arvo-border)', borderRadius: 14, boxShadow: '0 8px 32px rgba(0,0,0,0.10)', padding: '6px 0', minWidth: 220 }}>
                  <button onClick={() => { setShowOverflowMenu(false); detectTransfers() }} disabled={detecting} style={menuItemStyle}>
                    <svg width="15" height="15" viewBox="0 0 16 16" fill="currentColor"><path fillRule="evenodd" d="M4 4a.75.75 0 0 1 .75-.75h6.5a.75.75 0 0 1 0 1.5h-6.5A.75.75 0 0 1 4 4Zm-1.5 4A.75.75 0 0 1 3.25 7.25h9.5a.75.75 0 0 1 0 1.5h-9.5A.75.75 0 0 1 2.5 8Zm3 4a.75.75 0 0 1 .75-.75h3.5a.75.75 0 0 1 0 1.5h-3.5A.75.75 0 0 1 5.5 12Z" clipRule="evenodd"/></svg>
                    <span>{detecting ? t.finances.detectingTransfers : (detectResult ?? t.finances.detectTransfers)}</span>
                  </button>
                  <button onClick={() => { setShowOverflowMenu(false); detectReimbursements() }} disabled={detectingReimb} style={menuItemStyle}>
                    <span style={{ fontSize: 15, lineHeight: 1 }}>↩</span>
                    <span>{detectingReimb ? t.finances.detecting : (detectReimbResult ?? t.finances.detectRefunds)}</span>
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Add button */}
          {accountsLoaded && accounts.length > 0 && (
            <button
              onClick={() => setShowAdd(true)}
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 36, height: 36, background: 'var(--arvo-fg)', color: 'var(--arvo-pill-active-fg)', border: 'none', borderRadius: 10, cursor: 'pointer', flexShrink: 0 }}
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><path d="M8.75 3.75a.75.75 0 0 0-1.5 0v3.5h-3.5a.75.75 0 0 0 0 1.5h3.5v3.5a.75.75 0 0 0 1.5 0v-3.5h3.5a.75.75 0 0 0 0-1.5h-3.5v-3.5Z"/></svg>
            </button>
          )}
          <input ref={fileRef} type="file" accept=".csv,.txt,.xls,.xlsx,.ods" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) { setShowImportModal(false); handleCSVFile(f) } e.target.value = '' }} />
        </div>
        </div>
        {/* Row 2: mobile period tabs + nav */}
        {csvStep === 'idle' && (
          <div className="flex sm:hidden items-center" style={{ gap: 8 }}>
            <div style={{ display: 'flex', gap: 2, background: 'var(--arvo-track-bg)', borderRadius: 8, padding: 2, flexShrink: 0 }}>
              {([
                { mode: 'month' as const, label: t.performance.month, icon: <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor"><path d="M4.75 2a.75.75 0 0 1 .75.75V4h5V2.75a.75.75 0 0 1 1.5 0V4h.25A2.75 2.75 0 0 1 15 6.75v6.5A2.75 2.75 0 0 1 12.25 16H3.75A2.75 2.75 0 0 1 1 13.25v-6.5A2.75 2.75 0 0 1 3.75 4H4V2.75A.75.75 0 0 1 4.75 2ZM2.5 7.5v5.75c0 .69.56 1.25 1.25 1.25h8.5c.69 0 1.25-.56 1.25-1.25V7.5h-11Z"/></svg>, onClick: () => setDateMode('month') },
                { mode: 'last30' as const, label: '30d', icon: null, onClick: setLast30Days },
                { mode: 'range' as const, label: t.archived.period, icon: <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor"><path d="M5.75 7.5a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5ZM8 7.5a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5Zm2.25 0a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5ZM5.75 10a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5ZM8 10a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5Zm2.25 0a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5ZM4.75 2a.75.75 0 0 1 .75.75V4h5V2.75a.75.75 0 0 1 1.5 0V4h.25A2.75 2.75 0 0 1 15 6.75v6.5A2.75 2.75 0 0 1 12.25 16H3.75A2.75 2.75 0 0 1 1 13.25v-6.5A2.75 2.75 0 0 1 3.75 4H4V2.75A.75.75 0 0 1 4.75 2ZM2.5 7.5v5.75c0 .69.56 1.25 1.25 1.25h8.5c.69 0 1.25-.56 1.25-1.25V7.5h-11Z"/></svg>, onClick: () => setDateMode('range') },
              ] as const).map(tab => (
                <button key={tab.mode} onClick={tab.onClick} style={{ display: 'flex', alignItems: 'center', gap: 3, padding: '4px 8px', borderRadius: 6, border: 'none', cursor: 'pointer', fontSize: 13, fontFamily: 'var(--arvo-font-body)', fontWeight: dateMode === tab.mode ? 600 : 400, background: dateMode === tab.mode ? 'var(--arvo-surface)' : 'transparent', color: dateMode === tab.mode ? 'var(--arvo-fg)' : 'var(--arvo-fg-soft)', boxShadow: dateMode === tab.mode ? '0 1px 3px rgba(0,0,0,0.10)' : 'none', transition: 'all 0.12s', whiteSpace: 'nowrap' }}>
                  {tab.icon}
                  <span>{tab.label}</span>
                </button>
              ))}
            </div>
            {dateMode === 'month' && (
              <div style={{ display: 'flex', alignItems: 'center', flex: 1, justifyContent: 'center' }}>
                <button onClick={prevMonth} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 28, height: 28, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--arvo-fg-soft)', borderRadius: 6 }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6"/></svg>
                </button>
                <span style={{ fontSize: 14, fontFamily: 'var(--arvo-font-body)', fontWeight: 600, color: 'var(--arvo-fg)', minWidth: 110, textAlign: 'center', letterSpacing: '0.01em' }}>{fmtMonthFull(month)}</span>
                <button onClick={nextMonth} disabled={month >= defaultMonth} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 28, height: 28, background: 'none', border: 'none', cursor: 'pointer', color: month >= defaultMonth ? 'var(--arvo-fg-faint)' : 'var(--arvo-fg-soft)', borderRadius: 6 }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 18l6-6-6-6"/></svg>
                </button>
              </div>
            )}
            {dateMode === 'range' && (
              <div style={{ flex: 1, minWidth: 0 }}>
                <DateRangePicker
                  layout="inline"
                  startValue={dateFrom} endValue={dateTo}
                  onChangeStart={setDateFrom} onChangeEnd={setDateTo}
                  style={{ width: 'auto', flex: 1, minWidth: 0, padding: '6px 6px', fontSize: 12, borderRadius: 8 }}
                />
              </div>
            )}
          </div>
        )}
      </div>


      {/* Active filter chips */}
      {csvStep === 'idle' && activeFilterCount > 0 && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {filterAccountId !== '' && (
            <span style={chipStyle}>
              {filterAccountId === 'unassigned' ? t.finances.csvAccountNone : (accounts.find(a => a.id === filterAccountId)?.name ?? '')}
              <button onClick={() => setFilterAccountId('')} style={chipXStyle}>✕</button>
            </span>
          )}
          {filterCatId !== '' && (
            <span style={chipStyle}>
              {allCategories.find(c => c.id === filterCatId)?.icon} {allCategories.find(c => c.id === filterCatId)?.name}
              <button onClick={() => setFilterCatId('')} style={chipXStyle}>✕</button>
            </span>
          )}
          {filterMomentId !== '' && (
            <span style={{ ...chipStyle, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
              {(() => { const fm = moments.find(m => m.id === filterMomentId); return fm ? <Icon name={resolveMomentIcon(fm.icon)} size={12} /> : null })()}
              {moments.find(m => m.id === filterMomentId)?.name}
              <button onClick={() => setFilterMomentId('')} style={chipXStyle}>✕</button>
            </span>
          )}
        </div>
      )}


      {/* CSV Error */}
      {csvError && (
        <div className="bg-red-50 border border-red-100 rounded-xl px-4 py-3 text-sm text-red-600">{csvError}</div>
      )}

      {/* CSV Parsing loader */}
      {csvStep === 'parsing' && (
        <div className="bg-[var(--arvo-surface)] rounded-2xl border border-[var(--arvo-border)] shadow-sm px-5 py-8 flex flex-col items-center gap-3">
          <svg className="animate-spin w-7 h-7 text-[var(--arvo-fg)]" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"/>
          </svg>
          <p className="text-sm font-medium text-[var(--arvo-fg)]">{t.finances.csvParsingTitle}</p>
          <p className="text-xs text-[var(--arvo-fg-soft)]">{t.finances.csvParsingHint}</p>
        </div>
      )}

      {/* CSV Preview */}
      {csvStep !== 'idle' && csvStep !== 'parsing' && csvRows.length > 0 && (
        <div className="bg-[var(--arvo-surface)] rounded-2xl border border-[var(--arvo-border)] shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-[var(--arvo-border-soft)] flex items-center justify-between flex-wrap gap-3">
            <div>
              <h3 className="font-semibold text-[var(--arvo-fg)] text-sm">
                {t.finances.csvPreview}: {csvRows.length} {t.finances.csvTransactions}
                {csvDuplicateCount > 0 && (
                  <span className="ml-2 text-xs font-normal text-[var(--arvo-fg-soft)]">({t.finances.csvAlreadyImported.replace('{n}', String(csvDuplicateCount))})</span>
                )}
              </h3>
              <p className="text-xs text-[var(--arvo-fg-soft)] mt-0.5">
                {t.finances.csvReview}
                {csvAiLoading && (
                  <span className="ml-2 text-violet-500 inline-flex items-center gap-1">
                    <svg className="animate-spin w-3 h-3" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"/></svg>
                    {t.finances.csvAiCategorizando}
                  </span>
                )}
                {!csvAiLoading && csvRows.filter(r => r.suggested_by === 'ai').length > 0 && (
                  <span className="ml-2 text-violet-500">✦ {csvRows.filter(r => r.suggested_by === 'ai').length} {t.finances.csvAiSuggested}</span>
                )}
                {!csvAiLoading && csvAiDebug && (
                  csvAiDebug.error === 'no_key'
                    ? <span className="ml-2 text-red-400">⚠ {t.finances.csvNoKeyError}</span>
                    : csvAiDebug.error
                      ? <span className="ml-2 text-red-400">⚠ {t.finances.csvAiError.replace('{msg}', csvAiDebug.error)}</span>
                      : null
                )}
              </p>
            </div>
            <div className="flex items-center gap-3 flex-wrap">
              <button
                onClick={() => setCsvFilterUncategorized(v => !v)}
                className={`text-xs px-2.5 py-1 rounded-lg border transition-colors ${csvFilterUncategorized ? 'bg-amber-50 border-amber-300 text-amber-700' : 'border-[var(--arvo-border)] text-[var(--arvo-fg-muted)] hover:bg-[var(--arvo-surface-2)]'}`}
              >
                {csvFilterUncategorized
                  ? t.finances.csvUncategorizedCount.replace('{n}', String(csvRows.filter(r => !r.category_id).length))
                  : t.finances.csvShowUncategorized}
              </button>
              {accounts.length > 0 && (
                <div className="flex items-center gap-1.5 text-xs text-[var(--arvo-fg-muted)]">
                  <span>{t.finances.csvAccount}</span>
                  <select
                    value={csvAccountId ?? ''}
                    onChange={e => setCsvAccountId(e.target.value === '' ? null : Number(e.target.value))}
                    className="border border-[var(--arvo-border)] rounded px-2 py-1 text-xs"
                  >
                    <option value="">{t.finances.csvAccountNone}</option>
                    {accounts.map(a => <option key={a.id} value={a.id}>{a.icon} {a.name}</option>)}
                  </select>
                </div>
              )}
              <button onClick={() => { setCsvStep('idle'); setCsvRows([]); setCsvDuplicateCount(0); setCsvAiDebug(null) }} className="text-xs text-[var(--arvo-fg-muted)] hover:text-[var(--arvo-fg)] transition-colors">{t.common.cancel}</button>
              <button onClick={importCSV} disabled={csvStep === 'importing'} className="px-3 py-1.5 bg-[var(--arvo-fg)] text-[var(--arvo-pill-active-fg)] text-xs rounded-lg hover:opacity-80 transition-opacity disabled:opacity-50">
                {csvStep === 'importing' ? t.finances.csvImporting : t.finances.csvConfirm}
              </button>
            </div>
          </div>
          <div className={`transition-opacity ${csvAiLoading ? 'opacity-50 pointer-events-none select-none' : ''}`}>
            {/* Mobile: card list */}
            <div className="sm:hidden divide-y divide-[var(--arvo-border-soft)] max-h-96 overflow-y-auto">
              {csvRows.map((row, i) => {
                if (csvFilterUncategorized && row.category_id) return null
                const sameDescCount = csvRows.filter(r => r.description === row.description).length
                return (
                  <div key={i} className={`px-4 py-3 ${row.is_broker_transfer ? 'bg-amber-50' : ''}`}>
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1 flex-wrap mb-0.5">
                          {row.is_broker_transfer && <span className="text-[10px] bg-amber-200 text-amber-800 rounded px-1 font-medium">{t.finances.brokerTransfer}</span>}
                          {row.suggested_by === 'transfer' && <span className="text-[10px] bg-blue-100 text-blue-700 rounded px-1 font-medium">{t.finances.csvTransferBadge}</span>}
                        </div>
                        <p className="text-sm text-[var(--arvo-fg)] truncate">{row.description}{sameDescCount > 1 && <span className="ml-1.5 text-[10px] text-[var(--arvo-fg-soft)]">×{sameDescCount}</span>}</p>
                        <p className="text-xs text-[var(--arvo-fg-soft)] mt-0.5">{fmtDate(row.date)}</p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className={`text-sm font-medium whitespace-nowrap tabular-nums ${row.amount < 0 ? 'text-[var(--arvo-fg)]' : 'arvo-delta-pos'}`}>{fmt(row.amount, row.currency)}</span>
                        <button onClick={() => setCsvRows(prev => prev.filter((_, j) => j !== i))} className="text-[var(--arvo-fg-soft)] hover:text-red-400 transition-colors">
                          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5"><path d="M5.28 4.22a.75.75 0 0 0-1.06 1.06L6.94 8l-2.72 2.72a.75.75 0 1 0 1.06 1.06L8 9.06l2.72 2.72a.75.75 0 1 0 1.06-1.06L9.06 8l2.72-2.72a.75.75 0 0 0-1.06-1.06L8 6.94 5.28 4.22Z" /></svg>
                        </button>
                      </div>
                    </div>
                    {row.manual_match && (
                      <div className="flex items-center gap-2 mb-2 px-2 py-1.5 rounded-lg text-[11px]" style={{ background: 'color-mix(in srgb, var(--arvo-gold) 12%, var(--arvo-surface))', color: 'var(--arvo-gold-text)' }}>
                        <span className="flex-1">{t.finances.csvManualMatchHint.replace('{description}', row.manual_match.description)}</span>
                        <button onClick={() => linkManualMatch(row)} className="arvo-btn arvo-btn--ghost arvo-btn--sm shrink-0">{t.finances.csvManualMatchLink}</button>
                      </div>
                    )}
                    <div className="flex items-center gap-1">
                      {row.suggested_by === 'ai' && row.category_id === row.suggested_category_id && (
                        <span title={t.common.aiSuggested} className="text-[10px] bg-violet-100 text-violet-600 rounded px-1 font-medium shrink-0">✦ IA</span>
                      )}
                      <select
                        value={row.shared_category_id != null ? `s:${row.shared_category_id}` : (row.category_id != null ? `c:${row.category_id}` : '')}
                        onChange={e => {
                          const raw = e.target.value
                          if (raw === '') {
                            setCsvRows(prev => prev.map((r, j) => j === i ? { ...r, category_id: null, shared_category_id: null } : r))
                          } else if (raw.startsWith('s:')) {
                            const val = Number(raw.slice(2))
                            setCsvRows(prev => prev.map((r, j) => j === i ? { ...r, category_id: null, shared_category_id: val } : r))
                          } else {
                            const val = Number(raw.slice(2))
                            if (sameDescCount > 1) {
                              const apply = window.confirm(t.finances.csvApplyAllConfirm.replace('{n}', String(sameDescCount)).replace('{desc}', row.description))
                              setCsvRows(prev => prev.map((r, j) => {
                                if (j === i) return { ...r, category_id: val, shared_category_id: null }
                                if (apply && r.description === row.description) return { ...r, category_id: val, shared_category_id: null }
                                return r
                              }))
                            } else {
                              setCsvRows(prev => prev.map((r, j) => j === i ? { ...r, category_id: val, shared_category_id: null } : r))
                            }
                          }
                        }}
                        className="text-xs border border-[var(--arvo-border)] rounded px-2 py-1 w-full"
                      >
                        <option value="">{t.finances.noCategory}</option>
                        {incomeCategories.length > 0 && (
                          <optgroup label={t.finances.incomeLabel}>
                            {incomeCategories.map(c => <option key={c.id} value={`c:${c.id}`}>{c.icon} {resolveKey(c.name, c.name_key, nameKeys)}</option>)}
                          </optgroup>
                        )}
                        {expenseCategories.length > 0 && (
                          <optgroup label={t.finances.expenses}>
                            {expenseCategories.map(c => <option key={c.id} value={`c:${c.id}`}>{c.icon} {resolveKey(c.name, c.name_key, nameKeys)}</option>)}
                          </optgroup>
                        )}
                        {sharedCats.length > 0 && (
                          <optgroup label={t.shared?.tagTransaction ?? 'Compartilhada'}>
                            {sharedCats.map(c => <option key={c.id} value={`s:${c.id}`}>{c.icon} {c.name}</option>)}
                          </optgroup>
                        )}
                      </select>
                    </div>
                  </div>
                )
              })}
            </div>
            {/* Desktop: table */}
            <div className="hidden sm:block overflow-x-auto max-h-96 overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="bg-[var(--arvo-surface-2)] text-[var(--arvo-fg-muted)] text-xs uppercase sticky top-0">
                <tr>
                  <th className="px-4 py-2 text-left">{t.common.date}</th>
                  <th className="px-4 py-2 text-left">{t.common.description}</th>
                  <th className="px-4 py-2 text-right">{t.common.value}</th>
                  <th className="px-4 py-2 text-left">{t.finances.category}</th>
                  <th className="px-4 py-2"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--arvo-border-soft)]">
                {csvRows.map((row, i) => {
                  if (csvFilterUncategorized && row.category_id) return null
                  const sameDescCount = csvRows.filter(r => r.description === row.description).length
                  return (
                    <tr key={i} className={row.is_broker_transfer ? 'bg-amber-50' : ''}>
                      <td className="px-4 py-2 text-[var(--arvo-fg-muted)] whitespace-nowrap">{fmtDate(row.date)}</td>
                      <td className="px-4 py-2 text-[var(--arvo-fg)] max-w-xs truncate">
                        {row.is_broker_transfer && <span className="text-[10px] bg-amber-200 text-amber-800 rounded px-1 mr-1.5 font-medium">{t.finances.brokerTransfer}</span>}
                        {row.suggested_by === 'transfer' && <span className="text-[10px] bg-blue-100 text-blue-700 rounded px-1 mr-1.5 font-medium">{t.finances.csvTransferBadge}</span>}
                        {row.description}
                        {sameDescCount > 1 && <span className="ml-1.5 text-[10px] text-[var(--arvo-fg-soft)]">×{sameDescCount}</span>}
                        {row.manual_match && (
                          <div className="mt-1 flex items-center gap-2 whitespace-normal">
                            <span className="text-[10px]" style={{ color: 'var(--arvo-gold-text)' }}>{t.finances.csvManualMatchHint.replace('{description}', row.manual_match.description)}</span>
                            <button onClick={() => linkManualMatch(row)} className="arvo-btn arvo-btn--ghost arvo-btn--sm shrink-0" style={{ fontSize: 10, padding: '2px 8px' }}>{t.finances.csvManualMatchLink}</button>
                          </div>
                        )}
                      </td>
                      <td className={`px-4 py-2 text-right font-medium whitespace-nowrap tabular-nums ${row.amount < 0 ? 'text-[var(--arvo-fg)]' : 'arvo-delta-pos'}`}>
                        {fmt(row.amount, row.currency)}
                      </td>
                      <td className="px-4 py-2">
                        <div className="flex items-center gap-1">
                          {row.suggested_by === 'ai' && row.category_id === row.suggested_category_id && (
                            <span title={t.common.aiSuggested} className="text-[10px] bg-violet-100 text-violet-600 rounded px-1 font-medium shrink-0">✦ IA</span>
                          )}
                          <select
                            value={row.shared_category_id != null ? `s:${row.shared_category_id}` : (row.category_id != null ? `c:${row.category_id}` : '')}
                            onChange={e => {
                              const raw = e.target.value
                              if (raw === '') {
                                setCsvRows(prev => prev.map((r, j) => j === i ? { ...r, category_id: null, shared_category_id: null } : r))
                              } else if (raw.startsWith('s:')) {
                                const val = Number(raw.slice(2))
                                setCsvRows(prev => prev.map((r, j) => j === i ? { ...r, category_id: null, shared_category_id: val } : r))
                              } else {
                                const val = Number(raw.slice(2))
                                if (sameDescCount > 1) {
                                  const apply = window.confirm(t.finances.csvApplyAllConfirm.replace('{n}', String(sameDescCount)).replace('{desc}', row.description))
                                  setCsvRows(prev => prev.map((r, j) => {
                                    if (j === i) return { ...r, category_id: val, shared_category_id: null }
                                    if (apply && r.description === row.description) return { ...r, category_id: val, shared_category_id: null }
                                    return r
                                  }))
                                } else {
                                  setCsvRows(prev => prev.map((r, j) => j === i ? { ...r, category_id: val, shared_category_id: null } : r))
                                }
                              }
                            }}
                            className="text-xs border border-[var(--arvo-border)] rounded px-2 py-1 max-w-[180px]"
                          >
                            <option value="">{t.finances.noCategory}</option>
                            {incomeCategories.length > 0 && (
                              <optgroup label={t.finances.incomeLabel}>
                                {incomeCategories.map(c => <option key={c.id} value={`c:${c.id}`}>{c.icon} {resolveKey(c.name, c.name_key, nameKeys)}</option>)}
                              </optgroup>
                            )}
                            {expenseCategories.length > 0 && (
                              <optgroup label={t.finances.expenses}>
                                {expenseCategories.map(c => <option key={c.id} value={`c:${c.id}`}>{c.icon} {resolveKey(c.name, c.name_key, nameKeys)}</option>)}
                              </optgroup>
                            )}
                            {sharedCats.length > 0 && (
                              <optgroup label={t.shared?.tagTransaction ?? 'Compartilhada'}>
                                {sharedCats.map(c => <option key={c.id} value={`s:${c.id}`}>{c.icon} {c.name}</option>)}
                              </optgroup>
                            )}
                          </select>
                        </div>
                      </td>
                      <td className="px-4 py-2">
                        <button onClick={() => setCsvRows(prev => prev.filter((_, j) => j !== i))} className="text-[var(--arvo-fg-soft)] hover:text-red-400 transition-colors">
                          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5"><path d="M5.28 4.22a.75.75 0 0 0-1.06 1.06L6.94 8l-2.72 2.72a.75.75 0 1 0 1.06 1.06L8 9.06l2.72 2.72a.75.75 0 1 0 1.06-1.06L9.06 8l2.72-2.72a.75.75 0 0 0-1.06-1.06L8 6.94 5.28 4.22Z" /></svg>
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
        </div>
      )}

      {/* Search bar */}
      {csvStep === 'idle' && (
        <div className="relative" ref={searchDropRef}>
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[var(--arvo-fg-soft)] pointer-events-none">
            <path fillRule="evenodd" d="M9.965 11.026a5 5 0 1 1 1.06-1.06l2.755 2.754a.75.75 0 1 1-1.06 1.06l-2.755-2.754ZM10.5 7a3.5 3.5 0 1 1-7 0 3.5 3.5 0 0 1 7 0Z" clipRule="evenodd" />
          </svg>
          <input
            type="search"
            value={searchQuery}
            onChange={e => { setSearchQuery(e.target.value); if (e.target.value.trim().length >= 2) setShowSearchDrop(true) }}
            onFocus={() => { if (searchQuery.trim().length >= 2) setShowSearchDrop(true) }}
            placeholder={t.finances.transactionsSearch}
            className="w-full pl-9 pr-4 py-2.5 text-sm border border-[var(--arvo-border)] rounded-xl bg-[var(--arvo-surface)] text-[var(--arvo-fg)] focus:outline-none focus:ring-2 focus:ring-[var(--arvo-fg)]/10"
          />
          {showSearchDrop && (
            <div className="absolute left-0 right-0 top-full mt-1 z-50 bg-[var(--arvo-surface)] border border-[var(--arvo-border)] rounded-xl shadow-lg overflow-hidden">
              {searchLoading ? (
                <div className="px-4 py-3 text-sm text-[var(--arvo-fg-soft)]">…</div>
              ) : searchResults.length === 0 ? (
                <div className="px-4 py-3 text-sm text-[var(--arvo-fg-soft)]">{t.finances.txSearchNoResults}</div>
              ) : searchResults.map(r => (
                <button
                  key={r.id}
                  type="button"
                  className="w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-[var(--arvo-surface-2)] transition-colors border-b border-[var(--arvo-border-soft)] last:border-0"
                  onClick={() => {
                    const m = r.date.slice(0, 7)
                    setDateMode('month'); setMonth(m)
                    setShowSearchDrop(false)
                  }}
                >
                  <span className="text-base shrink-0">{r.finance_categories?.icon ?? '📁'}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-[var(--arvo-fg)] truncate">{r.description}</p>
                    <p className="text-xs text-[var(--arvo-fg-soft)]">{r.date} · {r.finance_categories?.name ?? '-'}</p>
                  </div>
                  <span className={`text-sm font-semibold shrink-0 tabular-nums ${r.amount < 0 ? 'text-[var(--arvo-fg)]' : 'arvo-delta-pos'}`}>
                    {r.amount > 0 ? '+' : ''}{fmt(r.amount, r.currency)}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Summary cards */}
      {!loading && transactions.length > 0 && csvStep === 'idle' && (
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-[var(--arvo-surface)] rounded-xl border border-[var(--arvo-border)] shadow-sm p-4">
            <p className="text-xs text-[var(--arvo-fg-muted)] mb-1">{t.finances.expenses}</p>
            <p className="text-lg font-bold text-[var(--arvo-fg)] tabular-nums">{fmt(expenses)}</p>
          </div>
          <div className="bg-[var(--arvo-surface)] rounded-xl border border-[var(--arvo-border)] shadow-sm p-4">
            <p className="text-xs text-[var(--arvo-fg-muted)] mb-1">{t.finances.incomeLabel}</p>
            <p className="text-lg font-bold arvo-delta-pos tabular-nums">{fmt(income)}</p>
          </div>
        </div>
      )}

      {/* Transaction list */}
      {csvStep === 'idle' && (
        <div className="bg-[var(--arvo-surface)] rounded-2xl border border-[var(--arvo-border)] shadow-sm overflow-hidden">
          {loading ? (
            <p className="text-center text-[var(--arvo-fg-soft)] py-12 text-sm">{t.common.loading}</p>
          ) : transactions.length === 0 ? (
            <div className="py-12 text-center">
              <p className="text-2xl mb-2">📋</p>
              <p className="text-sm text-[var(--arvo-fg-muted)]">{t.finances.noTransactions}</p>
              <p className="text-xs text-[var(--arvo-fg-soft)] mt-1">{t.finances.noTransactionsHint}</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-[var(--arvo-surface-2)] text-[var(--arvo-fg-muted)] text-xs uppercase">
                  <tr className="group">
                    {/* Select-all checkbox */}
                    <th className="pl-3 pr-1 sm:pl-4 sm:pr-2 py-3 w-8">
                      <input
                        type="checkbox"
                        checked={allSelected}
                        ref={el => { if (el) el.indeterminate = someSelected }}
                        onChange={toggleSelectAll}
                        className={`rounded border-[var(--arvo-border)] accent-[var(--arvo-fg)] focus:ring-[var(--arvo-fg)]/20 cursor-pointer transition-opacity ${selected.size > 0 ? 'opacity-100' : 'opacity-100 sm:opacity-0 sm:group-hover:opacity-100'}`}
                      />
                    </th>
                    <th className="px-2 sm:px-3 py-3 text-left whitespace-nowrap">{t.common.date}</th>
                    <th className="px-2 sm:px-3 py-3 text-left">{t.common.description}</th>
                    <th className="px-2 sm:px-3 py-3 text-right whitespace-nowrap">{t.common.value}</th>
                    <th className="px-2 sm:px-3 py-3 text-left hidden sm:table-cell">{t.finances.category}</th>
                    <th className="px-2 sm:px-3 py-3 text-left hidden sm:table-cell">{t.finances.txMoment}</th>
                    <th className="px-2 sm:px-3 py-3"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--arvo-border-soft)]">
                  {displayItems.map(item => {
                    if (item.kind === 'group') {
                      const expanded = expandedGroups.has(item.groupId)
                      const groupIds = item.txs.map(t => t.id)
                      const groupAllSelected = groupIds.every(gid => selected.has(gid))
                      return (
                        <>
                          <tr key={`group-${item.groupId}`} className="hover:bg-[var(--arvo-surface-2)] transition-colors cursor-pointer" onClick={() => toggleExpandGroup(item.groupId)}>
                            <td className="pl-3 pr-1 sm:pl-4 sm:pr-2 py-2.5 w-8" onClick={e => e.stopPropagation()}>
                              <input
                                type="checkbox"
                                checked={groupAllSelected}
                                onChange={() => setSelected(prev => {
                                  const next = new Set(prev)
                                  groupIds.forEach(gid => groupAllSelected ? next.delete(gid) : next.add(gid))
                                  return next
                                })}
                                className="rounded border-[var(--arvo-border)] accent-[var(--arvo-fg)] focus:ring-[var(--arvo-fg)]/20 cursor-pointer"
                              />
                            </td>
                            <td colSpan={6} className="px-3 py-2.5">
                              <div className="flex items-center gap-2.5">
                                <svg className={`w-3 h-3 text-[var(--arvo-fg-soft)] transition-transform shrink-0 ${expanded ? 'rotate-90' : ''}`} fill="currentColor" viewBox="0 0 16 16">
                                  <path d="M6 3.5L10.5 8 6 12.5V3.5z"/>
                                </svg>
                                <Icon name="repeat" size={12} style={{ color: 'var(--arvo-fg-soft)' }} />
                                <span className="text-sm font-medium text-[var(--arvo-fg)]">{item.name}</span>
                                <span className="text-xs text-[var(--arvo-fg-soft)]">{item.txs.length} {t.shared.transactions.toLowerCase()}</span>
                                <span className={`ml-auto text-xs sm:text-sm font-semibold tabular-nums ${Math.abs(item.net) < 0.01 ? 'text-[var(--arvo-fg-soft)]' : item.net > 0 ? 'arvo-delta-pos' : 'arvo-delta-neg'}`}>
                                  {t.finances.reimbursementGroupNet}: {fmt(item.net, item.txs[0]?.currency)}
                                </span>
                                <button
                                  onClick={e => { e.stopPropagation(); deleteGroup(item.groupId) }}
                                  title={t.finances.reimbursementGroupDelete}
                                  className="p-1 text-[var(--arvo-fg-soft)] hover:text-red-400 transition-colors"
                                >
                                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5"><path fillRule="evenodd" d="M5 3.25V4H2.75a.75.75 0 0 0 0 1.5h.3l.815 8.15A1.5 1.5 0 0 0 5.357 15h5.285a1.5 1.5 0 0 0 1.493-1.35l.815-8.15h.3a.75.75 0 0 0 0-1.5H11v-.75A2.25 2.25 0 0 0 8.75 1h-1.5A2.25 2.25 0 0 0 5 3.25Z" clipRule="evenodd"/></svg>
                                </button>
                              </div>
                            </td>
                          </tr>
                          {expanded && item.txs.map(tx => (
                            <tr key={tx.id} className="bg-[var(--arvo-track-bg)] hover:bg-[var(--arvo-surface-2)] transition-colors">
                              <td className="pl-3 pr-1 py-2 w-8" />
                              <td className="px-2 sm:px-3 py-2 text-[var(--arvo-fg-soft)] whitespace-nowrap text-xs">{fmtDate(tx.date)}</td>
                              <td className="px-2 sm:px-3 py-2 text-[var(--arvo-fg-muted)] max-w-[120px] sm:max-w-xs text-xs">
                                <span className="truncate block">{tx.description || '-'}</span>
                              </td>
                              <td className={`px-2 sm:px-3 py-2 text-right text-xs font-medium whitespace-nowrap tabular-nums ${tx.amount < 0 ? 'text-[var(--arvo-fg)]' : 'arvo-delta-pos'}`}>
                                {fmt(tx.amount, tx.currency)}
                              </td>
                              <td className="px-2 sm:px-3 py-2 hidden sm:table-cell">
                                {tx.finance_categories && (
                                  <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full bg-[var(--arvo-track-bg)] text-[var(--arvo-fg-muted)]">
                                    <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: tx.finance_categories.color }} />
                                    {resolveKey(tx.finance_categories.name, tx.finance_categories.name_key, nameKeys)}
                                  </span>
                                )}
                              </td>
                              <td colSpan={2} />
                            </tr>
                          ))}
                        </>
                      )
                    }

                    const tx = item.tx
                    const isSelected = selected.has(tx.id)
                    return (
                      <tr
                        key={tx.id}
                        className={`group transition-colors ${isHidden(tx) ? 'opacity-40' : ''} ${isSelected ? 'bg-[var(--arvo-fg)]/5' : 'hover:bg-[var(--arvo-surface-2)]'}`}
                      >
                        <td className="pl-3 pr-1 sm:pl-4 sm:pr-2 py-2.5 sm:py-3 w-8">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => toggleSelect(tx.id)}
                            className={`rounded border-[var(--arvo-border)] accent-[var(--arvo-fg)] focus:ring-[var(--arvo-fg)]/20 cursor-pointer transition-opacity ${selected.size > 0 ? 'opacity-100' : 'opacity-100 sm:opacity-0 sm:group-hover:opacity-100'}`}
                          />
                        </td>
                        <td className="px-2 sm:px-3 py-2.5 sm:py-3 text-[var(--arvo-fg-muted)] whitespace-nowrap text-xs sm:text-sm">{fmtDate(tx.date)}</td>
                        <td className="px-2 sm:px-3 py-2.5 sm:py-3 text-[var(--arvo-fg)] max-w-[140px] sm:max-w-xs">
                          <span className="truncate block">{tx.description || '-'}</span>
                          <div className="flex items-center gap-1 flex-wrap mt-0.5">
                            {tx.is_internal_transfer && !tx.linked_transfer_id && (
                              <span className="text-[10px] text-[var(--arvo-fg-soft)]">{t.finances.internalTransfer}</span>
                            )}
                            {tx.linked_transfer_id && (
                              <span className="inline-flex items-center gap-0.5 text-[10px] bg-blue-50 text-blue-600 rounded px-1.5 py-0.5 font-medium">
                                {t.finances.linkedTransfer}
                                <button
                                  onClick={e => { e.stopPropagation(); unlinkTransfer(tx.id) }}
                                  title={t.finances.unlinkTransfer}
                                  className="ml-0.5 hover:text-red-500 transition-colors leading-none"
                                >×</button>
                              </span>
                            )}
                            {tx.exclude_from_stats && !tx.reimbursement_group_id && (
                              <span className="text-[10px] bg-[var(--arvo-track-bg)] text-[var(--arvo-fg-muted)] rounded px-1.5 py-0.5 font-medium">{t.finances.excludedBadge}</span>
                            )}
                            {tx.reimbursement_group_id && (() => {
                              const rawName = groups.find(g => g.id === tx.reimbursement_group_id)?.name ?? t.finances.reimbursementGroup
                              return (
                                <span className="text-[10px] bg-[var(--arvo-track-bg)] text-[var(--arvo-fg-muted)] rounded px-1.5 py-0.5 font-medium">
                                  {rawName.startsWith('auto: ') ? rawName.slice(6) : rawName}
                                </span>
                              )
                            })()}
                            {/* Moment badges — only visible on mobile where the moment column is hidden */}
                            {tx.moments.length > 0 && tx.moments.map(m => (
                              <span
                                key={m.id}
                                className="md:hidden inline-flex items-center px-1 py-0.5 rounded-full font-medium cursor-pointer"
                                style={{ backgroundColor: m.color + '22', color: m.color }}
                                onClick={() => { setSelected(new Set([tx.id])); setShowMomentDropdown(true) }}
                                title={m.name}
                              >
                                <Icon name={resolveMomentIcon(m.icon)} size={11} />
                              </span>
                            ))}
                            {/* Category chip — only on mobile where the category column is hidden */}
                            <button
                              className="sm:hidden text-left"
                              onClick={e => { e.stopPropagation(); setEditSheetTx(tx); setSheetCatId(tx.category_id); setSheetSharedCatId(tx.shared_category_id) }}
                            >
                              {tx.finance_categories ? (
                                <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full font-medium bg-[var(--arvo-track-bg)] text-[var(--arvo-fg-muted)]">
                                  <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: tx.finance_categories.color }} />
                                  {resolveKey(tx.finance_categories.name, tx.finance_categories.name_key, nameKeys)}
                                </span>
                              ) : (
                                <span className="text-[10px] text-[var(--arvo-fg-soft)]">+ {t.finances.category}</span>
                              )}
                            </button>
                          </div>
                          {editingNotesId === tx.id ? (
                            <input
                              autoFocus
                              type="text"
                              value={notesInput}
                              onChange={e => setNotesInput(e.target.value)}
                              onBlur={() => saveNotes(tx.id, notesInput)}
                              onKeyDown={e => { if (e.key === 'Enter') saveNotes(tx.id, notesInput); if (e.key === 'Escape') setEditingNotesId(null) }}
                              placeholder={t.finances.notesPlaceholder}
                              className="mt-1 w-full text-xs text-[var(--arvo-fg-muted)] border-b border-[var(--arvo-border)] bg-transparent outline-none placeholder-gray-300"
                            />
                          ) : tx.notes ? (
                            <span
                              className="block text-[11px] text-[var(--arvo-fg-soft)] italic mt-0.5 truncate cursor-pointer hover:text-[var(--arvo-fg-muted)]"
                              onClick={() => { setEditingNotesId(tx.id); setNotesInput(tx.notes ?? '') }}
                            >{tx.notes}</span>
                          ) : null}
                        </td>
                        <td className={`px-2 sm:px-3 py-2.5 sm:py-3 text-right font-medium whitespace-nowrap text-xs sm:text-sm tabular-nums ${tx.amount < 0 ? 'text-[var(--arvo-fg)]' : 'arvo-delta-pos'}`}>
                          {fmt(tx.amount, tx.currency)}
                        </td>
                        <td className="px-2 sm:px-3 py-2.5 sm:py-3 hidden sm:table-cell">
                          {editingId === tx.id ? (
                            <select
                              autoFocus
                              defaultValue={tx.category_id ?? ''}
                              onBlur={() => setEditingId(null)}
                              onChange={e => updateCategory(tx.id, e.target.value === '' ? null : Number(e.target.value))}
                              className="text-xs border border-[var(--arvo-border)] rounded px-2 py-1 max-w-[150px]"
                            >
                              <option value="">{t.finances.noCategory}</option>
                              {incomeCategories.length > 0 && (
                                <optgroup label={t.finances.incomeLabel}>
                                  {incomeCategories.map(c => <option key={c.id} value={c.id}>{c.icon} {resolveKey(c.name, c.name_key, nameKeys)}</option>)}
                                </optgroup>
                              )}
                              {expenseCategories.length > 0 && (
                                <optgroup label={t.finances.expenses}>
                                  {expenseCategories.map(c => <option key={c.id} value={c.id}>{c.icon} {resolveKey(c.name, c.name_key, nameKeys)}</option>)}
                                </optgroup>
                              )}
                            </select>
                          ) : (
                            <button onClick={() => setEditingId(tx.id)} className="flex items-center gap-1.5 group/cat">
                              {tx.finance_categories ? (
                                <span className="inline-flex items-center gap-1.5 text-xs px-2 py-0.5 rounded-full font-medium bg-[var(--arvo-track-bg)] text-[var(--arvo-fg-muted)]">
                                  <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: tx.finance_categories.color }} />
                                  {resolveKey(tx.finance_categories.name, tx.finance_categories.name_key, nameKeys)}
                                </span>
                              ) : (
                                <span className="text-xs text-[var(--arvo-fg-soft)] [@media(hover:hover)]:text-[var(--arvo-fg-faint)] group-hover/cat:text-[var(--arvo-fg-muted)] transition-colors">+ {t.finances.category}</span>
                              )}
                            </button>
                          )}
                        </td>
                        {/* Moment badge */}
                        <td className="px-2 sm:px-3 py-2.5 sm:py-3 hidden sm:table-cell">
                          {tx.moments.length > 0 ? (
                            <div className="flex items-center gap-1 flex-wrap">
                              {tx.moments.map(m => (
                                <span
                                  key={m.id}
                                  className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium cursor-pointer hover:opacity-80"
                                  style={{ backgroundColor: m.color + '22', color: m.color }}
                                  onClick={() => { setSelected(new Set([tx.id])); setShowMomentDropdown(true) }}
                                >
                                  <Icon name={resolveMomentIcon(m.icon)} size={12} /> {m.name}
                                </span>
                              ))}
                            </div>
                          ) : (
                            <span
                              className="text-xs text-[var(--arvo-fg-soft)] [@media(hover:hover)]:text-[var(--arvo-fg-faint)] group-hover:text-[var(--arvo-fg-soft)] transition-colors cursor-pointer"
                              onClick={() => { setSelected(new Set([tx.id])); setShowMomentDropdown(true) }}
                            >-</span>
                          )}
                        </td>
                        <td className="px-1 sm:px-3 py-2.5 sm:py-3">
                          {/* Desktop: icon row, revealed on row hover */}
                          <div className={`hidden sm:flex items-center gap-1 transition-opacity ${tx.exclude_from_stats || tx.is_internal_transfer ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}>
                            {/* Note */}
                            <button
                              onClick={() => { setEditingNotesId(tx.id); setNotesInput(tx.notes ?? '') }}
                              title={t.finances.notesPlaceholder}
                              className={`p-2 rounded-lg transition-colors ${tx.notes ? 'text-[var(--arvo-fg)] hover:bg-[var(--arvo-fg)]/10' : 'text-[var(--arvo-fg-soft)] hover:text-[var(--arvo-fg)] hover:bg-[var(--arvo-fg)]/10'}`}
                            >
                              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-4 h-4"><path d="M13.488 2.513a1.75 1.75 0 0 0-2.475 0L6.75 6.774a2.75 2.75 0 0 0-.596.892l-.471 1.179a.75.75 0 0 0 .98.98l1.179-.471a2.75 2.75 0 0 0 .892-.596l4.262-4.263a1.75 1.75 0 0 0 0-2.475ZM3.5 4.75A.75.75 0 0 1 4.25 4h3a.75.75 0 0 1 0 1.5h-3a.75.75 0 0 1-.75-.75Zm0 3A.75.75 0 0 1 4.25 7h1.5a.75.75 0 0 1 0 1.5h-1.5A.75.75 0 0 1 3.5 7.75ZM2 3.5A1.5 1.5 0 0 1 3.5 2h9A1.5 1.5 0 0 1 14 3.5V5a.75.75 0 0 1-1.5 0V3.5a.75.75 0 0 0-.75-.75h-9A.75.75 0 0 0 2 3.5V12a.75.75 0 0 0 .75.75H6a.75.75 0 0 1 0 1.5H2.75A1.5 1.5 0 0 1 2 12.75V3.5Z"/></svg>
                            </button>
                            {/* Exclude/include from stats */}
                            <button
                              onClick={() => toggleExclude(tx.id, tx.exclude_from_stats)}
                              title={tx.exclude_from_stats ? t.finances.includeInStats : t.finances.excludeFromStats}
                              className={`p-2 rounded-lg transition-colors ${tx.exclude_from_stats ? 'text-amber-500 hover:text-amber-700 hover:bg-amber-50' : 'text-[var(--arvo-fg-soft)] hover:text-amber-500 hover:bg-amber-50'}`}
                            >
                              {tx.exclude_from_stats ? (
                                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-4 h-4"><path d="M8 9.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3Z"/><path d="M1.38 8a6.998 6.998 0 0 1 13.24 0 7 7 0 0 1-13.24 0ZM8 5.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5Z"/></svg>
                              ) : (
                                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-4 h-4"><path d="M3.28 2.22a.75.75 0 0 0-1.06 1.06l10.5 10.5a.75.75 0 1 0 1.06-1.06l-1.36-1.36A7.5 7.5 0 0 0 14.47 8a7.5 7.5 0 0 0-9.74-4.71L3.28 2.22ZM7.53 6.47l2 2A2 2 0 0 1 7.53 6.47ZM8 3.5c.98 0 1.91.22 2.74.62L9.47 5.39A4.5 4.5 0 0 0 3.54 9.46l-1.45 1.45A7.5 7.5 0 0 1 1.53 8 7.5 7.5 0 0 1 8 3.5ZM4.5 8c0-.46.08-.9.23-1.31l4.58 4.58A3.5 3.5 0 0 1 4.5 8Z"/></svg>
                              )}
                            </button>
                            {/* Transfer toggle */}
                            <button
                              onClick={() => toggleInternal(tx.id, tx.is_internal_transfer)}
                              title={tx.is_internal_transfer ? t.finances.markAsReal : t.finances.markAsTransfer}
                              className={`p-2 rounded-lg transition-colors ${tx.is_internal_transfer ? 'text-blue-500 hover:bg-blue-50' : 'text-[var(--arvo-fg-soft)] hover:text-blue-500 hover:bg-blue-50'}`}
                            >
                              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-4 h-4"><path fillRule="evenodd" d="M13.78 4.22a.75.75 0 0 1 0 1.06l-7.25 7.25a.75.75 0 0 1-1.06 0L2.22 9.28a.75.75 0 0 1 1.06-1.06L6 10.94l6.72-6.72a.75.75 0 0 1 1.06 0Z" clipRule="evenodd" /></svg>
                            </button>
                            {/* Split with friend — só faz sentido pra transação ainda sem Momento */}
                            {tx.moments.length === 0 && (
                              <button onClick={() => setSplitPickerTx(tx)} title={t.finances.expenseSplitShort} className="p-2 rounded-lg text-[var(--arvo-fg-soft)] hover:text-[var(--arvo-fg)] hover:bg-[var(--arvo-fg)]/10 transition-colors">
                                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-4 h-4"><path strokeLinecap="round" strokeLinejoin="round" d="M2 4.5h6M2 4.5l2.2-2.2M2 4.5l2.2 2.2M14 11.5H6M14 11.5l-2.2-2.2M14 11.5l-2.2 2.2"/></svg>
                              </button>
                            )}
                            {/* Delete */}
                            <button onClick={() => deleteTransaction(tx.id)} title={t.common.delete} className="p-2 rounded-lg text-[var(--arvo-fg-soft)] hover:text-red-500 hover:bg-red-50 transition-colors">
                              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-4 h-4"><path fillRule="evenodd" d="M5 3.25V4H2.75a.75.75 0 0 0 0 1.5h.3l.815 8.15A1.5 1.5 0 0 0 5.357 15h5.285a1.5 1.5 0 0 0 1.493-1.35l.815-8.15h.3a.75.75 0 0 0 0-1.5H11v-.75A2.25 2.25 0 0 0 8.75 1h-1.5A2.25 2.25 0 0 0 5 3.25Zm2.25-.75a.75.75 0 0 0-.75.75V4h3v-.75a.75.75 0 0 0-.75-.75h-1.5ZM6.05 6a.75.75 0 0 1 .787.713l.275 5.5a.75.75 0 0 1-1.498.075l-.275-5.5A.75.75 0 0 1 6.05 6Zm3.9 0a.75.75 0 0 1 .712.787l-.275 5.5a.75.75 0 0 1-1.498-.075l.275-5.5a.75.75 0 0 1 .786-.712Z" clipRule="evenodd" /></svg>
                            </button>
                          </div>
                          {/* Mobile: single kebab menu with the same 4 actions */}
                          <div className="sm:hidden relative" ref={mobileActionsTxId === tx.id ? mobileActionsRef : null}>
                            <button
                              onClick={() => setMobileActionsTxId(p => p === tx.id ? null : tx.id)}
                              title="Ações"
                              className={`p-2 rounded-lg transition-colors ${tx.exclude_from_stats || tx.is_internal_transfer || tx.notes ? 'text-[var(--arvo-fg-muted)]' : 'text-[var(--arvo-fg-soft)]'}`}
                            >
                              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-4 h-4"><circle cx="8" cy="2.5" r="1.25"/><circle cx="8" cy="8" r="1.25"/><circle cx="8" cy="13.5" r="1.25"/></svg>
                            </button>
                            {mobileActionsTxId === tx.id && (
                              <div className="absolute right-0 top-full mt-1 z-50 bg-[var(--arvo-surface)] border border-[var(--arvo-border)] rounded-xl shadow-lg py-1 min-w-[200px]">
                                <button onClick={() => { setEditingNotesId(tx.id); setNotesInput(tx.notes ?? ''); setMobileActionsTxId(null) }} style={menuItemStyle}>
                                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-4 h-4 shrink-0"><path d="M13.488 2.513a1.75 1.75 0 0 0-2.475 0L6.75 6.774a2.75 2.75 0 0 0-.596.892l-.471 1.179a.75.75 0 0 0 .98.98l1.179-.471a2.75 2.75 0 0 0 .892-.596l4.262-4.263a1.75 1.75 0 0 0 0-2.475ZM3.5 4.75A.75.75 0 0 1 4.25 4h3a.75.75 0 0 1 0 1.5h-3a.75.75 0 0 1-.75-.75Zm0 3A.75.75 0 0 1 4.25 7h1.5a.75.75 0 0 1 0 1.5h-1.5A.75.75 0 0 1 3.5 7.75ZM2 3.5A1.5 1.5 0 0 1 3.5 2h9A1.5 1.5 0 0 1 14 3.5V5a.75.75 0 0 1-1.5 0V3.5a.75.75 0 0 0-.75-.75h-9A.75.75 0 0 0 2 3.5V12a.75.75 0 0 0 .75.75H6a.75.75 0 0 1 0 1.5H2.75A1.5 1.5 0 0 1 2 12.75V3.5Z"/></svg>
                                  <span>{t.finances.notesPlaceholder}</span>
                                </button>
                                <button onClick={() => { toggleExclude(tx.id, tx.exclude_from_stats); setMobileActionsTxId(null) }} style={menuItemStyle}>
                                  {tx.exclude_from_stats ? (
                                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-4 h-4 shrink-0"><path d="M8 9.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3Z"/><path d="M1.38 8a6.998 6.998 0 0 1 13.24 0 7 7 0 0 1-13.24 0ZM8 5.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5Z"/></svg>
                                  ) : (
                                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-4 h-4 shrink-0"><path d="M3.28 2.22a.75.75 0 0 0-1.06 1.06l10.5 10.5a.75.75 0 1 0 1.06-1.06l-1.36-1.36A7.5 7.5 0 0 0 14.47 8a7.5 7.5 0 0 0-9.74-4.71L3.28 2.22ZM7.53 6.47l2 2A2 2 0 0 1 7.53 6.47ZM8 3.5c.98 0 1.91.22 2.74.62L9.47 5.39A4.5 4.5 0 0 0 3.54 9.46l-1.45 1.45A7.5 7.5 0 0 1 1.53 8 7.5 7.5 0 0 1 8 3.5ZM4.5 8c0-.46.08-.9.23-1.31l4.58 4.58A3.5 3.5 0 0 1 4.5 8Z"/></svg>
                                  )}
                                  <span>{tx.exclude_from_stats ? t.finances.includeInStats : t.finances.excludeFromStats}</span>
                                </button>
                                <button onClick={() => { toggleInternal(tx.id, tx.is_internal_transfer); setMobileActionsTxId(null) }} style={menuItemStyle}>
                                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-4 h-4 shrink-0"><path fillRule="evenodd" d="M13.78 4.22a.75.75 0 0 1 0 1.06l-7.25 7.25a.75.75 0 0 1-1.06 0L2.22 9.28a.75.75 0 0 1 1.06-1.06L6 10.94l6.72-6.72a.75.75 0 0 1 1.06 0Z" clipRule="evenodd" /></svg>
                                  <span>{tx.is_internal_transfer ? t.finances.markAsReal : t.finances.markAsTransfer}</span>
                                </button>
                                {tx.moments.length === 0 && (
                                  <button onClick={() => { setSplitPickerTx(tx); setMobileActionsTxId(null) }} style={menuItemStyle}>
                                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-4 h-4 shrink-0"><path strokeLinecap="round" strokeLinejoin="round" d="M2 4.5h6M2 4.5l2.2-2.2M2 4.5l2.2 2.2M14 11.5H6M14 11.5l-2.2-2.2M14 11.5l-2.2 2.2"/></svg>
                                    <span>{t.finances.expenseSplitShort}</span>
                                  </button>
                                )}
                                <button onClick={() => { deleteTransaction(tx.id); setMobileActionsTxId(null) }} style={{ ...menuItemStyle, color: 'var(--arvo-red)' }}>
                                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-4 h-4 shrink-0"><path fillRule="evenodd" d="M5 3.25V4H2.75a.75.75 0 0 0 0 1.5h.3l.815 8.15A1.5 1.5 0 0 0 5.357 15h5.285a1.5 1.5 0 0 0 1.493-1.35l.815-8.15h.3a.75.75 0 0 0 0-1.5H11v-.75A2.25 2.25 0 0 0 8.75 1h-1.5A2.25 2.25 0 0 0 5 3.25Zm2.25-.75a.75.75 0 0 0-.75.75V4h3v-.75a.75.75 0 0 0-.75-.75h-1.5ZM6.05 6a.75.75 0 0 1 .787.713l.275 5.5a.75.75 0 0 1-1.498.075l-.275-5.5A.75.75 0 0 1 6.05 6Zm3.9 0a.75.75 0 0 1 .712.787l-.275 5.5a.75.75 0 0 1-1.498-.075l.275-5.5a.75.75 0 0 1 .786-.712Z" clipRule="evenodd" /></svg>
                                  <span>{t.common.delete}</span>
                                </button>
                              </div>
                            )}
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>

              </table>
            </div>
          )}
        </div>
      )}

      {/* ── Floating multi-select action bar ── */}
      {selected.size > 0 && csvStep === 'idle' && (
        <div className="fixed bottom-[160px] sm:bottom-6 left-1/2 -translate-x-1/2 z-40 flex items-center flex-nowrap justify-center gap-1.5 sm:gap-3 bg-[var(--arvo-surface)] text-[var(--arvo-fg)] border border-[var(--arvo-border)] px-2.5 sm:px-4 py-2 sm:py-3 rounded-2xl shadow-2xl max-w-[calc(100%-32px)]">
          <span className="text-sm font-medium shrink-0">{selected.size}<span className="hidden sm:inline"> sel.</span></span>
          <div className="hidden sm:block w-px h-4 bg-[var(--arvo-border)] shrink-0" />

          {/* Moment picker */}
          <div ref={momentDropdownRef} className="relative shrink-0">
            <button
              onClick={() => setShowMomentDropdown(v => !v)}
              disabled={assigning}
              className="flex items-center gap-1 sm:gap-1.5 text-sm bg-[var(--arvo-fg)]/5 hover:bg-[var(--arvo-fg)]/10 transition-colors px-2.5 sm:px-3 py-1.5 rounded-xl disabled:opacity-50"
            >
              <span>✨</span>
              <span className="hidden sm:inline">{t.finances.assignMoment}</span>
              <svg className={`w-3 h-3 transition-transform ${showMomentDropdown ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            {showMomentDropdown && (
              <div className="absolute bottom-full mb-2 left-0 bg-[var(--arvo-surface)] rounded-xl shadow-xl border border-[var(--arvo-border)] py-1.5 min-w-[200px] max-h-60 overflow-y-auto z-50">
                {moments.length === 0 ? (
                  <p className="px-4 py-2 text-xs" style={{ color: 'var(--arvo-fg-soft)' }}>{t.finances.txNoMoment}</p>
                ) : (
                  moments.map(m => {
                    const assignedCount = Array.from(selected).filter(id =>
                      transactions.find(t => t.id === id)?.moments.some(mom => mom.id === m.id)
                    ).length
                    const allHave  = assignedCount === selected.size
                    const someHave = assignedCount > 0 && !allHave
                    return (
                      <button
                        key={m.id}
                        onClick={() => bulkToggleMoment(m.id)}
                        className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-[var(--arvo-fg)] hover:bg-[var(--arvo-surface-2)] transition-colors"
                      >
                        <Icon name={resolveMomentIcon(m.icon)} size={16} style={{ color: m.color }} />
                        <span className="flex-1 text-left">{m.name}</span>
                        {allHave  && <span className="text-[10px] text-emerald-500 font-bold">✓</span>}
                        {someHave && <span className="text-[10px] text-[var(--arvo-fg-soft)]">−</span>}
                      </button>
                    )
                  })
                )}
                <div className="border-t border-[var(--arvo-border)] mt-1 pt-1">
                  <button
                    onClick={() => bulkToggleMoment(null)}
                    className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-[var(--arvo-fg-soft)] hover:bg-[var(--arvo-surface-2)] transition-colors"
                  >
                    <span>✕</span>
                    <span>{t.finances.noMoment}</span>
                  </button>
                </div>
              </div>
            )}
          </div>

          {accounts.length > 0 && (
            <div className="relative shrink-0">
              <button
                onClick={() => setShowAccountAssign(v => !v)}
                disabled={assigningAccount}
                className="flex items-center gap-1 sm:gap-1.5 text-sm bg-[var(--arvo-fg)]/5 hover:bg-[var(--arvo-fg)]/10 transition-colors px-2.5 sm:px-3 py-1.5 rounded-xl disabled:opacity-50"
              >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-4 h-4 shrink-0"><path d="M14 3a1 1 0 0 0-1-1H3a1 1 0 0 0-1 1v2a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1V3ZM2 8a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v2a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V8Z"/></svg>
                <span className="hidden sm:inline">{assigningAccount ? t.finances.bulkAssigning : t.finances.bulkAccount}</span>
                <svg className={`w-3 h-3 transition-transform ${showAccountAssign ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                </svg>
              </button>
              {showAccountAssign && (
                <div className="absolute bottom-full mb-2 left-0 bg-[var(--arvo-surface)] rounded-xl shadow-xl border border-[var(--arvo-border)] py-1.5 min-w-[180px] max-h-60 overflow-y-auto z-50">
                  <p className="px-4 py-1.5 text-[10px] text-[var(--arvo-fg-soft)] uppercase tracking-wide font-medium">Atribuir conta</p>
                  {accounts.map(a => (
                    <button
                      key={a.id}
                      onClick={() => bulkAssignAccount(a.id)}
                      className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-[var(--arvo-fg)] hover:bg-[var(--arvo-surface-2)] transition-colors"
                    >
                      <span>{a.icon}</span>
                      <span>{a.name}</span>
                    </button>
                  ))}
                  <div className="border-t border-[var(--arvo-border)] mt-1 pt-1">
                    <button
                      onClick={() => bulkAssignAccount(null)}
                      className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-[var(--arvo-fg-soft)] hover:bg-[var(--arvo-surface-2)] transition-colors"
                    >
                      <span>✕</span>
                      <span>Remover conta</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Reimbursement: create new group or add to existing */}
          <div className="relative shrink-0">
            <button
              onClick={() => groups.filter(g => !g.name.startsWith('auto: ')).length > 0 ? setShowGroupPicker(v => !v) : setShowGroupModal(true)}
              disabled={addingToGroup}
              className="flex items-center gap-1 sm:gap-1.5 text-sm bg-[var(--arvo-fg)]/5 hover:bg-[var(--arvo-fg)]/10 transition-colors px-2.5 sm:px-3 py-1.5 rounded-xl disabled:opacity-50"
            >
              <span>↩</span>
              <span className="hidden sm:inline">{t.finances.createReimbursementGroup}</span>
              {groups.filter(g => !g.name.startsWith('auto: ')).length > 0 && (
                <svg className={`w-3 h-3 transition-transform ${showGroupPicker ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                </svg>
              )}
            </button>
            {showGroupPicker && (
              <div ref={groupPickerRef} className="absolute bottom-full mb-1 left-1/2 -translate-x-1/2 sm:left-0 sm:translate-x-0 min-w-[200px] max-w-[calc(100vw-32px)] max-h-56 overflow-y-auto bg-[var(--arvo-surface)] rounded-xl shadow-lg border border-[var(--arvo-border)] py-1 z-50">
                <p className="px-3 py-1.5 text-[11px] font-semibold text-[var(--arvo-fg-soft)] uppercase tracking-wide">{t.finances.addToGroupSelect}</p>
                {groups.filter(g => !g.name.startsWith('auto: ')).map(g => (
                  <button
                    key={g.id}
                    onClick={() => addToGroup(g.id)}
                    className="w-full text-left px-3 py-2 text-sm text-[var(--arvo-fg)] hover:bg-[var(--arvo-surface-2)] transition-colors truncate"
                  >
                    {g.name}
                  </button>
                ))}
                <div className="border-t border-[var(--arvo-border)] mt-1 pt-1">
                  <button
                    onClick={() => { setShowGroupPicker(false); setShowGroupModal(true) }}
                    className="w-full flex items-center gap-2 px-3 py-2 text-sm text-[var(--arvo-fg-muted)] hover:bg-[var(--arvo-surface-2)] transition-colors"
                  >
                    <span>+</span>
                    <span>{t.finances.createReimbursementGroup}</span>
                  </button>
                </div>
              </div>
            )}
          </div>

          <div className="w-px h-4 bg-[var(--arvo-border)] shrink-0" />
          <button
            onClick={() => setSelected(new Set())}
            className="text-sm text-[var(--arvo-fg-soft)] hover:text-[var(--arvo-fg)] transition-colors shrink-0"
          >
            {t.common.cancel}
          </button>
        </div>
      )}

      {/* Reimbursement group modal */}
      {showGroupModal && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 sm:px-4" onClick={() => setShowGroupModal(false)}>
          <div className="bg-[var(--arvo-surface)] rounded-t-2xl sm:rounded-2xl shadow-xl w-full sm:max-w-sm max-h-[92vh] sm:max-h-[90vh] overflow-y-auto p-6" style={{ paddingBottom: 'calc(24px + env(safe-area-inset-bottom, 0px))' }} onClick={e => e.stopPropagation()}>
            <h3 className="font-semibold text-[var(--arvo-fg)] mb-1">{t.finances.createReimbursementGroup}</h3>
            <p className="text-xs text-[var(--arvo-fg-soft)] mb-4">{selected.size} transação(ões) selecionada(s)</p>
            <input
              autoFocus
              value={groupName}
              onChange={e => setGroupName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && createReimbursementGroup()}
              placeholder={t.finances.reimbursementGroupNamePlaceholder}
              className="w-full border border-[var(--arvo-border)] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--arvo-fg)]/20 mb-4"
            />
            <div className="flex gap-2">
              <button
                onClick={createReimbursementGroup}
                disabled={savingGroup || !groupName.trim()}
                className="flex-1 bg-[var(--arvo-fg)] text-[var(--arvo-pill-active-fg)] text-sm py-2 rounded-xl hover:opacity-80 transition-opacity disabled:opacity-40"
              >
                {savingGroup ? '…' : t.finances.createReimbursementGroup}
              </button>
              <button onClick={() => setShowGroupModal(false)} className="px-4 text-sm text-[var(--arvo-fg-muted)] hover:text-[var(--arvo-fg)]">{t.common.cancel}</button>
            </div>
          </div>
        </div>
      )}

      {/* Reimbursement groups management panel */}
      {csvStep === 'idle' && (
        <div className="bg-[var(--arvo-surface)] rounded-2xl border border-[var(--arvo-border)] shadow-sm overflow-hidden">
          <button
            onClick={() => setShowGroupHelp(v => !v)}
            className="w-full px-5 py-3 flex items-center gap-2 text-left hover:bg-[var(--arvo-surface-2)] transition-colors"
          >
            <span className="text-sm font-semibold text-[var(--arvo-fg)] flex-1">{t.finances.reimbursementGroup}</span>
            <span className="text-xs text-[var(--arvo-fg-soft)]">{groups.length > 0 ? t.finances.reimbursementGroupCount.replace('{n}', String(groups.length)) : t.finances.reimbursementHowWorks}</span>
            <svg className={`w-4 h-4 text-[var(--arvo-fg-soft)] transition-transform ${showGroupHelp ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7"/></svg>
          </button>

          {showGroupHelp && (
            <div className="border-t border-[var(--arvo-border-soft)]">
              {/* Manual groups */}
              {(() => {
                const isAuto = (g: ReimbursementGroup) => g.name.startsWith('auto: ')
                const displayName = (g: ReimbursementGroup) => isAuto(g) ? g.name.slice(6) : g.name
                const manualGroups = groups.filter(g => !isAuto(g))
                const autoGroups   = groups.filter(g =>  isAuto(g))

                const latestDate = (g: ReimbursementGroup) =>
                  g.transactions.reduce((max, tx) => tx.date > max ? tx.date : max, '')
                const currentYM = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`
                const thirtyDaysAgo = new Date(today)
                thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)
                const thirtyDaysAgoStr = thirtyDaysAgo.toISOString().split('T')[0]
                const isRecent = (g: ReimbursementGroup) => {
                  const d = latestDate(g)
                  return !d || d >= thirtyDaysAgoStr || d.slice(0, 7) === currentYM
                }
                const recentManualGroups = manualGroups.filter(isRecent)
                const olderManualGroups  = manualGroups.filter(g => !isRecent(g))

                const renderGroup = (g: ReimbursementGroup, nested = false) => (
                  <div key={g.id} className={nested ? 'py-3 first:pt-0' : 'px-5 py-3'}>
                    <div className="flex items-center gap-2 mb-2">
                      {editingGroupId === g.id ? (
                        <input
                          autoFocus
                          value={editingGroupNameInput}
                          onChange={e => setEditingGroupNameInput(e.target.value)}
                          onBlur={() => renameGroup(g.id, editingGroupNameInput)}
                          onKeyDown={e => {
                            if (e.key === 'Enter') renameGroup(g.id, editingGroupNameInput)
                            if (e.key === 'Escape') setEditingGroupId(null)
                          }}
                          className="flex-1 text-sm font-medium border-b border-[var(--arvo-fg)] bg-transparent outline-none"
                        />
                      ) : (
                        <button
                          onClick={() => { setEditingGroupId(g.id); setEditingGroupNameInput(g.name) }}
                          className="flex-1 text-sm font-medium text-[var(--arvo-fg)] text-left hover:text-[var(--arvo-fg)] transition-colors"
                          title={t.finances.groupRename}
                        >
                          {displayName(g)}
                        </button>
                      )}
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full tabular-nums ${Math.abs(g.net) < 0.01 ? 'bg-[var(--arvo-track-bg)] text-[var(--arvo-fg-muted)]' : g.net > 0 ? 'bg-[var(--arvo-green-tint)] arvo-delta-pos' : 'bg-[var(--arvo-border-soft)] text-[var(--arvo-fg)]'}`}>
                        {g.net >= 0 ? '+' : ''}{fmt(g.net, g.transactions[0]?.currency ?? 'EUR')}
                      </span>
                      <button
                        onClick={() => deleteGroup(g.id)}
                        title={t.finances.groupDelete}
                        className="p-1 text-[var(--arvo-fg-soft)] hover:text-red-400 transition-colors"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5"><path fillRule="evenodd" d="M5 3.25V4H2.75a.75.75 0 0 0 0 1.5h.3l.815 8.15A1.5 1.5 0 0 0 5.357 15h5.285a1.5 1.5 0 0 0 1.493-1.35l.815-8.15h.3a.75.75 0 0 0 0-1.5H11v-.75A2.25 2.25 0 0 0 8.75 1h-1.5A2.25 2.25 0 0 0 5 3.25Z" clipRule="evenodd"/></svg>
                      </button>
                    </div>
                    <div className="space-y-1">
                      {g.transactions.map(tx => (
                        <div key={tx.id} className="flex items-center gap-2 text-xs text-[var(--arvo-fg-muted)] pl-2">
                          <span className="text-[var(--arvo-fg-faint)]">·</span>
                          <span className="flex-1 truncate">{tx.description}</span>
                          <span className={`font-medium tabular-nums ${tx.amount < 0 ? 'text-[var(--arvo-fg)]' : 'arvo-delta-pos'}`}>{fmt(tx.amount, tx.currency)}</span>
                          <button
                            onClick={() => removeFromGroup(g.id, tx.id)}
                            title={t.finances.removeFromGroup}
                            className="p-0.5 text-[var(--arvo-fg-soft)] hover:text-red-400 transition-colors"
                          >
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-3 h-3"><path d="M5.28 4.22a.75.75 0 0 0-1.06 1.06L6.94 8l-2.72 2.72a.75.75 0 1 0 1.06 1.06L8 9.06l2.72 2.72a.75.75 0 1 0 1.06-1.06L9.06 8l2.72-2.72a.75.75 0 0 0-1.06-1.06L8 6.94 5.28 4.22Z"/></svg>
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )

                return (
                  <div className="divide-y divide-[var(--arvo-border-soft)]">
                    {manualGroups.length === 0 && autoGroups.length === 0 && (
                      <div className="px-5 py-4 space-y-3 text-sm text-[var(--arvo-fg-muted)]">
                        <p dangerouslySetInnerHTML={{ __html: t.finances.reimbursementHelpBody }} />
                        <div className="rounded-xl p-3 text-xs space-y-1" style={{ background: 'color-mix(in srgb, var(--arvo-blue) 10%, var(--arvo-surface))', color: 'var(--arvo-blue)' }}>
                          <p className="font-semibold mb-1">{t.finances.reimbursementHelpTitle}</p>
                          <p>1. <span dangerouslySetInnerHTML={{ __html: t.finances.reimbursementHelpStep1 }} /></p>
                          <p>2. <span dangerouslySetInnerHTML={{ __html: t.finances.reimbursementHelpStep2 }} /></p>
                        </div>
                      </div>
                    )}

                    {recentManualGroups.map(g => renderGroup(g))}

                    {olderManualGroups.length > 0 && (
                      <div className="px-5 py-3">
                        <button
                          onClick={() => setShowOlderGroups(v => !v)}
                          className="flex items-center gap-1.5 text-xs text-[var(--arvo-fg-soft)] hover:text-[var(--arvo-fg-muted)] transition-colors"
                        >
                          <svg className={`w-3 h-3 transition-transform ${showOlderGroups ? 'rotate-90' : ''}`} fill="currentColor" viewBox="0 0 16 16"><path d="M6 3.5L10.5 8 6 12.5V3.5z"/></svg>
                          {(showOlderGroups ? t.finances.reimbursementHideOlder : t.finances.reimbursementShowOlder).replace('{n}', String(olderManualGroups.length))}
                        </button>
                        {showOlderGroups && (
                          <div className="mt-3 divide-y divide-[var(--arvo-border-soft)]">
                            {olderManualGroups.map(g => renderGroup(g, true))}
                          </div>
                        )}
                      </div>
                    )}

                    {autoGroups.length > 0 && (
                      <div className="px-5 py-3">
                        <button
                          onClick={() => setShowAutoGroups(v => !v)}
                          className="flex items-center gap-1.5 text-xs text-[var(--arvo-fg-soft)] hover:text-[var(--arvo-fg-muted)] transition-colors"
                        >
                          <svg className={`w-3 h-3 transition-transform ${showAutoGroups ? 'rotate-90' : ''}`} fill="currentColor" viewBox="0 0 16 16"><path d="M6 3.5L10.5 8 6 12.5V3.5z"/></svg>
                          {showAutoGroups ? 'Ocultar' : 'Mostrar'} {autoGroups.length} grupo(s) auto-detectado(s)
                        </button>
                        {showAutoGroups && (
                          <div className="mt-3 divide-y divide-[var(--arvo-border-soft)]">
                            {autoGroups.map(g => (
                              <div key={g.id} className="py-3 first:pt-0">
                                <div className="flex items-center gap-2 mb-2">
                                  {editingGroupId === g.id ? (
                                    <input
                                      autoFocus
                                      value={editingGroupNameInput}
                                      onChange={e => setEditingGroupNameInput(e.target.value)}
                                      onBlur={() => renameGroup(g.id, editingGroupNameInput)}
                                      onKeyDown={e => {
                                        if (e.key === 'Enter') renameGroup(g.id, editingGroupNameInput)
                                        if (e.key === 'Escape') setEditingGroupId(null)
                                      }}
                                      className="flex-1 text-sm font-medium border-b border-[var(--arvo-fg)] bg-transparent outline-none"
                                    />
                                  ) : (
                                    <button
                                      onClick={() => { setEditingGroupId(g.id); setEditingGroupNameInput(displayName(g)) }}
                                      className="flex-1 text-sm font-medium text-[var(--arvo-fg-muted)] text-left hover:text-[var(--arvo-fg)] transition-colors flex items-center gap-1.5"
                                      title={t.finances.groupRenameAuto}
                                    >
                                      <span className="text-[10px] bg-[var(--arvo-track-bg)] text-[var(--arvo-fg-soft)] rounded px-1 py-0.5 font-medium shrink-0">auto</span>
                                      {displayName(g)}
                                    </button>
                                  )}
                                  <span className={`text-xs font-medium px-2 py-0.5 rounded-full tabular-nums ${Math.abs(g.net) < 0.01 ? 'bg-[var(--arvo-track-bg)] text-[var(--arvo-fg-muted)]' : g.net > 0 ? 'bg-[var(--arvo-green-tint)] arvo-delta-pos' : 'bg-[var(--arvo-border-soft)] text-[var(--arvo-fg)]'}`}>
                                    {g.net >= 0 ? '+' : ''}{fmt(g.net, g.transactions[0]?.currency ?? 'EUR')}
                                  </span>
                                  <button onClick={() => deleteGroup(g.id)} title={t.finances.groupDelete} className="p-1 text-[var(--arvo-fg-soft)] hover:text-red-400 transition-colors">
                                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5"><path fillRule="evenodd" d="M5 3.25V4H2.75a.75.75 0 0 0 0 1.5h.3l.815 8.15A1.5 1.5 0 0 0 5.357 15h5.285a1.5 1.5 0 0 0 1.493-1.35l.815-8.15h.3a.75.75 0 0 0 0-1.5H11v-.75A2.25 2.25 0 0 0 8.75 1h-1.5A2.25 2.25 0 0 0 5 3.25Z" clipRule="evenodd"/></svg>
                                  </button>
                                </div>
                                <div className="space-y-1">
                                  {g.transactions.map(tx => (
                                    <div key={tx.id} className="flex items-center gap-2 text-xs text-[var(--arvo-fg-muted)] pl-2">
                                      <span className="text-[var(--arvo-fg-faint)]">·</span>
                                      <span className="flex-1 truncate">{tx.description}</span>
                                      <span className={`font-medium tabular-nums ${tx.amount < 0 ? 'text-[var(--arvo-fg)]' : 'arvo-delta-pos'}`}>{fmt(tx.amount, tx.currency)}</span>
                                      <button onClick={() => removeFromGroup(g.id, tx.id)} title={t.finances.removeFromGroup} className="p-0.5 text-[var(--arvo-fg-soft)] hover:text-red-400 transition-colors">
                                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-3 h-3"><path d="M5.28 4.22a.75.75 0 0 0-1.06 1.06L6.94 8l-2.72 2.72a.75.75 0 1 0 1.06 1.06L8 9.06l2.72 2.72a.75.75 0 1 0 1.06-1.06L9.06 8l2.72-2.72a.75.75 0 0 0-1.06-1.06L8 6.94 5.28 4.22Z"/></svg>
                                      </button>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )
              })()}
            </div>
          )}
        </div>
      )}

      {/* Import modal — bottom sheet no mobile, card centralizado no desktop */}
      {showImportModal && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 sm:px-4"
          onClick={() => setShowImportModal(false)}
        >
          <div
            className="bg-[var(--arvo-surface)] rounded-t-2xl sm:rounded-2xl shadow-xl w-full sm:max-w-sm max-h-[92vh] sm:max-h-[90vh] overflow-y-auto p-6"
            style={{ paddingBottom: 'calc(24px + env(safe-area-inset-bottom, 0px))' }}
            onClick={e => e.stopPropagation()}
          >
            <h3 className="font-semibold text-[var(--arvo-fg)] mb-5">{t.finances.importStatement}</h3>

            {/* Account selector */}
            {accounts.length > 0 && (
              <div className="mb-4">
                <label className="block text-xs text-[var(--arvo-fg-muted)] mb-1.5">{t.finances.csvAccount}</label>
                <select
                  value={csvAccountId ?? ''}
                  onChange={e => setCsvAccountId(e.target.value === '' ? null : Number(e.target.value))}
                  className="w-full border border-[var(--arvo-border)] rounded-lg px-3 py-2 text-sm"
                >
                  <option value="">{t.finances.csvAccountNone}</option>
                  {accounts.map(a => <option key={a.id} value={a.id}>{a.icon} {a.name}</option>)}
                </select>
              </div>
            )}

            {/* Currency */}
            <div className="mb-5">
              <label className="block text-xs text-[var(--arvo-fg-muted)] mb-1.5">{t.finances.csvCurrency}</label>
              <div className="flex gap-2">
                {['EUR', 'BRL', 'USD'].map(c => (
                  <button
                    key={c}
                    onClick={() => setCsvCurrency(c)}
                    className={`flex-1 py-2 text-sm font-medium rounded-lg border transition-colors ${
                      csvCurrency === c
                        ? 'bg-[var(--arvo-fg)] text-[var(--arvo-pill-active-fg)] border-[var(--arvo-fg)]'
                        : 'bg-[var(--arvo-surface)] text-[var(--arvo-fg-muted)] border-[var(--arvo-border)] hover:border-[var(--arvo-fg)] hover:text-[var(--arvo-fg)]'
                    }`}
                  >
                    {c}
                  </button>
                ))}
              </div>
            </div>

            {/* Drop zone */}
            <div
              className="border-2 border-dashed border-[var(--arvo-border)] rounded-xl p-8 text-center cursor-pointer hover:border-[var(--arvo-fg)] hover:bg-[var(--arvo-fg)]/5 transition-colors"
              onClick={() => fileRef.current?.click()}
              onDragOver={e => { e.preventDefault(); e.stopPropagation() }}
              onDrop={e => {
                e.preventDefault(); e.stopPropagation()
                const f = e.dataTransfer.files?.[0]
                if (f) { setShowImportModal(false); handleCSVFile(f) }
              }}
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-8 h-8 text-[var(--arvo-fg-faint)] mx-auto mb-2">
                <path fillRule="evenodd" d="M11.47 2.47a.75.75 0 0 1 1.06 0l4.5 4.5a.75.75 0 0 1-1.06 1.06l-3.22-3.22V16.5a.75.75 0 0 1-1.5 0V4.81L8.03 8.03a.75.75 0 0 1-1.06-1.06l4.5-4.5ZM3 15.75a.75.75 0 0 1 .75.75v2.25a1.5 1.5 0 0 0 1.5 1.5h13.5a1.5 1.5 0 0 0 1.5-1.5V16.5a.75.75 0 0 1 1.5 0v2.25a3 3 0 0 1-3 3H5.25a3 3 0 0 1-3-3V16.5a.75.75 0 0 1 .75-.75Z" clipRule="evenodd" />
              </svg>
              <p className="text-sm text-[var(--arvo-fg-muted)] font-medium">{t.finances.csvDragFile}</p>
              <p className="text-xs text-[var(--arvo-fg-soft)] mt-1">{t.finances.csvClickToSelect}</p>
              <p className="text-[10px] text-[var(--arvo-fg-faint)] mt-2">{t.finances.csvFormats}</p>
            </div>

            <button
              onClick={() => setShowImportModal(false)}
              className="mt-4 w-full text-sm text-[var(--arvo-fg-soft)] hover:text-[var(--arvo-fg-muted)] transition-colors py-1"
            >
              {t.common.cancel}
            </button>
          </div>
        </div>
      )}

      {/* Add transaction modal */}
      {showAdd && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 sm:px-4" onClick={() => setShowAdd(false)}>
          <div className="bg-[var(--arvo-surface)] rounded-t-2xl sm:rounded-2xl shadow-xl w-full sm:max-w-sm max-h-[92vh] sm:max-h-[90vh] overflow-y-auto p-6" style={{ paddingBottom: 'calc(24px + env(safe-area-inset-bottom, 0px))' }} onClick={e => e.stopPropagation()}>
            <h3 className="font-semibold text-[var(--arvo-fg)] mb-4">{t.finances.newTransaction}</h3>
            <div className="space-y-3">
              <div>
                <label className="block text-xs text-[var(--arvo-fg-muted)] mb-1">{t.common.date}</label>
                <DatePicker value={addDate} onChange={setAddDate} style={{ borderRadius: 8, padding: '8px 12px', fontSize: 14 }} />
              </div>
              <div>
                <label className="block text-xs text-[var(--arvo-fg-muted)] mb-1">{t.common.description}</label>
                <input autoFocus value={addDesc} onChange={e => setAddDesc(e.target.value)} className="w-full border border-[var(--arvo-border)] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--arvo-fg)]/20" placeholder="Ex: Supermercado" />
              </div>
              <div>
                <label className="block text-xs text-[var(--arvo-fg-muted)] mb-1">{t.common.value}</label>
                <div className="flex items-center gap-2">
                  <button onClick={() => setAddSign(s => s === '-' ? '+' : '-')} className={`px-2.5 py-2 rounded-lg text-sm font-bold border transition-colors ${addSign === '-' ? 'bg-red-50 border-red-200 text-red-600' : 'bg-green-50 border-green-200 text-green-600'}`}>
                    {addSign}
                  </button>
                  <select value={addCur} onChange={e => setAddCur(e.target.value)} className="border border-[var(--arvo-border)] rounded-lg px-2 py-2 text-sm">
                    {['EUR','BRL','USD'].map(c => <option key={c}>{c}</option>)}
                  </select>
                  <input type="number" step="0.01" min="0" value={addAmt} onChange={e => setAddAmt(e.target.value)} className="flex-1 border border-[var(--arvo-border)] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--arvo-fg)]/20" placeholder="0.00" />
                </div>
              </div>
              <div>
                <label className="block text-xs text-[var(--arvo-fg-muted)] mb-1">{t.finances.categoryOptional}</label>
                <select value={addCat} onChange={e => setAddCat(e.target.value === '' ? '' : Number(e.target.value))} className="w-full border border-[var(--arvo-border)] rounded-lg px-3 py-2 text-sm">
                  <option value="">{t.finances.noCategory}</option>
                  {incomeCategories.length > 0 && (
                    <optgroup label={t.finances.incomeLabel}>
                      {incomeCategories.map(c => <option key={c.id} value={c.id}>{c.icon} {resolveKey(c.name, c.name_key, nameKeys)}</option>)}
                    </optgroup>
                  )}
                  {expenseCategories.length > 0 && (
                    <optgroup label={t.finances.expenses}>
                      {expenseCategories.map(c => <option key={c.id} value={c.id}>{c.icon} {resolveKey(c.name, c.name_key, nameKeys)}</option>)}
                    </optgroup>
                  )}
                </select>
              </div>
              {accounts.length > 0 && (
                <div>
                  <label className="block text-xs text-[var(--arvo-fg-muted)] mb-1">{t.finances.csvAccount}</label>
                  <select value={addAccountId ?? ''} onChange={e => setAddAccountId(e.target.value === '' ? null : Number(e.target.value))} className="w-full border border-[var(--arvo-border)] rounded-lg px-3 py-2 text-sm">
                    <option value="">{t.finances.csvAccountNone}</option>
                    {accounts.map(a => <option key={a.id} value={a.id}>{a.icon} {a.name}</option>)}
                  </select>
                </div>
              )}
              {sharedCats.length > 0 && (
                <div>
                  <label className="block text-xs text-[var(--arvo-fg-muted)] mb-1">{t.shared?.tagTransaction ?? 'Categoria compartilhada'}</label>
                  <select value={addSharedCat} onChange={e => setAddSharedCat(e.target.value === '' ? '' : Number(e.target.value))} className="w-full border border-[var(--arvo-border)] rounded-lg px-3 py-2 text-sm">
                    <option value="">-</option>
                    {sharedCats.map(c => <option key={c.id} value={c.id}>{c.icon} {c.name}</option>)}
                  </select>
                </div>
              )}
            </div>
            <div className="flex gap-2 mt-5">
              <button
                onClick={addTransaction}
                disabled={saving || !addDesc.trim() || !addAmt}
                className="flex-1 bg-[var(--arvo-fg)] text-[var(--arvo-pill-active-fg)] text-sm py-2 rounded-xl hover:opacity-80 transition-opacity disabled:opacity-40"
              >
                {saving ? '…' : t.finances.addTransaction}
              </button>
              <button onClick={() => setShowAdd(false)} className="px-4 text-sm text-[var(--arvo-fg-muted)] hover:text-[var(--arvo-fg)] transition-colors">{t.common.cancel}</button>
            </div>
          </div>
        </div>
      )}

      {/* Category edit — bottom sheet no mobile, card centralizado no desktop */}
      {editSheetTx && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/30 sm:p-4" onClick={() => setEditSheetTx(null)}>
          <div
            className="bg-[var(--arvo-surface)] rounded-t-2xl sm:rounded-2xl w-full sm:max-w-sm max-h-[92vh] sm:max-h-[90vh] overflow-y-auto px-5 pt-4 pb-8 shadow-2xl"
            style={{ paddingBottom: 'calc(32px + env(safe-area-inset-bottom, 0px))' }}
            onClick={e => e.stopPropagation()}
          >
            <div className="w-10 h-1 bg-[var(--arvo-track-bg)] rounded-full mx-auto mb-4 sm:hidden" />
            <p className="text-sm font-semibold text-[var(--arvo-fg)] truncate mb-0.5">{editSheetTx.description}</p>
            <p className="text-xs text-[var(--arvo-fg-soft)] mb-4">{fmtDate(editSheetTx.date)} · <span className={`tabular-nums ${editSheetTx.amount < 0 ? 'text-[var(--arvo-fg)]' : 'arvo-delta-pos'}`}>{fmt(editSheetTx.amount, editSheetTx.currency)}</span></p>
            <p className="text-xs text-[var(--arvo-fg-muted)] mb-2">{t.finances.category}</p>
            <select
              value={sheetSharedCatId != null ? `s:${sheetSharedCatId}` : (sheetCatId != null ? `c:${sheetCatId}` : '')}
              onChange={e => {
                const raw = e.target.value
                if (raw === '') { setSheetCatId(null); setSheetSharedCatId(null) }
                else if (raw.startsWith('s:')) { setSheetSharedCatId(Number(raw.slice(2))); setSheetCatId(null) }
                else { setSheetCatId(Number(raw.slice(2))); setSheetSharedCatId(null) }
              }}
              className="w-full border border-[var(--arvo-border)] rounded-xl px-3 py-2.5 text-sm mb-4 bg-[var(--arvo-surface)]"
            >
              <option value="">{t.finances.noCategory}</option>
              {incomeCategories.length > 0 && (
                <optgroup label={t.finances.incomeLabel}>
                  {incomeCategories.map(c => <option key={c.id} value={`c:${c.id}`}>{c.icon} {resolveKey(c.name, c.name_key, nameKeys)}</option>)}
                </optgroup>
              )}
              {expenseCategories.length > 0 && (
                <optgroup label={t.finances.expenses}>
                  {expenseCategories.map(c => <option key={c.id} value={`c:${c.id}`}>{c.icon} {resolveKey(c.name, c.name_key, nameKeys)}</option>)}
                </optgroup>
              )}
              {sharedCats.length > 0 && (
                <optgroup label={t.shared?.tagTransaction ?? 'Compartilhada'}>
                  {sharedCats.map(c => <option key={c.id} value={`s:${c.id}`}>{c.icon} {c.name}</option>)}
                </optgroup>
              )}
            </select>
            <div className="flex gap-3">
              <button
                onClick={() => setEditSheetTx(null)}
                className="flex-1 py-2.5 rounded-xl border border-[var(--arvo-border)] text-sm text-[var(--arvo-fg-muted)]"
              >
                {t.common.cancel}
              </button>
              <button
                onClick={async () => {
                  await apiFetch(`/finances/transactions/${editSheetTx.id}`, {
                    method: 'PATCH',
                    body: JSON.stringify({ category_id: sheetCatId, shared_category_id: sheetSharedCatId }),
                  })
                  setEditSheetTx(null)
                  loadTransactions()
                }}
                className="flex-1 py-2.5 rounded-xl bg-[var(--arvo-fg)] text-[var(--arvo-pill-active-fg)] text-sm font-medium"
              >
                {t.common.save}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Escolher com quem dividir uma transação avulsa — amigos (momento oculto
          1:1) ou grupos já existentes (momento oculto do grupo, ver
          docs/SHARED_EXPENSES_MODEL.md), não só amigos individuais. */}
      {splitPickerTx && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-end sm:items-center justify-center sm:p-4" onClick={() => setSplitPickerTx(null)}>
          <div className="bg-[var(--arvo-surface)] rounded-t-2xl sm:rounded-2xl shadow-xl w-full sm:max-w-xs max-h-[92vh] sm:max-h-[90vh] overflow-y-auto p-5 space-y-3" style={{ paddingBottom: 'calc(20px + env(safe-area-inset-bottom, 0px))' }} onClick={e => e.stopPropagation()}>
            <h3 className="font-semibold text-[var(--arvo-fg)] text-sm">{t.finances.expenseSplitShort}</h3>
            {activeFriends.length === 0 && splitGroups.length === 0 ? (
              <p className="text-xs text-[var(--arvo-fg-soft)]">{t.people.emptyBody}</p>
            ) : (
              <div className="space-y-3 max-h-72 overflow-y-auto">
                {splitGroups.length > 0 && (
                  <div className="space-y-1">
                    <p className="text-[10px] uppercase tracking-widest text-[var(--arvo-fg-soft)] px-2">{t.people.sectionGroups}</p>
                    {splitGroups.map(g => (
                      <button
                        key={`group-${g.id}`}
                        onClick={() => pickSplitGroup(splitPickerTx, g.id)}
                        className="flex items-center gap-2 w-full text-left px-2 py-1.5 rounded-lg hover:bg-[var(--arvo-surface-2)] transition-colors"
                      >
                        <span className="text-base leading-none w-[22px] text-center">🤝</span>
                        <span className="text-xs text-[var(--arvo-fg)] truncate">{g.name}</span>
                      </button>
                    ))}
                  </div>
                )}
                {activeFriends.length > 0 && (
                  <div className="space-y-1">
                    <p className="text-[10px] uppercase tracking-widest text-[var(--arvo-fg-soft)] px-2">{t.nav.people}</p>
                    {activeFriends.filter(f => f.user_id).map(f => (
                      <button
                        key={f.user_id}
                        onClick={() => pickSplitFriend(splitPickerTx, f.user_id as string)}
                        className="flex items-center gap-2 w-full text-left px-2 py-1.5 rounded-lg hover:bg-[var(--arvo-surface-2)] transition-colors"
                      >
                        <Avatar name={f.name} email={f.email} avatarUrl={f.avatar_url} size={22} />
                        <span className="text-xs text-[var(--arvo-fg)] truncate">{f.name ?? f.email}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
            <button onClick={() => setSplitPickerTx(null)} className="w-full py-2 rounded-lg border border-[var(--arvo-border)] text-xs text-[var(--arvo-fg-muted)]">
              {t.common.cancel}
            </button>
          </div>
        </div>
      )}

      {splitMoment && user && (
        <SplitTransactionModal
          momentId={splitMoment.momentId}
          transaction={{ id: splitMoment.tx.id, description: splitMoment.tx.description, amount: splitMoment.tx.amount, currency: splitMoment.tx.currency, user_id: user.id }}
          onDone={() => { setSplitMoment(null); loadTransactions() }}
          onClose={() => setSplitMoment(null)}
        />
      )}
    </div>
  )
}
