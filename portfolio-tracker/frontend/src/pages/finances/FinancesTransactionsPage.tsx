import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import * as XLSX from 'xlsx'
import { apiFetch } from '../../lib/api'
import { useI18n } from '../../contexts/I18nContext'

interface Category { id: number; name: string; icon: string; color: string }
interface MomentRef  { id: number; name: string; icon: string; color: string }
interface FinanceAccount { id: number; name: string; icon: string; currency: string }
interface Transaction {
  id: number
  date: string
  description: string
  amount: number
  currency: string
  category_id: number | null
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
  source?: string
  is_duplicate?: boolean
}

interface AiDebug { ran: boolean; assigned: number; unmatched: number; error: string | null }

function fmt(n: number, currency = 'EUR') {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency, minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n)
}
function fmtDate(d: string) {
  return new Date(d + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' })
}

const LOCALE_MAP: Record<string, string> = { pt: 'pt-BR', en: 'en-GB', fr: 'fr-FR' }

function MonthPicker({ value, onChange, locale }: { value: string; onChange: (m: string) => void; locale: string }) {
  const fmtLocale = LOCALE_MAP[locale] ?? 'pt-BR'
  const months = Array.from({ length: 36 }, (_, i) => {
    const d = new Date()
    d.setDate(1)
    d.setMonth(d.getMonth() - i)
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
  })
  return (
    <select value={value} onChange={e => onChange(e.target.value)} className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm bg-white">
      {months.map(m => {
        const [y, mo] = m.split('-')
        return <option key={m} value={m}>{new Date(Number(y), Number(mo) - 1).toLocaleDateString(fmtLocale, { month: 'long', year: 'numeric' })}</option>
      })}
    </select>
  )
}

export default function FinancesTransactionsPage() {
  const { t, locale } = useI18n()
  const [searchParams] = useSearchParams()
  const today = new Date()
  const defaultMonth = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`

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
  const [saving, setSaving]             = useState(false)

  // Inline category edit
  const [editingId, setEditingId]   = useState<number | null>(null)
  // Inline notes edit
  const [editingNotesId, setEditingNotesId] = useState<number | null>(null)
  const [notesInput, setNotesInput]         = useState('')

  // Date range mode
  const [dateMode, setDateMode]   = useState<'month' | 'range'>('month')
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

  // Import modal
  const [showImportModal, setShowImportModal] = useState(false)

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
        if (data.length === 1) {
          setCsvAccountId(data[0].id)
          setAddAccountId(data[0].id)
        }
        setAccountsLoaded(true)
      })
      .catch(() => setAccountsLoaded(true))
  }, [])

  useEffect(() => { loadTransactions() }, [loadTransactions])

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
        body: JSON.stringify({ date: addDate, description: addDesc.trim(), amount, currency: addCur, category_id: addCat || null, account_id: addAccountId }),
      })
      setShowAdd(false)
      setAddDesc(''); setAddAmt(''); setAddCat(''); setAddAccountId(null)
      await loadTransactions()
    } finally {
      setSaving(false)
    }
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
      const applyAll = window.confirm(`Aplicar esta categoria a todas as transações com a descrição "${tx.description}"?\n\nIsso inclui transações de outros períodos e meses.`)
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

  function setLast30Days() {
    const d = new Date()
    const from = new Date(d)
    from.setDate(from.getDate() - 29)
    setDateFrom(from.toISOString().split('T')[0])
    setDateTo(d.toISOString().split('T')[0])
    setDateMode('range')
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
    if (!confirm('Excluir grupo? As transações voltarão a aparecer nos cálculos.')) return
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
            } catch {
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
      setCsvError(e instanceof Error ? e.message : t.finances.csvAiError.replace('{msg}', 'CSV'))
      setCsvStep('idle')
    }
  }

  function changeCsvRowCategory(idx: number, val: number | null, applyToAll: boolean) {
    setCsvRows(prev => prev.map((r, j) => {
      if (j === idx) return { ...r, category_id: val }
      if (applyToAll && r.description === prev[idx].description) return { ...r, category_id: val }
      return r
    }))
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
              category_id: r.category_id ?? null, account_id: csvAccountId,
              is_internal_transfer: r.is_internal_transfer,
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

  const catsForAmount = (amount: number) => amount > 0 ? incomeCategories : expenseCategories

  const isHidden = (tx: Transaction) => tx.is_internal_transfer || tx.exclude_from_stats
  const expenses = transactions.filter(tx => tx.amount < 0 && !isHidden(tx)).reduce((s, tx) => s + tx.amount, 0)
  const income   = transactions.filter(tx => tx.amount > 0 && !isHidden(tx)).reduce((s, tx) => s + tx.amount, 0)
  const allSelected = transactions.length > 0 && selected.size === transactions.length
  const someSelected = selected.size > 0 && !allSelected

  type DisplayItem =
    | { kind: 'tx'; tx: Transaction }
    | { kind: 'group'; groupId: string; name: string; txs: Transaction[]; net: number }

  const displayItems = useMemo((): DisplayItem[] => {
    const items: DisplayItem[] = []
    const seenGroups = new Set<string>()
    for (const tx of transactions) {
      if (tx.reimbursement_group_id) {
        if (!seenGroups.has(tx.reimbursement_group_id)) {
          seenGroups.add(tx.reimbursement_group_id)
          const groupTxs = transactions.filter(t => t.reimbursement_group_id === tx.reimbursement_group_id)
          const net = groupTxs.reduce((s, t) => s + t.amount, 0)
          const name = groups.find(g => g.id === tx.reimbursement_group_id)?.name ?? t.finances.reimbursementGroup
          items.push({ kind: 'group', groupId: tx.reimbursement_group_id, name, txs: groupTxs, net })
        }
      } else {
        items.push({ kind: 'tx', tx })
      }
    }
    return items
  }, [transactions, groups, t])

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

      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 style={{ fontFamily: "'Tenor Sans', sans-serif", fontSize: 18, letterSpacing: '0.06em', color: 'var(--arvo-black)' }}>{t.finances.transactionsTitle}</h1>
          <p className="text-sm mt-0.5" style={{ color: 'rgba(13,13,13,0.60)' }}>{t.finances.transactionsSubtitle}</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {dateMode === 'month' ? (
            <div className="flex items-center gap-1">
              <MonthPicker value={month} onChange={setMonth} locale={locale} />
              <button
                onClick={setLast30Days}
                title={t.performance.last30d}
                className="px-2.5 py-1.5 bg-white text-xs font-medium text-gray-500 border border-gray-200 rounded-lg hover:border-[#0D0D0D] hover:text-[#0D0D0D] transition-colors whitespace-nowrap"
              >{t.performance.last30d}</button>
              <button
                onClick={() => setDateMode('range')}
                title="Período personalizado"
                className="p-1.5 bg-white text-gray-400 hover:text-gray-600 border border-gray-200 rounded-lg transition-colors"
              >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-4 h-4"><path d="M5.75 7.5a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5ZM8 7.5a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5Zm2.25 0a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5ZM5.75 10a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5ZM8 10a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5Zm2.25 0a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5ZM4.75 2a.75.75 0 0 1 .75.75V4h5V2.75a.75.75 0 0 1 1.5 0V4h.25A2.75 2.75 0 0 1 15 6.75v6.5A2.75 2.75 0 0 1 12.25 16H3.75A2.75 2.75 0 0 1 1 13.25v-6.5A2.75 2.75 0 0 1 3.75 4H4V2.75A.75.75 0 0 1 4.75 2ZM2.5 7.5v5.75c0 .69.56 1.25 1.25 1.25h8.5c.69 0 1.25-.56 1.25-1.25V7.5h-11Z"/></svg>
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-1.5">
              <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm" />
              <span className="text-gray-400 text-xs">→</span>
              <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm" />
              <button
                onClick={() => setDateMode('month')}
                className="p-1.5 bg-white text-gray-400 hover:text-gray-600 border border-gray-200 rounded-lg transition-colors"
                title="Voltar para seleção por mês"
              >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-4 h-4"><path d="M5.28 4.22a.75.75 0 0 0-1.06 1.06L6.94 8l-2.72 2.72a.75.75 0 1 0 1.06 1.06L8 9.06l2.72 2.72a.75.75 0 1 0 1.06-1.06L9.06 8l2.72-2.72a.75.75 0 0 0-1.06-1.06L8 6.94 5.28 4.22Z" /></svg>
              </button>
            </div>
          )}
          {accountsLoaded && accounts.length > 0 && (<>
            <button
              onClick={detectTransfers}
              disabled={detecting}
              title={detectResult ?? t.finances.detectTransfers}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-gray-200 text-sm text-gray-500 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50"
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-4 h-4"><path fillRule="evenodd" d="M4 4a.75.75 0 0 1 .75-.75h6.5a.75.75 0 0 1 0 1.5h-6.5A.75.75 0 0 1 4 4Zm-1.5 4A.75.75 0 0 1 3.25 7.25h9.5a.75.75 0 0 1 0 1.5h-9.5A.75.75 0 0 1 2.5 8Zm3 4a.75.75 0 0 1 .75-.75h3.5a.75.75 0 0 1 0 1.5h-3.5A.75.75 0 0 1 5.5 12Z" clipRule="evenodd"/></svg>
              {detecting ? t.finances.detectingTransfers : (detectResult ?? t.finances.detectTransfers)}
            </button>
            <button
              onClick={detectReimbursements}
              disabled={detectingReimb}
              title={detectReimbResult ?? t.finances.detectRefunds}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-gray-200 text-sm text-gray-500 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50"
            >
              <span className="text-base leading-none">↩</span>
              {detectingReimb ? t.finances.detecting : (detectReimbResult ?? t.finances.detectRefunds)}
            </button>
            <button
              onClick={() => { setCsvStep('idle'); setCsvRows([]); setCsvDuplicateCount(0); setCsvError(''); setCsvAiDebug(null); setShowImportModal(true) }}
              disabled={csvStep === 'parsing'}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-gray-200 text-sm text-gray-600 rounded-lg hover:bg-gray-50 transition-colors"
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-4 h-4"><path d="M8.75 2.75a.75.75 0 0 0-1.5 0v5.69L5.03 6.22a.75.75 0 0 0-1.06 1.06l3.5 3.5a.75.75 0 0 0 1.06 0l3.5-3.5a.75.75 0 0 0-1.06-1.06L8.75 8.44V2.75Z" /><path d="M3.5 9.75a.75.75 0 0 0-1.5 0v1.5A2.75 2.75 0 0 0 4.75 14h6.5A2.75 2.75 0 0 0 14 11.25v-1.5a.75.75 0 0 0-1.5 0v1.5c0 .69-.56 1.25-1.25 1.25h-6.5c-.69 0-1.25-.56-1.25-1.25v-1.5Z" /></svg>
              {t.finances.importCSV}
            </button>
            <button
              onClick={() => setShowAdd(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-[#0D0D0D] text-white text-sm rounded-lg hover:opacity-80 transition-opacity"
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-4 h-4"><path d="M8.75 3.75a.75.75 0 0 0-1.5 0v3.5h-3.5a.75.75 0 0 0 0 1.5h3.5v3.5a.75.75 0 0 0 1.5 0v-3.5h3.5a.75.75 0 0 0 0-1.5h-3.5v-3.5Z" /></svg>
              {t.finances.addTransaction}
            </button>
          </>)}
          <input ref={fileRef} type="file" accept=".csv,.txt,.xls,.xlsx,.ods" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) { setShowImportModal(false); handleCSVFile(f) } e.target.value = '' }} />
        </div>
      </div>

      {/* Filter strip */}
      {csvStep === 'idle' && (allCategories.length > 0 || moments.length > 0 || accounts.length > 0) && (
        <div className="flex items-center gap-2 flex-wrap">
          {accounts.length > 0 && (
            <select
              value={filterAccountId === '' ? '' : String(filterAccountId)}
              onChange={e => {
                const v = e.target.value
                setFilterAccountId(v === '' ? '' : v === 'unassigned' ? 'unassigned' : Number(v))
              }}
              className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm bg-white"
            >
              <option value="">{t.finances.allAccounts}</option>
              <option value="unassigned">{t.finances.csvAccountNone}</option>
              {accounts.map(a => <option key={a.id} value={a.id}>{a.icon} {a.name}</option>)}
            </select>
          )}
          {allCategories.length > 0 && (
            <select
              value={filterCatId}
              onChange={e => setFilterCatId(e.target.value === '' ? '' : Number(e.target.value))}
              className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm bg-white"
            >
              <option value="">{t.finances.allCategories}</option>
              {allCategories.map(c => <option key={c.id} value={c.id}>{c.icon} {c.name}</option>)}
            </select>
          )}
          {moments.length > 0 && (
            <select
              value={filterMomentId}
              onChange={e => setFilterMomentId(e.target.value === '' ? '' : Number(e.target.value))}
              className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm bg-white"
            >
              <option value="">{t.finances.allMoments}</option>
              {moments.map(m => <option key={m.id} value={m.id}>{m.icon} {m.name}</option>)}
            </select>
          )}
          {(filterCatId !== '' || filterMomentId !== '' || filterAccountId !== '') && (
            <button
              onClick={() => { setFilterCatId(''); setFilterMomentId(''); setFilterAccountId('') }}
              className="text-xs text-gray-400 hover:text-gray-600 transition-colors"
            >
              {t.finances.clearFilters}
            </button>
          )}
        </div>
      )}


      {/* CSV Error */}
      {csvError && (
        <div className="bg-red-50 border border-red-100 rounded-xl px-4 py-3 text-sm text-red-600">{csvError}</div>
      )}

      {/* CSV Parsing loader */}
      {csvStep === 'parsing' && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm px-5 py-8 flex flex-col items-center gap-3">
          <svg className="animate-spin w-7 h-7 text-[#0D0D0D]" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"/>
          </svg>
          <p className="text-sm font-medium text-gray-700">{t.finances.csvParsingTitle}</p>
          <p className="text-xs text-gray-400">{t.finances.csvParsingHint}</p>
        </div>
      )}

      {/* CSV Preview */}
      {csvStep !== 'idle' && csvStep !== 'parsing' && csvRows.length > 0 && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-50 flex items-center justify-between flex-wrap gap-3">
            <div>
              <h3 className="font-semibold text-gray-900 text-sm">
                {t.finances.csvPreview} — {csvRows.length} {t.finances.csvTransactions}
                {csvDuplicateCount > 0 && (
                  <span className="ml-2 text-xs font-normal text-gray-400">({t.finances.csvAlreadyImported.replace('{n}', String(csvDuplicateCount))})</span>
                )}
              </h3>
              <p className="text-xs text-gray-400 mt-0.5">
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
                className={`text-xs px-2.5 py-1 rounded-lg border transition-colors ${csvFilterUncategorized ? 'bg-amber-50 border-amber-300 text-amber-700' : 'border-gray-200 text-gray-500 hover:bg-gray-50'}`}
              >
                {csvFilterUncategorized
                  ? t.finances.csvUncategorizedCount.replace('{n}', String(csvRows.filter(r => !r.category_id).length))
                  : t.finances.csvShowUncategorized}
              </button>
              {accounts.length > 0 && (
                <div className="flex items-center gap-1.5 text-xs text-gray-500">
                  <span>{t.finances.csvAccount}</span>
                  <select
                    value={csvAccountId ?? ''}
                    onChange={e => setCsvAccountId(e.target.value === '' ? null : Number(e.target.value))}
                    className="border border-gray-200 rounded px-2 py-1 text-xs"
                  >
                    <option value="">{t.finances.csvAccountNone}</option>
                    {accounts.map(a => <option key={a.id} value={a.id}>{a.icon} {a.name}</option>)}
                  </select>
                </div>
              )}
              <button onClick={() => { setCsvStep('idle'); setCsvRows([]); setCsvDuplicateCount(0); setCsvAiDebug(null) }} className="text-xs text-gray-500 hover:text-gray-700 transition-colors">{t.common.cancel}</button>
              <button onClick={importCSV} disabled={csvStep === 'importing'} className="px-3 py-1.5 bg-[#0D0D0D] text-white text-xs rounded-lg hover:opacity-80 transition-opacity disabled:opacity-50">
                {csvStep === 'importing' ? t.finances.csvImporting : t.finances.csvConfirm}
              </button>
            </div>
          </div>
          <div className={`overflow-x-auto max-h-96 overflow-y-auto transition-opacity ${csvAiLoading ? 'opacity-50 pointer-events-none select-none' : ''}`}>
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-gray-500 text-xs uppercase sticky top-0">
                <tr>
                  <th className="px-4 py-2 text-left">{t.common.date}</th>
                  <th className="px-4 py-2 text-left">{t.common.description}</th>
                  <th className="px-4 py-2 text-right">{t.common.value}</th>
                  <th className="px-4 py-2 text-left">{t.finances.category}</th>
                  <th className="px-4 py-2"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {csvRows.map((row, i) => {
                  if (csvFilterUncategorized && row.category_id) return null
                  const sameDescCount = csvRows.filter(r => r.description === row.description).length
                  return (
                    <tr key={i} className={row.is_broker_transfer ? 'bg-amber-50' : ''}>
                      <td className="px-4 py-2 text-gray-600 whitespace-nowrap">{fmtDate(row.date)}</td>
                      <td className="px-4 py-2 text-gray-700 max-w-xs truncate">
                        {row.is_broker_transfer && <span className="text-[10px] bg-amber-200 text-amber-800 rounded px-1 mr-1.5 font-medium">{t.finances.brokerTransfer}</span>}
                        {row.suggested_by === 'transfer' && <span className="text-[10px] bg-blue-100 text-blue-700 rounded px-1 mr-1.5 font-medium">{t.finances.csvTransferBadge}</span>}
                        {row.description}
                        {sameDescCount > 1 && <span className="ml-1.5 text-[10px] text-gray-400">×{sameDescCount}</span>}
                      </td>
                      <td className={`px-4 py-2 text-right font-medium whitespace-nowrap ${row.amount < 0 ? 'text-red-600' : 'text-green-600'}`}>
                        {fmt(row.amount, row.currency)}
                      </td>
                      <td className="px-4 py-2">
                        <div className="flex items-center gap-1">
                          {row.suggested_by === 'ai' && row.category_id === row.suggested_category_id && (
                            <span title="Sugerido por IA" className="text-[10px] bg-violet-100 text-violet-600 rounded px-1 font-medium shrink-0">✦ IA</span>
                          )}
                          <select
                            value={row.category_id ?? ''}
                            onChange={e => {
                              const val = e.target.value === '' ? null : Number(e.target.value)
                              if (sameDescCount > 1) {
                                const apply = window.confirm(t.finances.csvApplyAllConfirm.replace('{n}', String(sameDescCount)).replace('{desc}', row.description))
                                changeCsvRowCategory(i, val, apply)
                              } else {
                                changeCsvRowCategory(i, val, false)
                              }
                            }}
                            className="text-xs border border-gray-200 rounded px-2 py-1 max-w-[150px]"
                          >
                            <option value="">{t.finances.noCategory}</option>
                            {allCategories.map(c => <option key={c.id} value={c.id}>{c.icon} {c.name}</option>)}
                          </select>
                        </div>
                      </td>
                      <td className="px-4 py-2">
                        <button onClick={() => setCsvRows(prev => prev.filter((_, j) => j !== i))} className="text-gray-300 hover:text-red-400 transition-colors">
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
      )}

      {/* Summary cards */}
      {!loading && transactions.length > 0 && csvStep === 'idle' && (
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
            <p className="text-xs text-gray-500 mb-1">{t.finances.expenses}</p>
            <p className="text-lg font-bold text-red-600">{fmt(expenses)}</p>
          </div>
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
            <p className="text-xs text-gray-500 mb-1">{t.finances.incomeLabel}</p>
            <p className="text-lg font-bold text-green-600">{fmt(income)}</p>
          </div>
        </div>
      )}

      {/* Transaction list */}
      {csvStep === 'idle' && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          {loading ? (
            <p className="text-center text-gray-400 py-12 text-sm">{t.common.loading}</p>
          ) : transactions.length === 0 ? (
            <div className="py-12 text-center">
              <p className="text-2xl mb-2">📋</p>
              <p className="text-sm text-gray-500">{t.finances.noTransactions}</p>
              <p className="text-xs text-gray-400 mt-1">{t.finances.noTransactionsHint}</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-gray-500 text-xs uppercase">
                  <tr>
                    {/* Select-all checkbox */}
                    <th className="pl-3 pr-1 sm:pl-4 sm:pr-2 py-3 w-8">
                      <input
                        type="checkbox"
                        checked={allSelected}
                        ref={el => { if (el) el.indeterminate = someSelected }}
                        onChange={toggleSelectAll}
                        className="rounded border-gray-300 text-[#0D0D0D] focus:ring-[#0D0D0D]/20 cursor-pointer"
                      />
                    </th>
                    <th className="px-2 sm:px-3 py-3 text-left whitespace-nowrap">{t.common.date}</th>
                    <th className="px-2 sm:px-3 py-3 text-left">{t.common.description}</th>
                    <th className="px-2 sm:px-3 py-3 text-right whitespace-nowrap">{t.common.value}</th>
                    <th className="px-2 sm:px-3 py-3 text-left hidden sm:table-cell">{t.finances.category}</th>
                    <th className="px-2 sm:px-3 py-3 text-left hidden md:table-cell">{t.finances.txMoment}</th>
                    <th className="px-2 sm:px-3 py-3"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {displayItems.map(item => {
                    if (item.kind === 'group') {
                      const expanded = expandedGroups.has(item.groupId)
                      return (
                        <>
                          <tr key={`group-${item.groupId}`} className="bg-amber-50/40 hover:bg-amber-50/60 transition-colors cursor-pointer" onClick={() => toggleExpandGroup(item.groupId)}>
                            <td className="pl-4 pr-2 py-2.5 w-8" />
                            <td colSpan={6} className="px-3 py-2.5">
                              <div className="flex items-center gap-2.5">
                                <svg className={`w-3 h-3 text-amber-500 transition-transform shrink-0 ${expanded ? 'rotate-90' : ''}`} fill="currentColor" viewBox="0 0 16 16">
                                  <path d="M6 3.5L10.5 8 6 12.5V3.5z"/>
                                </svg>
                                <span className="text-xs font-semibold text-amber-700">↩</span>
                                <span className="text-sm font-medium text-gray-800">{item.name}</span>
                                <span className="text-xs text-gray-400">{item.txs.length} transações</span>
                                <span className={`ml-auto text-sm font-semibold ${Math.abs(item.net) < 0.01 ? 'text-gray-400' : item.net > 0 ? 'text-green-600' : 'text-red-500'}`}>
                                  {t.finances.reimbursementGroupNet}: {fmt(item.net, item.txs[0]?.currency)}
                                </span>
                                <button
                                  onClick={e => { e.stopPropagation(); deleteGroup(item.groupId) }}
                                  title={t.finances.reimbursementGroupDelete}
                                  className="p-1 text-gray-300 hover:text-red-400 transition-colors"
                                >
                                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5"><path fillRule="evenodd" d="M5 3.25V4H2.75a.75.75 0 0 0 0 1.5h.3l.815 8.15A1.5 1.5 0 0 0 5.357 15h5.285a1.5 1.5 0 0 0 1.493-1.35l.815-8.15h.3a.75.75 0 0 0 0-1.5H11v-.75A2.25 2.25 0 0 0 8.75 1h-1.5A2.25 2.25 0 0 0 5 3.25Z" clipRule="evenodd"/></svg>
                                </button>
                              </div>
                            </td>
                          </tr>
                          {expanded && item.txs.map(tx => (
                            <tr key={tx.id} className="bg-amber-50/20 hover:bg-amber-50/40 transition-colors">
                              <td className="pl-3 pr-1 py-2 w-8" />
                              <td className="px-2 sm:px-3 py-2 text-gray-400 whitespace-nowrap text-xs">{fmtDate(tx.date)}</td>
                              <td className="px-2 sm:px-3 py-2 text-gray-600 max-w-[120px] sm:max-w-xs text-xs">
                                <span className="truncate block">{tx.description || '—'}</span>
                              </td>
                              <td className={`px-2 sm:px-3 py-2 text-right text-xs font-medium whitespace-nowrap ${tx.amount < 0 ? 'text-red-500' : 'text-green-500'}`}>
                                {fmt(tx.amount, tx.currency)}
                              </td>
                              <td className="px-2 sm:px-3 py-2 hidden sm:table-cell">
                                {tx.finance_categories && (
                                  <span className="text-[10px] px-1.5 py-0.5 rounded-full" style={{ backgroundColor: tx.finance_categories.color + '22', color: tx.finance_categories.color }}>
                                    {tx.finance_categories.icon} {tx.finance_categories.name}
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
                        className={`group transition-colors ${isHidden(tx) ? 'opacity-40' : ''} ${isSelected ? 'bg-[#0D0D0D]/5' : 'hover:bg-gray-50'}`}
                      >
                        <td className="pl-3 pr-1 sm:pl-4 sm:pr-2 py-2.5 sm:py-3 w-8">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => toggleSelect(tx.id)}
                            className="rounded border-gray-300 text-[#0D0D0D] focus:ring-[#0D0D0D]/20 cursor-pointer"
                          />
                        </td>
                        <td className="px-2 sm:px-3 py-2.5 sm:py-3 text-gray-500 whitespace-nowrap text-xs sm:text-sm">{fmtDate(tx.date)}</td>
                        <td className="px-2 sm:px-3 py-2.5 sm:py-3 text-gray-800 max-w-[140px] sm:max-w-xs">
                          <span className="truncate block">{tx.description || '—'}</span>
                          <div className="flex items-center gap-1 flex-wrap mt-0.5">
                            {tx.is_internal_transfer && !tx.linked_transfer_id && (
                              <span className="text-[10px] text-gray-400">{t.finances.internalTransfer}</span>
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
                              <span className="text-[10px] bg-gray-100 text-gray-500 rounded px-1.5 py-0.5 font-medium">{t.finances.excludedBadge}</span>
                            )}
                            {tx.reimbursement_group_id && (
                              <span className="text-[10px] bg-amber-50 text-amber-600 rounded px-1.5 py-0.5 font-medium">
                                {groups.find(g => g.id === tx.reimbursement_group_id)?.name ?? t.finances.reimbursementGroup}
                              </span>
                            )}
                            {/* Moment badges — only visible on mobile where the moment column is hidden */}
                            {tx.moments.length > 0 && tx.moments.map(m => (
                              <span
                                key={m.id}
                                className="md:hidden text-[10px] px-1 py-0.5 rounded-full font-medium cursor-pointer"
                                style={{ backgroundColor: m.color + '22', color: m.color }}
                                onClick={() => { setSelected(new Set([tx.id])); setShowMomentDropdown(true) }}
                                title={m.name}
                              >
                                {m.icon}
                              </span>
                            ))}
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
                              className="mt-1 w-full text-xs text-gray-500 border-b border-gray-300 bg-transparent outline-none placeholder-gray-300"
                            />
                          ) : tx.notes ? (
                            <span
                              className="block text-[11px] text-gray-400 italic mt-0.5 truncate cursor-pointer hover:text-gray-600"
                              onClick={() => { setEditingNotesId(tx.id); setNotesInput(tx.notes ?? '') }}
                            >{tx.notes}</span>
                          ) : null}
                        </td>
                        <td className={`px-2 sm:px-3 py-2.5 sm:py-3 text-right font-medium whitespace-nowrap text-xs sm:text-sm ${tx.amount < 0 ? 'text-red-600' : 'text-green-600'}`}>
                          {fmt(tx.amount, tx.currency)}
                        </td>
                        <td className="px-2 sm:px-3 py-2.5 sm:py-3 hidden sm:table-cell">
                          {editingId === tx.id ? (
                            <select
                              autoFocus
                              defaultValue={tx.category_id ?? ''}
                              onBlur={() => setEditingId(null)}
                              onChange={e => updateCategory(tx.id, e.target.value === '' ? null : Number(e.target.value))}
                              className="text-xs border border-gray-200 rounded px-2 py-1 max-w-[150px]"
                            >
                              <option value="">{t.finances.noCategory}</option>
                              {incomeCategories.length > 0 && (
                                <optgroup label="Renda">
                                  {incomeCategories.map(c => <option key={c.id} value={c.id}>{c.icon} {c.name}</option>)}
                                </optgroup>
                              )}
                              {expenseCategories.length > 0 && (
                                <optgroup label="Despesas">
                                  {expenseCategories.map(c => <option key={c.id} value={c.id}>{c.icon} {c.name}</option>)}
                                </optgroup>
                              )}
                            </select>
                          ) : (
                            <button onClick={() => setEditingId(tx.id)} className="flex items-center gap-1.5 group/cat">
                              {tx.finance_categories ? (
                                <span className="text-xs px-2 py-0.5 rounded-full font-medium" style={{ backgroundColor: tx.finance_categories.color + '22', color: tx.finance_categories.color }}>
                                  {tx.finance_categories.icon} {tx.finance_categories.name}
                                </span>
                              ) : (
                                <span className="text-xs text-gray-400 [@media(hover:hover)]:text-gray-300 group-hover/cat:text-gray-500 transition-colors">+ {t.finances.category}</span>
                              )}
                            </button>
                          )}
                        </td>
                        {/* Moment badge */}
                        <td className="px-2 sm:px-3 py-2.5 sm:py-3 hidden md:table-cell">
                          {tx.moments.length > 0 ? (
                            <div className="flex items-center gap-1 flex-wrap">
                              {tx.moments.map(m => (
                                <span
                                  key={m.id}
                                  className="text-xs px-2 py-0.5 rounded-full font-medium cursor-pointer hover:opacity-80"
                                  style={{ backgroundColor: m.color + '22', color: m.color }}
                                  onClick={() => { setSelected(new Set([tx.id])); setShowMomentDropdown(true) }}
                                >
                                  {m.icon} {m.name}
                                </span>
                              ))}
                            </div>
                          ) : (
                            <span
                              className="text-xs text-gray-400 [@media(hover:hover)]:text-gray-200 group-hover:text-gray-400 transition-colors cursor-pointer"
                              onClick={() => { setSelected(new Set([tx.id])); setShowMomentDropdown(true) }}
                            >—</span>
                          )}
                        </td>
                        <td className="px-1 sm:px-3 py-2.5 sm:py-3">
                          <div className={`flex items-center gap-0.5 transition-opacity ${tx.exclude_from_stats ? 'opacity-100' : '[@media(hover:none)]:opacity-100 opacity-0 group-hover:opacity-100'}`}>
                            {/* Note */}
                            <button
                              onClick={() => { setEditingNotesId(tx.id); setNotesInput(tx.notes ?? '') }}
                              title={t.finances.notesPlaceholder}
                              className={`p-1.5 rounded transition-colors ${tx.notes ? 'text-[#0D0D0D] hover:bg-[#0D0D0D]/10' : 'text-gray-300 hover:text-[#0D0D0D] hover:bg-[#0D0D0D]/10'}`}
                            >
                              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-4 h-4"><path d="M13.488 2.513a1.75 1.75 0 0 0-2.475 0L6.75 6.774a2.75 2.75 0 0 0-.596.892l-.471 1.179a.75.75 0 0 0 .98.98l1.179-.471a2.75 2.75 0 0 0 .892-.596l4.262-4.263a1.75 1.75 0 0 0 0-2.475ZM3.5 4.75A.75.75 0 0 1 4.25 4h3a.75.75 0 0 1 0 1.5h-3a.75.75 0 0 1-.75-.75Zm0 3A.75.75 0 0 1 4.25 7h1.5a.75.75 0 0 1 0 1.5h-1.5A.75.75 0 0 1 3.5 7.75ZM2 3.5A1.5 1.5 0 0 1 3.5 2h9A1.5 1.5 0 0 1 14 3.5V5a.75.75 0 0 1-1.5 0V3.5a.75.75 0 0 0-.75-.75h-9A.75.75 0 0 0 2 3.5V12a.75.75 0 0 0 .75.75H6a.75.75 0 0 1 0 1.5H2.75A1.5 1.5 0 0 1 2 12.75V3.5Z"/></svg>
                            </button>
                            {/* Exclude/include from stats */}
                            <button
                              onClick={() => toggleExclude(tx.id, tx.exclude_from_stats)}
                              title={tx.exclude_from_stats ? t.finances.includeInStats : t.finances.excludeFromStats}
                              className={`p-1.5 rounded transition-colors ${tx.exclude_from_stats ? 'text-amber-500 hover:text-amber-700 hover:bg-amber-50' : 'text-gray-300 hover:text-amber-500 hover:bg-amber-50'}`}
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
                              className={`p-1.5 rounded transition-colors ${tx.is_internal_transfer ? 'text-blue-500 hover:bg-blue-50' : 'text-gray-300 hover:text-blue-500 hover:bg-blue-50'}`}
                            >
                              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-4 h-4"><path fillRule="evenodd" d="M13.78 4.22a.75.75 0 0 1 0 1.06l-7.25 7.25a.75.75 0 0 1-1.06 0L2.22 9.28a.75.75 0 0 1 1.06-1.06L6 10.94l6.72-6.72a.75.75 0 0 1 1.06 0Z" clipRule="evenodd" /></svg>
                            </button>
                            {/* Delete */}
                            <button onClick={() => deleteTransaction(tx.id)} title="Excluir transação" className="p-1.5 rounded text-gray-300 hover:text-red-500 hover:bg-red-50 transition-colors">
                              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-4 h-4"><path fillRule="evenodd" d="M5 3.25V4H2.75a.75.75 0 0 0 0 1.5h.3l.815 8.15A1.5 1.5 0 0 0 5.357 15h5.285a1.5 1.5 0 0 0 1.493-1.35l.815-8.15h.3a.75.75 0 0 0 0-1.5H11v-.75A2.25 2.25 0 0 0 8.75 1h-1.5A2.25 2.25 0 0 0 5 3.25Zm2.25-.75a.75.75 0 0 0-.75.75V4h3v-.75a.75.75 0 0 0-.75-.75h-1.5ZM6.05 6a.75.75 0 0 1 .787.713l.275 5.5a.75.75 0 0 1-1.498.075l-.275-5.5A.75.75 0 0 1 6.05 6Zm3.9 0a.75.75 0 0 1 .712.787l-.275 5.5a.75.75 0 0 1-1.498-.075l.275-5.5a.75.75 0 0 1 .786-.712Z" clipRule="evenodd" /></svg>
                            </button>
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
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 flex items-center gap-3 bg-gray-900 text-white px-4 py-3 rounded-2xl shadow-2xl">
          <span className="text-sm font-medium">{selected.size} selecionada{selected.size > 1 ? 's' : ''}</span>
          <div className="w-px h-4 bg-white/20" />

          {/* Moment picker dropdown */}
          <div ref={momentDropdownRef} className="relative">
            <button
              onClick={() => setShowMomentDropdown(v => !v)}
              disabled={assigning}
              className="flex items-center gap-1.5 text-sm bg-white/10 hover:bg-white/20 transition-colors px-3 py-1.5 rounded-xl disabled:opacity-50"
            >
              <span>✨</span>
              {t.finances.assignMoment}
              <svg className={`w-3 h-3 transition-transform ${showMomentDropdown ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
              </svg>
            </button>

            {showMomentDropdown && (
              <div className="absolute bottom-full mb-2 left-0 bg-white rounded-xl shadow-xl border border-gray-100 py-1.5 min-w-[200px] z-50">
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
                        className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                      >
                        <span className="text-base">{m.icon}</span>
                        <span className="flex-1 text-left">{m.name}</span>
                        {allHave  && <span className="text-[10px] text-emerald-500 font-bold">✓ todos</span>}
                        {someHave && <span className="text-[10px] text-gray-400">− parcial</span>}
                      </button>
                    )
                  })
                )}
                <div className="border-t border-gray-100 mt-1 pt-1">
                  <button
                    onClick={() => bulkToggleMoment(null)}
                    className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-gray-400 hover:bg-gray-50 transition-colors"
                  >
                    <span>✕</span>
                    <span>{t.finances.noMoment}</span>
                  </button>
                </div>
              </div>
            )}
          </div>

          {accounts.length > 0 && (
            <>
              <div className="w-px h-4 bg-white/20" />
              <div className="relative">
                <button
                  onClick={() => setShowAccountAssign(v => !v)}
                  disabled={assigningAccount}
                  className="flex items-center gap-1.5 text-sm bg-white/10 hover:bg-white/20 transition-colors px-3 py-1.5 rounded-xl disabled:opacity-50"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-4 h-4"><path d="M14 3a1 1 0 0 0-1-1H3a1 1 0 0 0-1 1v2a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1V3ZM2 8a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v2a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V8Z"/></svg>
                  {assigningAccount ? 'Atribuindo...' : 'Conta'}
                  <svg className={`w-3 h-3 transition-transform ${showAccountAssign ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
                {showAccountAssign && (
                  <div className="absolute bottom-full mb-2 left-0 bg-white rounded-xl shadow-xl border border-gray-100 py-1.5 min-w-[180px] z-50">
                    <p className="px-4 py-1.5 text-[10px] text-gray-400 uppercase tracking-wide font-medium">Atribuir conta</p>
                    {accounts.map(a => (
                      <button
                        key={a.id}
                        onClick={() => bulkAssignAccount(a.id)}
                        className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                      >
                        <span>{a.icon}</span>
                        <span>{a.name}</span>
                      </button>
                    ))}
                    <div className="border-t border-gray-100 mt-1 pt-1">
                      <button
                        onClick={() => bulkAssignAccount(null)}
                        className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-gray-400 hover:bg-gray-50 transition-colors"
                      >
                        <span>✕</span>
                        <span>Remover conta</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </>
          )}

          <div className="w-px h-4 bg-white/20" />
          <button
            onClick={() => setShowGroupModal(true)}
            className="flex items-center gap-1.5 text-sm bg-white/10 hover:bg-white/20 transition-colors px-3 py-1.5 rounded-xl"
          >
            <span>↩</span>
            {t.finances.createReimbursementGroup}
          </button>
          {groups.length > 0 && (
            <div ref={groupPickerRef} className="relative">
              <button
                onClick={() => setShowGroupPicker(v => !v)}
                disabled={addingToGroup}
                className="flex items-center gap-1.5 text-sm bg-white/10 hover:bg-white/20 transition-colors px-3 py-1.5 rounded-xl disabled:opacity-50"
              >
                <span>+</span>
                {addingToGroup ? '…' : t.finances.addToGroup}
              </button>
              {showGroupPicker && (
                <div className="absolute bottom-full mb-1 left-0 min-w-[180px] bg-white rounded-xl shadow-lg border border-gray-100 py-1 z-50">
                  <p className="px-3 py-1.5 text-[11px] font-semibold text-gray-400 uppercase tracking-wide">{t.finances.addToGroupSelect}</p>
                  {groups.map(g => (
                    <button
                      key={g.id}
                      onClick={() => addToGroup(g.id)}
                      className="w-full text-left px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors truncate"
                    >
                      {g.name}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
          <div className="w-px h-4 bg-white/20" />
          <button
            onClick={() => setSelected(new Set())}
            className="text-sm text-white/60 hover:text-white transition-colors"
          >
            {t.common.cancel}
          </button>
        </div>
      )}

      {/* Reimbursement group modal */}
      {showGroupModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4" onClick={() => setShowGroupModal(false)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6" onClick={e => e.stopPropagation()}>
            <h3 className="font-semibold text-gray-900 mb-1">{t.finances.createReimbursementGroup}</h3>
            <p className="text-xs text-gray-400 mb-4">{selected.size} transação(ões) selecionada(s)</p>
            <input
              autoFocus
              value={groupName}
              onChange={e => setGroupName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && createReimbursementGroup()}
              placeholder={t.finances.reimbursementGroupNamePlaceholder}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#0D0D0D]/20 mb-4"
            />
            <div className="flex gap-2">
              <button
                onClick={createReimbursementGroup}
                disabled={savingGroup || !groupName.trim()}
                className="flex-1 bg-[#0D0D0D] text-white text-sm py-2 rounded-xl hover:opacity-80 transition-opacity disabled:opacity-40"
              >
                {savingGroup ? '…' : t.finances.createReimbursementGroup}
              </button>
              <button onClick={() => setShowGroupModal(false)} className="px-4 text-sm text-gray-500 hover:text-gray-700">{t.common.cancel}</button>
            </div>
          </div>
        </div>
      )}

      {/* Reimbursement groups management panel */}
      {csvStep === 'idle' && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <button
            onClick={() => setShowGroupHelp(v => !v)}
            className="w-full px-5 py-3 flex items-center gap-2 text-left hover:bg-gray-50 transition-colors"
          >
            <span className="text-sm font-semibold text-gray-700 flex-1">{t.finances.reimbursementGroup}</span>
            <span className="text-xs text-gray-400">{groups.length > 0 ? t.finances.reimbursementGroupCount.replace('{n}', String(groups.length)) : t.finances.reimbursementHowWorks}</span>
            <svg className={`w-4 h-4 text-gray-400 transition-transform ${showGroupHelp ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7"/></svg>
          </button>

          {showGroupHelp && (
            <div className="border-t border-gray-50">
              {/* Manual groups */}
              {(() => {
                const isAuto = (g: ReimbursementGroup) => g.name.startsWith('auto: ')
                const displayName = (g: ReimbursementGroup) => isAuto(g) ? g.name.slice(6) : g.name
                const manualGroups = groups.filter(g => !isAuto(g))
                const autoGroups   = groups.filter(g =>  isAuto(g))

                return (
                  <div className="divide-y divide-gray-50">
                    {manualGroups.length === 0 && autoGroups.length === 0 && (
                      <div className="px-5 py-4 space-y-3 text-sm text-gray-600">
                        <p dangerouslySetInnerHTML={{ __html: t.finances.reimbursementHelpBody }} />
                        <div className="bg-blue-50 rounded-xl p-3 text-xs text-blue-700 space-y-1">
                          <p className="font-semibold mb-1">{t.finances.reimbursementHelpTitle}</p>
                          <p>1. <span dangerouslySetInnerHTML={{ __html: t.finances.reimbursementHelpStep1 }} /></p>
                          <p>2. <span dangerouslySetInnerHTML={{ __html: t.finances.reimbursementHelpStep2 }} /></p>
                        </div>
                      </div>
                    )}

                    {manualGroups.map(g => (
                      <div key={g.id} className="px-5 py-3">
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
                              className="flex-1 text-sm font-medium border-b border-[#0D0D0D] bg-transparent outline-none"
                            />
                          ) : (
                            <button
                              onClick={() => { setEditingGroupId(g.id); setEditingGroupNameInput(g.name) }}
                              className="flex-1 text-sm font-medium text-gray-800 text-left hover:text-[#0D0D0D] transition-colors"
                              title="Clique para renomear"
                            >
                              {displayName(g)}
                            </button>
                          )}
                          <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${Math.abs(g.net) < 0.01 ? 'bg-gray-100 text-gray-500' : g.net > 0 ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-600'}`}>
                            {g.net >= 0 ? '+' : ''}{fmt(g.net, g.transactions[0]?.currency ?? 'EUR')}
                          </span>
                          <button
                            onClick={() => deleteGroup(g.id)}
                            title="Excluir grupo"
                            className="p-1 text-gray-300 hover:text-red-400 transition-colors"
                          >
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5"><path fillRule="evenodd" d="M5 3.25V4H2.75a.75.75 0 0 0 0 1.5h.3l.815 8.15A1.5 1.5 0 0 0 5.357 15h5.285a1.5 1.5 0 0 0 1.493-1.35l.815-8.15h.3a.75.75 0 0 0 0-1.5H11v-.75A2.25 2.25 0 0 0 8.75 1h-1.5A2.25 2.25 0 0 0 5 3.25Z" clipRule="evenodd"/></svg>
                          </button>
                        </div>
                        <div className="space-y-1">
                          {g.transactions.map(tx => (
                            <div key={tx.id} className="flex items-center gap-2 text-xs text-gray-500 pl-2">
                              <span className="text-gray-300">·</span>
                              <span className="flex-1 truncate">{tx.description}</span>
                              <span className={`font-medium ${tx.amount < 0 ? 'text-red-500' : 'text-emerald-600'}`}>{fmt(tx.amount, tx.currency)}</span>
                              <button
                                onClick={() => removeFromGroup(g.id, tx.id)}
                                title="Remover do grupo"
                                className="p-0.5 text-gray-200 hover:text-red-400 transition-colors"
                              >
                                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-3 h-3"><path d="M5.28 4.22a.75.75 0 0 0-1.06 1.06L6.94 8l-2.72 2.72a.75.75 0 1 0 1.06 1.06L8 9.06l2.72 2.72a.75.75 0 1 0 1.06-1.06L9.06 8l2.72-2.72a.75.75 0 0 0-1.06-1.06L8 6.94 5.28 4.22Z"/></svg>
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}

                    {autoGroups.length > 0 && (
                      <div className="px-5 py-3">
                        <button
                          onClick={() => setShowAutoGroups(v => !v)}
                          className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-gray-600 transition-colors"
                        >
                          <svg className={`w-3 h-3 transition-transform ${showAutoGroups ? 'rotate-90' : ''}`} fill="currentColor" viewBox="0 0 16 16"><path d="M6 3.5L10.5 8 6 12.5V3.5z"/></svg>
                          {showAutoGroups ? 'Ocultar' : 'Mostrar'} {autoGroups.length} grupo(s) auto-detectado(s)
                        </button>
                        {showAutoGroups && (
                          <div className="mt-3 divide-y divide-gray-50">
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
                                      className="flex-1 text-sm font-medium border-b border-[#0D0D0D] bg-transparent outline-none"
                                    />
                                  ) : (
                                    <button
                                      onClick={() => { setEditingGroupId(g.id); setEditingGroupNameInput(displayName(g)) }}
                                      className="flex-1 text-sm font-medium text-gray-500 text-left hover:text-[#0D0D0D] transition-colors flex items-center gap-1.5"
                                      title="Clique para renomear (remove a marcação automática)"
                                    >
                                      <span className="text-[10px] bg-gray-100 text-gray-400 rounded px-1 py-0.5 font-medium shrink-0">auto</span>
                                      {displayName(g)}
                                    </button>
                                  )}
                                  <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${Math.abs(g.net) < 0.01 ? 'bg-gray-100 text-gray-500' : g.net > 0 ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-600'}`}>
                                    {g.net >= 0 ? '+' : ''}{fmt(g.net, g.transactions[0]?.currency ?? 'EUR')}
                                  </span>
                                  <button onClick={() => deleteGroup(g.id)} title="Excluir grupo" className="p-1 text-gray-300 hover:text-red-400 transition-colors">
                                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5"><path fillRule="evenodd" d="M5 3.25V4H2.75a.75.75 0 0 0 0 1.5h.3l.815 8.15A1.5 1.5 0 0 0 5.357 15h5.285a1.5 1.5 0 0 0 1.493-1.35l.815-8.15h.3a.75.75 0 0 0 0-1.5H11v-.75A2.25 2.25 0 0 0 8.75 1h-1.5A2.25 2.25 0 0 0 5 3.25Z" clipRule="evenodd"/></svg>
                                  </button>
                                </div>
                                <div className="space-y-1">
                                  {g.transactions.map(tx => (
                                    <div key={tx.id} className="flex items-center gap-2 text-xs text-gray-500 pl-2">
                                      <span className="text-gray-300">·</span>
                                      <span className="flex-1 truncate">{tx.description}</span>
                                      <span className={`font-medium ${tx.amount < 0 ? 'text-red-500' : 'text-emerald-600'}`}>{fmt(tx.amount, tx.currency)}</span>
                                      <button onClick={() => removeFromGroup(g.id, tx.id)} title="Remover do grupo" className="p-0.5 text-gray-200 hover:text-red-400 transition-colors">
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

      {/* Import modal */}
      {showImportModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4"
          onClick={() => setShowImportModal(false)}
        >
          <div
            className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6"
            onClick={e => e.stopPropagation()}
          >
            <h3 className="font-semibold text-gray-900 mb-5">{t.finances.importStatement}</h3>

            {/* Account selector */}
            {accounts.length > 0 && (
              <div className="mb-4">
                <label className="block text-xs text-gray-500 mb-1.5">{t.finances.csvAccount}</label>
                <select
                  value={csvAccountId ?? ''}
                  onChange={e => setCsvAccountId(e.target.value === '' ? null : Number(e.target.value))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
                >
                  <option value="">{t.finances.csvAccountNone}</option>
                  {accounts.map(a => <option key={a.id} value={a.id}>{a.icon} {a.name}</option>)}
                </select>
              </div>
            )}

            {/* Currency */}
            <div className="mb-5">
              <label className="block text-xs text-gray-500 mb-1.5">{t.finances.csvCurrency}</label>
              <div className="flex gap-2">
                {['EUR', 'BRL', 'USD'].map(c => (
                  <button
                    key={c}
                    onClick={() => setCsvCurrency(c)}
                    className={`flex-1 py-2 text-sm font-medium rounded-lg border transition-colors ${
                      csvCurrency === c
                        ? 'bg-[#0D0D0D] text-white border-[#0D0D0D]'
                        : 'bg-white text-gray-600 border-gray-200 hover:border-[#0D0D0D] hover:text-[#0D0D0D]'
                    }`}
                  >
                    {c}
                  </button>
                ))}
              </div>
            </div>

            {/* Drop zone */}
            <div
              className="border-2 border-dashed border-gray-200 rounded-xl p-8 text-center cursor-pointer hover:border-[#0D0D0D] hover:bg-[#0D0D0D]/5 transition-colors"
              onClick={() => fileRef.current?.click()}
              onDragOver={e => { e.preventDefault(); e.stopPropagation() }}
              onDrop={e => {
                e.preventDefault(); e.stopPropagation()
                const f = e.dataTransfer.files?.[0]
                if (f) { setShowImportModal(false); handleCSVFile(f) }
              }}
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-8 h-8 text-gray-300 mx-auto mb-2">
                <path fillRule="evenodd" d="M11.47 2.47a.75.75 0 0 1 1.06 0l4.5 4.5a.75.75 0 0 1-1.06 1.06l-3.22-3.22V16.5a.75.75 0 0 1-1.5 0V4.81L8.03 8.03a.75.75 0 0 1-1.06-1.06l4.5-4.5ZM3 15.75a.75.75 0 0 1 .75.75v2.25a1.5 1.5 0 0 0 1.5 1.5h13.5a1.5 1.5 0 0 0 1.5-1.5V16.5a.75.75 0 0 1 1.5 0v2.25a3 3 0 0 1-3 3H5.25a3 3 0 0 1-3-3V16.5a.75.75 0 0 1 .75-.75Z" clipRule="evenodd" />
              </svg>
              <p className="text-sm text-gray-500 font-medium">{t.finances.csvDragFile}</p>
              <p className="text-xs text-gray-400 mt-1">{t.finances.csvClickToSelect}</p>
              <p className="text-[10px] text-gray-300 mt-2">{t.finances.csvFormats}</p>
            </div>

            <button
              onClick={() => setShowImportModal(false)}
              className="mt-4 w-full text-sm text-gray-400 hover:text-gray-600 transition-colors py-1"
            >
              {t.common.cancel}
            </button>
          </div>
        </div>
      )}

      {/* Add transaction modal */}
      {showAdd && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4" onClick={() => setShowAdd(false)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6" onClick={e => e.stopPropagation()}>
            <h3 className="font-semibold text-gray-900 mb-4">{t.finances.newTransaction}</h3>
            <div className="space-y-3">
              <div>
                <label className="block text-xs text-gray-500 mb-1">{t.common.date}</label>
                <input type="date" value={addDate} onChange={e => setAddDate(e.target.value)} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#0D0D0D]/20" />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">{t.common.description}</label>
                <input autoFocus value={addDesc} onChange={e => setAddDesc(e.target.value)} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#0D0D0D]/20" placeholder="Ex: Supermercado" />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">{t.common.value}</label>
                <div className="flex items-center gap-2">
                  <button onClick={() => setAddSign(s => s === '-' ? '+' : '-')} className={`px-2.5 py-2 rounded-lg text-sm font-bold border transition-colors ${addSign === '-' ? 'bg-red-50 border-red-200 text-red-600' : 'bg-green-50 border-green-200 text-green-600'}`}>
                    {addSign}
                  </button>
                  <select value={addCur} onChange={e => setAddCur(e.target.value)} className="border border-gray-200 rounded-lg px-2 py-2 text-sm">
                    {['EUR','BRL','USD'].map(c => <option key={c}>{c}</option>)}
                  </select>
                  <input type="number" step="0.01" min="0" value={addAmt} onChange={e => setAddAmt(e.target.value)} className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#0D0D0D]/20" placeholder="0.00" />
                </div>
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">{t.finances.categoryOptional}</label>
                <select value={addCat} onChange={e => setAddCat(e.target.value === '' ? '' : Number(e.target.value))} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm">
                  <option value="">{t.finances.noCategory}</option>
                  {catsForAmount(addSign === '+' ? 1 : -1).map(c => <option key={c.id} value={c.id}>{c.icon} {c.name}</option>)}
                </select>
              </div>
              {accounts.length > 0 && (
                <div>
                  <label className="block text-xs text-gray-500 mb-1">{t.finances.csvAccount}</label>
                  <select value={addAccountId ?? ''} onChange={e => setAddAccountId(e.target.value === '' ? null : Number(e.target.value))} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm">
                    <option value="">{t.finances.csvAccountNone}</option>
                    {accounts.map(a => <option key={a.id} value={a.id}>{a.icon} {a.name}</option>)}
                  </select>
                </div>
              )}
            </div>
            <div className="flex gap-2 mt-5">
              <button
                onClick={addTransaction}
                disabled={saving || !addDesc.trim() || !addAmt}
                className="flex-1 bg-[#0D0D0D] text-white text-sm py-2 rounded-xl hover:opacity-80 transition-opacity disabled:opacity-40"
              >
                {saving ? '…' : t.finances.addTransaction}
              </button>
              <button onClick={() => setShowAdd(false)} className="px-4 text-sm text-gray-500 hover:text-gray-700 transition-colors">{t.common.cancel}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
