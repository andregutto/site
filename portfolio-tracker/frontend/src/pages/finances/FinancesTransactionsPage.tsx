import { useState, useEffect, useCallback, useRef } from 'react'
import { apiFetch } from '../../lib/api'
import { useI18n } from '../../contexts/I18nContext'

interface Category { id: number; name: string; icon: string; color: string }
interface Transaction {
  id: number
  date: string
  description: string
  amount: number
  currency: string
  category_id: number | null
  finance_categories: Category | null
  is_internal_transfer: boolean
  source: string
}
interface ParsedRow {
  date: string
  description: string
  amount: number
  currency: string
  suggested_category: Category | null
  is_broker_transfer: boolean
  broker_name: string | null
  category_id?: number | null
}

function fmt(n: number, currency = 'EUR') {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency, minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n)
}
function fmtDate(d: string) {
  return new Date(d + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' })
}

function MonthPicker({ value, onChange }: { value: string; onChange: (m: string) => void }) {
  const months = Array.from({ length: 12 }, (_, i) => {
    const d = new Date()
    d.setDate(1)
    d.setMonth(d.getMonth() - i)
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
  })
  return (
    <select value={value} onChange={e => onChange(e.target.value)} className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm bg-white">
      {months.map(m => {
        const [y, mo] = m.split('-')
        return <option key={m} value={m}>{new Date(Number(y), Number(mo) - 1).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })}</option>
      })}
    </select>
  )
}

export default function FinancesTransactionsPage() {
  const { t } = useI18n()
  const today = new Date()
  const defaultMonth = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`

  const [month, setMonth]               = useState(defaultMonth)
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [categories, setCategories]     = useState<Category[]>([])
  const [loading, setLoading]           = useState(true)
  const [showAdd, setShowAdd]           = useState(false)
  const [csvStep, setCsvStep]           = useState<'idle' | 'preview' | 'importing'>('idle')
  const [csvRows, setCsvRows]           = useState<ParsedRow[]>([])
  const [csvError, setCsvError]         = useState('')
  const [csvCurrency, setCsvCurrency]   = useState('EUR')
  const fileRef = useRef<HTMLInputElement>(null)

  // Add form state
  const [addDate, setAddDate]       = useState(today.toISOString().split('T')[0])
  const [addDesc, setAddDesc]       = useState('')
  const [addAmt, setAddAmt]         = useState('')
  const [addSign, setAddSign]       = useState<'-' | '+'>('-')
  const [addCat, setAddCat]         = useState<number | ''>('')
  const [addCur, setAddCur]         = useState('EUR')
  const [saving, setSaving]         = useState(false)

  // Inline category edit
  const [editingId, setEditingId]   = useState<number | null>(null)

  const loadTransactions = useCallback(async () => {
    setLoading(true)
    try {
      const data = await apiFetch<Transaction[]>(`/finances/transactions?month=${month}`)
      setTransactions(data)
    } finally {
      setLoading(false)
    }
  }, [month])

  useEffect(() => {
    apiFetch<Category[]>('/finances/envelopes').catch(() => [])
    apiFetch<{ envelopes: { categories: Category[] }[] }>('/finances/budget')
      .then(d => {
        const cats = d.envelopes.flatMap(e => e.categories)
        setCategories(cats)
      })
      .catch(() => {})
  }, [])

  useEffect(() => { loadTransactions() }, [loadTransactions])

  async function addTransaction() {
    if (!addDesc.trim() || !addAmt || !addDate) return
    setSaving(true)
    try {
      const amount = parseFloat(addAmt) * (addSign === '-' ? -1 : 1)
      await apiFetch('/finances/transactions', {
        method: 'POST',
        body: JSON.stringify({ date: addDate, description: addDesc.trim(), amount, currency: addCur, category_id: addCat || null }),
      })
      setShowAdd(false)
      setAddDesc(''); setAddAmt(''); setAddCat('')
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
    await apiFetch(`/finances/transactions/${id}`, { method: 'PATCH', body: JSON.stringify({ category_id: categoryId }) })
    setEditingId(null)
    loadTransactions()
  }

  async function toggleInternal(id: number, current: boolean) {
    await apiFetch(`/finances/transactions/${id}`, { method: 'PATCH', body: JSON.stringify({ is_internal_transfer: !current }) })
    loadTransactions()
  }

  async function handleCSVFile(file: File) {
    setCsvError('')
    const text = await file.text()
    try {
      const result = await apiFetch<{ transactions: ParsedRow[]; total: number; error?: string }>(
        '/finances/transactions/csv-parse',
        { method: 'POST', body: JSON.stringify({ csv: text, currency: csvCurrency }) }
      )
      if (result.error) { setCsvError(result.error); return }
      setCsvRows(result.transactions.map(r => ({ ...r, category_id: r.suggested_category?.id ?? null })))
      setCsvStep('preview')
    } catch (e: unknown) {
      setCsvError(e instanceof Error ? e.message : 'Erro ao processar CSV')
    }
  }

  async function importCSV() {
    setCsvStep('importing')
    try {
      const result = await apiFetch<{ imported: number }>('/finances/transactions/csv-import', {
        method: 'POST',
        body: JSON.stringify({ transactions: csvRows.filter(r => !r.is_broker_transfer || r.category_id) }),
      })
      setCsvStep('idle')
      setCsvRows([])
      alert(`${result.imported} transação(ões) importada(s) com sucesso.`)
      loadTransactions()
    } catch {
      setCsvStep('preview')
    }
  }

  // Summary
  const expenses = transactions.filter(tx => tx.amount < 0 && !tx.is_internal_transfer).reduce((s, tx) => s + tx.amount, 0)
  const income   = transactions.filter(tx => tx.amount > 0 && !tx.is_internal_transfer).reduce((s, tx) => s + tx.amount, 0)

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">{t.finances.transactionsTitle}</h1>
          <p className="text-sm text-gray-400 mt-0.5">{t.finances.transactionsSubtitle}</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <MonthPicker value={month} onChange={setMonth} />
          <button
            onClick={() => { setCsvStep('idle'); setCsvRows([]); setCsvError(''); fileRef.current?.click() }}
            className="flex items-center gap-1.5 px-3 py-1.5 border border-gray-200 text-sm text-gray-600 rounded-lg hover:bg-gray-50 transition-colors"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-4 h-4"><path d="M8.75 2.75a.75.75 0 0 0-1.5 0v5.69L5.03 6.22a.75.75 0 0 0-1.06 1.06l3.5 3.5a.75.75 0 0 0 1.06 0l3.5-3.5a.75.75 0 0 0-1.06-1.06L8.75 8.44V2.75Z" /><path d="M3.5 9.75a.75.75 0 0 0-1.5 0v1.5A2.75 2.75 0 0 0 4.75 14h6.5A2.75 2.75 0 0 0 14 11.25v-1.5a.75.75 0 0 0-1.5 0v1.5c0 .69-.56 1.25-1.25 1.25h-6.5c-.69 0-1.25-.56-1.25-1.25v-1.5Z" /></svg>
            {t.finances.importCSV}
          </button>
          <button
            onClick={() => setShowAdd(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-[#001A70] text-white text-sm rounded-lg hover:opacity-80 transition-opacity"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-4 h-4"><path d="M8.75 3.75a.75.75 0 0 0-1.5 0v3.5h-3.5a.75.75 0 0 0 0 1.5h3.5v3.5a.75.75 0 0 0 1.5 0v-3.5h3.5a.75.75 0 0 0 0-1.5h-3.5v-3.5Z" /></svg>
            {t.finances.addTransaction}
          </button>
          <input ref={fileRef} type="file" accept=".csv,.txt" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) handleCSVFile(f); e.target.value = '' }} />
        </div>
      </div>

      {/* CSV currency selector */}
      {csvStep === 'idle' && (
        <div className="flex items-center gap-2 text-xs text-gray-500">
          <span>{t.finances.csvCurrency}</span>
          <select value={csvCurrency} onChange={e => setCsvCurrency(e.target.value)} className="border border-gray-200 rounded px-2 py-0.5 text-xs">
            {['EUR','BRL','USD'].map(c => <option key={c}>{c}</option>)}
          </select>
        </div>
      )}

      {/* CSV Error */}
      {csvError && (
        <div className="bg-red-50 border border-red-100 rounded-xl px-4 py-3 text-sm text-red-600">
          {csvError}
        </div>
      )}

      {/* CSV Preview */}
      {csvStep !== 'idle' && csvRows.length > 0 && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-50 flex items-center justify-between">
            <div>
              <h3 className="font-semibold text-gray-900 text-sm">{t.finances.csvPreview} — {csvRows.length} {t.finances.csvTransactions}</h3>
              <p className="text-xs text-gray-400 mt-0.5">{t.finances.csvReview}</p>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={() => { setCsvStep('idle'); setCsvRows([]) }} className="text-xs text-gray-500 hover:text-gray-700 transition-colors">{t.common.cancel}</button>
              <button
                onClick={importCSV}
                disabled={csvStep === 'importing'}
                className="px-3 py-1.5 bg-[#001A70] text-white text-xs rounded-lg hover:opacity-80 transition-opacity disabled:opacity-50"
              >
                {csvStep === 'importing' ? t.finances.csvImporting : t.finances.csvConfirm}
              </button>
            </div>
          </div>
          <div className="overflow-x-auto max-h-96 overflow-y-auto">
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
                {csvRows.map((row, i) => (
                  <tr key={i} className={row.is_broker_transfer ? 'bg-amber-50' : ''}>
                    <td className="px-4 py-2 text-gray-600 whitespace-nowrap">{fmtDate(row.date)}</td>
                    <td className="px-4 py-2 text-gray-700 max-w-xs truncate">
                      {row.is_broker_transfer && <span className="text-[10px] bg-amber-200 text-amber-800 rounded px-1 mr-1.5 font-medium">{t.finances.brokerTransfer}</span>}
                      {row.description}
                    </td>
                    <td className={`px-4 py-2 text-right font-medium whitespace-nowrap ${row.amount < 0 ? 'text-red-600' : 'text-green-600'}`}>
                      {fmt(row.amount, row.currency)}
                    </td>
                    <td className="px-4 py-2">
                      <select
                        value={row.category_id ?? ''}
                        onChange={e => {
                          const val = e.target.value === '' ? null : Number(e.target.value)
                          setCsvRows(prev => prev.map((r, j) => j === i ? { ...r, category_id: val } : r))
                        }}
                        className="text-xs border border-gray-200 rounded px-2 py-1 max-w-[150px]"
                      >
                        <option value="">{t.finances.noCategory}</option>
                        {categories.map(c => <option key={c.id} value={c.id}>{c.icon} {c.name}</option>)}
                      </select>
                    </td>
                    <td className="px-4 py-2">
                      <button onClick={() => setCsvRows(prev => prev.filter((_, j) => j !== i))} className="text-gray-300 hover:text-red-400 transition-colors">
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5"><path d="M5.28 4.22a.75.75 0 0 0-1.06 1.06L6.94 8l-2.72 2.72a.75.75 0 1 0 1.06 1.06L8 9.06l2.72 2.72a.75.75 0 1 0 1.06-1.06L9.06 8l2.72-2.72a.75.75 0 0 0-1.06-1.06L8 6.94 5.28 4.22Z" /></svg>
                      </button>
                    </td>
                  </tr>
                ))}
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
                    <th className="px-4 py-3 text-left">{t.common.date}</th>
                    <th className="px-4 py-3 text-left">{t.common.description}</th>
                    <th className="px-4 py-3 text-right">{t.common.value}</th>
                    <th className="px-4 py-3 text-left">{t.finances.category}</th>
                    <th className="px-4 py-3"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {transactions.map(tx => (
                    <tr key={tx.id} className={`hover:bg-gray-50 group ${tx.is_internal_transfer ? 'opacity-50' : ''}`}>
                      <td className="px-4 py-3 text-gray-500 whitespace-nowrap">{fmtDate(tx.date)}</td>
                      <td className="px-4 py-3 text-gray-800 max-w-xs">
                        <span className="truncate block">{tx.description || '—'}</span>
                        {tx.is_internal_transfer && <span className="text-[10px] text-gray-400">{t.finances.internalTransfer}</span>}
                      </td>
                      <td className={`px-4 py-3 text-right font-medium whitespace-nowrap ${tx.amount < 0 ? 'text-red-600' : 'text-green-600'}`}>
                        {fmt(tx.amount, tx.currency)}
                      </td>
                      <td className="px-4 py-3">
                        {editingId === tx.id ? (
                          <select
                            autoFocus
                            defaultValue={tx.category_id ?? ''}
                            onBlur={e => updateCategory(tx.id, e.target.value === '' ? null : Number(e.target.value))}
                            onChange={e => updateCategory(tx.id, e.target.value === '' ? null : Number(e.target.value))}
                            className="text-xs border border-gray-200 rounded px-2 py-1 max-w-[150px]"
                          >
                            <option value="">{t.finances.noCategory}</option>
                            {categories.map(c => <option key={c.id} value={c.id}>{c.icon} {c.name}</option>)}
                          </select>
                        ) : (
                          <button
                            onClick={() => setEditingId(tx.id)}
                            className="flex items-center gap-1.5 group/cat"
                          >
                            {tx.finance_categories ? (
                              <span className="text-xs px-2 py-0.5 rounded-full font-medium" style={{ backgroundColor: tx.finance_categories.color + '22', color: tx.finance_categories.color }}>
                                {tx.finance_categories.icon} {tx.finance_categories.name}
                              </span>
                            ) : (
                              <span className="text-xs text-gray-300 group-hover/cat:text-gray-500 transition-colors">+ {t.finances.category}</span>
                            )}
                          </button>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button
                            onClick={() => toggleInternal(tx.id, tx.is_internal_transfer)}
                            title={tx.is_internal_transfer ? 'Marcar como transação real' : 'Marcar como transferência interna'}
                            className="p-1 text-gray-300 hover:text-amber-500 transition-colors rounded"
                          >
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5"><path fillRule="evenodd" d="M13.78 4.22a.75.75 0 0 1 0 1.06l-7.25 7.25a.75.75 0 0 1-1.06 0L2.22 9.28a.75.75 0 0 1 1.06-1.06L6 10.94l6.72-6.72a.75.75 0 0 1 1.06 0Z" clipRule="evenodd" /></svg>
                          </button>
                          <button onClick={() => deleteTransaction(tx.id)} className="p-1 text-gray-300 hover:text-red-500 transition-colors rounded">
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5"><path fillRule="evenodd" d="M5 3.25V4H2.75a.75.75 0 0 0 0 1.5h.3l.815 8.15A1.5 1.5 0 0 0 5.357 15h5.285a1.5 1.5 0 0 0 1.493-1.35l.815-8.15h.3a.75.75 0 0 0 0-1.5H11v-.75A2.25 2.25 0 0 0 8.75 1h-1.5A2.25 2.25 0 0 0 5 3.25Zm2.25-.75a.75.75 0 0 0-.75.75V4h3v-.75a.75.75 0 0 0-.75-.75h-1.5ZM6.05 6a.75.75 0 0 1 .787.713l.275 5.5a.75.75 0 0 1-1.498.075l-.275-5.5A.75.75 0 0 1 6.05 6Zm3.9 0a.75.75 0 0 1 .712.787l-.275 5.5a.75.75 0 0 1-1.498-.075l.275-5.5a.75.75 0 0 1 .786-.712Z" clipRule="evenodd" /></svg>
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
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
                <input type="date" value={addDate} onChange={e => setAddDate(e.target.value)} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#001A70]/20" />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">{t.common.description}</label>
                <input autoFocus value={addDesc} onChange={e => setAddDesc(e.target.value)} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#001A70]/20" placeholder="Ex: Supermercado" />
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
                  <input type="number" step="0.01" min="0" value={addAmt} onChange={e => setAddAmt(e.target.value)} className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#001A70]/20" placeholder="0.00" />
                </div>
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">{t.finances.categoryOptional}</label>
                <select value={addCat} onChange={e => setAddCat(e.target.value === '' ? '' : Number(e.target.value))} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm">
                  <option value="">{t.finances.noCategory}</option>
                  {categories.map(c => <option key={c.id} value={c.id}>{c.icon} {c.name}</option>)}
                </select>
              </div>
            </div>
            <div className="flex gap-2 mt-5">
              <button
                onClick={addTransaction}
                disabled={saving || !addDesc.trim() || !addAmt}
                className="flex-1 bg-[#001A70] text-white text-sm py-2 rounded-xl hover:opacity-80 transition-opacity disabled:opacity-40"
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
